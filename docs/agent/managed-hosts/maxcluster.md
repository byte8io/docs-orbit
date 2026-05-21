---
sidebar_position: 2
title: Maxcluster
description: Install orbit-agent on Maxcluster's managed Magento hosting. Supervisor for the agent process, cluster-control for PHP-FPM reload, no sudo required.
---

# Maxcluster

:::info Status
Maxcluster support targets `orbit-agent v0.7.0`. The flags described below (`--host-profile`, `--pa-token`, `--maxcluster-cluster`, `--maxcluster-server`) are not yet implemented. This page documents the target onboarding flow so prospective customers can validate the shape before we ship.
:::

[Maxcluster](https://maxcluster.de/) is one of the largest managed-Magento hosting providers in DACH. Customers SSH in as an unprivileged user (`m12345`-style), with PHP-FPM and nginx managed centrally via the [`app.maxcluster.de`](https://app.maxcluster.de/) panel. There's no root and no `/etc/` write — orbit-agent runs under Supervisor and shells out to `cluster-control` for service reloads.

This page assumes you've already onboarded a Magento install on Maxcluster and have working SSH access. If not, that's a Maxcluster support task — Orbit doesn't provision the OS or the initial install.

## Prerequisites checklist

Before running `orbit-agent init`, line these up via the Maxcluster panel or a support ticket:

- [ ] **Supervisor activated** for your customer account ([Maxcluster KB: Installation von Supervisor](https://knowledge.maxcluster.de/installation-von-supervisor-im-managed-center))
- [ ] **Personal API token** — generate one in `app.maxcluster.de` → API. Minimum scope: `php:restart`. Format: `pa_...`
- [ ] **Your cluster + server identifiers** — visible in the Maxcluster panel (e.g. cluster `C-999`, server `srv-a`)
- [ ] **Deploy path decided** — conventionally `/srv/<customer>/htdocs/<store-key>/`, freshly created and empty
- [ ] **SSH deploy key** added to your repo's GitHub deploy keys (same as self-hosted — `cat ~/.ssh/id_ed25519.pub`)
- [ ] **`~/.config/composer/auth.json`** populated with your Magento Marketplace credentials

Smoke-test that `cluster-control` works as your SSH user before touching orbit:

```bash
cluster-control login --pa_token="$PA_TOKEN"
cluster-control php:restart C-999 srv-a
cluster-control logout
```

If any of those fail, fix that with Maxcluster support before continuing — orbit-agent can't recover from a broken control plane.

## Install + initialise

The one-liner from [Install the agent](/docs/agent/install) works as-is on Maxcluster. It falls back to `~/.local/bin/orbit-agent` when not run as root, and Supervisor will find it there.

```bash
curl -fsSL https://get.byte8.io/orbit-agent | sh
orbit-agent --version
```

Then run `init` with the Maxcluster profile:

```bash
orbit-agent init \
  --host-profile          maxcluster \
  --token                 obt_... \
  --server-url            https://orbit.byte8.io \
  --deploy-path           /srv/<customer>/htdocs/<store-key> \
  --pa-token              pa_... \
  --maxcluster-cluster    C-999 \
  --maxcluster-server     srv-a
```

What this does, differently from `--host-profile=self-hosted`:

- **Builds the deploy tree under your home** — no `sudo chown` / `chmod 2775` step. The directory perms inherit from your user, which is what php-fpm runs as on Maxcluster anyway.
- **Writes a Supervisor conf** to `~/etc/supervisor/conf.d/orbit-agent.conf` instead of a systemd unit.
- **Defaults `ORBIT_FPM_RELOAD_CMD`** to `cluster-control php:restart C-999 srv-a` in `~/orbit-agent.env`. The agent will run this command after each successful deploy to reload OPcache on the new release.
- **Stores the PA token** in `~/orbit-agent.env` (mode 0600) so the agent can `cluster-control login` on startup.
- **Prints panel instructions** for the vhost docroot rather than nginx config to paste.

## Start the agent under Supervisor

```bash
supervisorctl reread     # discover the new conf file
supervisorctl update     # load it
supervisorctl start orbit-agent
supervisorctl status     # orbit-agent  RUNNING   pid 12345, uptime 0:00:05
```

Tail the log:

```bash
tail -F ~/var/log/orbit-agent.log
# or via orbit-agent's wrapper, which auto-picks the right backend per host profile:
orbit-agent logs
```

In the Orbit dashboard, the environment row should flip to **online** with a recent `last_seen_at` within a couple seconds.

## Vhost configuration (one-time, via Maxcluster support)

Open a Maxcluster ticket asking them to:

1. Point the vhost for your domain at document root `<deploy-path>/current/pub`
2. Include the orbit-managed `<deploy-path>/shared/nginx.conf` snippet inside the server block
3. Confirm the PHP version matches your `composer.lock` platform requirement

Template ticket text:

> Hallo, könnten Sie bitte den Vhost für `mystore.example.com` auf Cluster `C-999`, Server `srv-a` wie folgt konfigurieren:
>
> - **Document root:** `/srv/<customer>/htdocs/<store-key>/current/pub`
> - **nginx include:** `/srv/<customer>/htdocs/<store-key>/shared/nginx.conf` innerhalb des `server` blocks
> - **PHP version:** 8.3 (oder die Version aus unserer `composer.lock`)
>
> Der `current` symlink wird vom orbit-agent bei jedem Deploy gewechselt; beide Pfade sind nach dem ersten Deploy stabil.

Once Maxcluster confirms, trigger your first deploy from the Orbit dashboard. From this point on, every subsequent deploy runs unattended — no further panel work or tickets.

## Upgrading the agent

```bash
orbit-agent self-upgrade
supervisorctl restart orbit-agent
orbit-agent --version
```

No sudo. From `v0.7.0+`, `orbit-agent self-upgrade --restart` will detect the Maxcluster profile and run the `supervisorctl restart` automatically — single command, zero privilege.

## How OPcache reset works on each deploy

After the symlink swap, the agent runs `$ORBIT_FPM_RELOAD_CMD`. On Maxcluster, that's:

```bash
cluster-control php:restart C-999 srv-a
```

This reloads all PHP-FPM workers for your cluster + server, which clears Magento's compiled DI factories, autoload class maps, and OPcache. Without this step, Magento would keep serving the previous release's compiled code for up to `opcache.revalidate_freq` seconds — typically minutes — which defeats atomic releases.

If you want to verify it ran, the agent log shows:

```
INFO orbit_agent::executor: fpm reload command exit=0 cmd="cluster-control php:restart C-999 srv-a"
```

If `ORBIT_FPM_RELOAD_CMD` is left empty in `~/orbit-agent.env`, the agent skips the reload. You'd only do that intentionally — Maxcluster's default OPcache settings make this required for correctness.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `cluster-control: command not found` during init | Maxcluster CLI not on `$PATH` | `which cluster-control` — usually `/usr/local/bin/`; if missing entirely, open a support ticket |
| Agent registers but FPM reload fails on deploy | PA token expired or scoped too narrowly | Re-generate the token in `app.maxcluster.de` → API; update `ORBIT_MAXCLUSTER_PA_TOKEN` in `~/orbit-agent.env`; `supervisorctl restart orbit-agent` |
| `supervisorctl: command not found` | Supervisor not yet activated on your account | Open a Maxcluster ticket — see [their KB article](https://knowledge.maxcluster.de/installation-von-supervisor-im-managed-center) |
| Deploy completes successfully but storefront still serves old code | OPcache not flushed | Confirm `cluster-control php:restart` ran successfully in the agent log; if it failed, fix the PA token / cluster ID and redeploy |
| `Permission denied` on deploy path during init | Deploy path is outside your home / `/srv/<customer>/` tree | Move to `/srv/<customer>/htdocs/...`; rerun init |
| Storefront 502 after first deploy | Maxcluster hasn't pointed the vhost at `<deploy-path>/current/pub` yet | Open the vhost ticket above; until then the deploy tree exists but no nginx server is routing to it |
| `cluster-control login` returns "Session expired" mid-deploy | Token TTL shorter than your deploy duration | Agent will auto-relogin from `v0.7.0+`; until then, configure a longer session TTL with Maxcluster support |

## What's different from self-hosted

| Concern | Self-hosted | Maxcluster |
|---|---|---|
| Process supervisor | systemd | Supervisor |
| Restart command | `sudo systemctl restart orbit-agent` | `supervisorctl restart orbit-agent` |
| FPM reload | `sudo systemctl reload php-fpm` (sudoers carve-out) | `cluster-control php:restart C-999 srv-a` |
| nginx vhost | Edit `/etc/nginx/sites-available/<store>.conf` | Maxcluster support ticket (one-time) |
| Deploy path convention | `/var/www/<store>/` (root pre-creates) | `/srv/<customer>/htdocs/<store>/` (you create) |
| Log backend | `journalctl -u orbit-agent` | `tail -F ~/var/log/orbit-agent.log` |
| `~/.config/composer/auth.json` | Standard | Standard (works the same) |
| SSH deploy keys | Standard | Standard (works the same) |

## What's the same

- Same deploy pipeline. `git clone` → `composer install` → `setup:upgrade` (conditional) → `di:compile` → `static-content:deploy` → symlink swap → health check.
- Same `~/orbit-agent.env`, same dashboard, same GraphQL API.
- Same `orbit-agent self-upgrade`, `orbit-agent logs`, `orbit-agent deploy` subcommands.
- Same atomic-release tree (`releases/`, `shared/`, `current` symlink).
- Same auto-rollback on health-check failure.
- Same drift detection, maintenance-mode rules, allowlist-IP behaviour.

## Day-to-day after onboarding

Identical to self-hosted: click **Deploy** in the dashboard, or `ssh <maxcluster> 'orbit-agent deploy --type full'` from your laptop or CI. The Supervisor + cluster-control plumbing is invisible after the first install.

## Related

- [Managed hosts overview](/docs/agent/managed-hosts/overview) — the host-profile concept in general
- [`orbit-agent init`](/docs/agent/init) — full flag reference
- [Self-upgrade](/docs/agent/self-upgrade) — keep the agent current
