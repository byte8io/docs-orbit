---
sidebar_position: 1
title: Managed hosts overview
description: Run orbit-agent on shared / managed Magento hosting (Maxcluster, Cloudways, Hetzner Managed) where you don't have sudo, systemd, or /etc/ write access.
---

# Managed hosts overview

:::info Status
Managed-host profiles are in active development. The flags and recipes below describe the target shape; Maxcluster is the first profile being implemented and lands in `v0.7.0`. Until then, this page is a design preview — get in touch if you'd like to be a launch customer.
:::

The standard [orbit-agent install](/docs/agent/install) and [systemd setup](/docs/agent/systemd) assume a Linux VPS where the deploy user can run `sudo systemctl …` and write to `/etc/`. That's the right model for self-managed hosting (DigitalOcean droplets, Hetzner Cloud, your own metal, AWS EC2).

**Managed Magento hosting is fundamentally different.** On Maxcluster, Cloudways, Hetzner Managed, Plesk-based hosts, and similar, the customer SSHes in as a regular unprivileged user. There's no root, no sudoers carve-out, no writing to `/etc/systemd/`, and nginx + PHP-FPM configs are managed centrally by the provider's panel. The whole onboarding flow has to be rewritten without privileged ops.

Orbit handles this via a **host profile**: a flag on `orbit-agent init` (or auto-detected from the environment) that swaps which steps run, which process supervisor manages the agent, and which CLI is used to reload PHP-FPM.

## Supported host profiles

| Profile | Process supervisor | FPM reload | Vhost config | Status |
|---|---|---|---|---|
| `self-hosted` (default) | systemd | `sudo systemctl reload php-fpm` (via sudoers carve-out) | Edit `/etc/nginx/sites-available/...` directly | Stable since v0.3.0 |
| [`maxcluster`](/docs/agent/managed-hosts/maxcluster) | Supervisor (per-user) | `cluster-control php:restart` | Maxcluster panel / support ticket | Target v0.7.0 |
| `cloudways`, `plesk`, `cpanel`, ... | — | — | — | Not yet — open an issue or get in touch if you need one |

Auto-detection: if you don't pass `--host-profile`, `orbit-agent init` probes the environment. `command -v cluster-control` resolving → `maxcluster`. Future profiles will add their own probes. The flag is an escape hatch for cases where probing is wrong.

## What changes on a managed-host profile

Concretely, when `--host-profile` is anything other than `self-hosted`:

1. **No `/var/www/` chown/setgid step.** The deploy path lives somewhere under your home directory (e.g. `/srv/<customer>/htdocs/<store-key>/`), where you already have full write access. The group is already correct.
2. **No systemd unit.** Replaced by Supervisor (or the provider's equivalent). Restarting the agent is `supervisorctl restart orbit-agent` — no sudo.
3. **No `/etc/sudoers.d/orbit-deploy` carve-out.** PHP-FPM reload goes through the provider's CLI or API, sourced from `$ORBIT_FPM_RELOAD_CMD` in `~/orbit-agent.env`.
4. **The nginx vhost is not your file to edit.** `orbit-agent init` prints docroot + include lines to send to the provider via ticket/panel; it doesn't try to write the file.
5. **`orbit-agent logs` reads a tail-able file** (`~/var/log/orbit-agent.log`) instead of `journalctl`, since you don't have a journal namespace on managed hosts.

## Picking a deploy path on managed hosting

Managed hosts give you a single home tree to work inside. The deploy path needs to be:

- Under your home, or under the doc-root the provider has assigned you (e.g. `/srv/<customer>/htdocs/`)
- Empty or non-existent at first run (`orbit-agent init` creates `releases/`, `shared/`, `current` inside it)
- The path the provider's nginx vhost will eventually serve from (`<deploy-path>/current/pub`)

For Maxcluster the conventional choice is `/srv/<customer>/htdocs/<store-key>/` — see the [Maxcluster](/docs/agent/managed-hosts/maxcluster) page for the exact recipe.

## What you still need from the provider

Two one-time asks per managed-host install:

1. **Activate Supervisor on your account** (or equivalent) if not already on. Each provider has a different process — Maxcluster's [KB article](https://knowledge.maxcluster.de/installation-von-supervisor-im-managed-center) walks through it.
2. **Point your nginx vhost docroot at `<deploy-path>/current/pub`** and include the orbit-managed `<deploy-path>/shared/nginx.conf` snippet. On Maxcluster this is a support ticket; on Cloudways it'd be a panel form.

These are not ongoing requirements — they're set once at onboarding, then every subsequent deploy runs without touching the provider.

## When to skip a host profile

If your provider gives full root access to a VPS (Hetzner Cloud, AWS EC2, DigitalOcean, bare metal), use `--host-profile=self-hosted` (the default) and follow the [standard onboarding](/docs/getting-started/quick-start). The managed-host profiles trade flexibility (you can't customise the nginx config in-place) for security and tight integration with the provider's stack — that's only worth doing when you have to.

## What's the same regardless of profile

- Same deploy pipeline. `git clone` → `composer install` → `setup:upgrade` (conditional) → `di:compile` → `static-content:deploy` → symlink swap → health check.
- Same `~/orbit-agent.env`, same Orbit dashboard, same GraphQL API.
- Same `orbit-agent self-upgrade`, `orbit-agent logs`, `orbit-agent deploy` subcommands.
- Same atomic-release tree on disk (`releases/`, `shared/`, `current` symlink).
- Same auto-rollback on health-check failure, same drift detection, same maintenance-mode rules.

The host profile only changes _how the agent gets installed and runs_, not _what it does_.
