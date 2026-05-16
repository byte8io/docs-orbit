---
sidebar_position: 2
title: orbit-agent init
description: One-shot setup — registers the agent, builds the deploy tree, writes config. Handles greenfield and migration from a legacy single-directory install.
---

# `orbit-agent init`

The meat of agent onboarding. One command does:

- **Preflight checks** — PHP version parity (vs `composer.lock` when `--magento-source` is given), Composer Marketplace `auth.json` presence, php-fpm socket detection. Warnings only; `init` proceeds regardless and surfaces them in the summary.
- **Builds the Capistrano deploy tree** — `releases/`, `shared/`, `current` placeholder.
- **Seeds `shared/nginx.conf`** from a bundled Magento 2.4.x sample (greenfield) or copies the existing one (migration).
- **Sets group ownership + setgid** on the whole `deploy_path/` tree so php-fpm has read access everywhere. Executable bits on files (`bin/magento`, hook scripts) are preserved.
- **Writes config** to `~/orbit-agent.env`.
- **Registers with the control plane** using the token.
- **Prints a ready-to-paste nginx vhost snippet** with the detected php-fpm socket path.

## Greenfield (recommended for a new install)

The first dashboard-triggered deploy clones the repo into the first release dir; `init` just creates the skeleton.

```bash
orbit-agent init \
  --token       obt_... \
  --server-url  https://orbit.byte8.io \
  --deploy-path /var/www/magento \
  --web-user    www-data
```

Output ends with an "init complete" summary, the nginx snippet, and follow-up instructions.

## Migrating an existing install

If you already have a Magento install at, say, `/var/www/legacy-magento`, point `init` at it with `--magento-source`. `init` moves `app/etc/env.php`, `pub/media/`, `var/{log,session,backups,…}` into `shared/`, copies the codebase into `releases/{TIMESTAMP}/`, symlinks shared dirs in, and activates `current → releases/{TIMESTAMP}/`.

```bash
orbit-agent init \
  --token        obt_... \
  --server-url   https://orbit.byte8.io \
  --deploy-path  /var/www/magento \
  --magento-source /var/www/legacy-magento \
  --web-user     www-data
```

nginx still points at the legacy path after `init` — updating the vhost (to `/var/www/magento/current/pub`) is the actual cutover. Until you do, your legacy install keeps serving traffic; the new tree is staged but inert.

### The rename trick — keep the same path

You'll often want the final tree at the same path you're currently serving from. `cp -a` refuses to copy a directory into a sub-directory of itself, so you can't pass the same path for both `--deploy-path` and `--magento-source`. The pattern:

```bash
sudo mv /var/www/magento /var/www/magento.legacy
sudo mkdir -p /var/www/magento
sudo chown $USER:$USER /var/www/magento

orbit-agent init \
  --deploy-path  /var/www/magento \
  --magento-source /var/www/magento.legacy \
  ...
```

nginx vhost stays unchanged (still `/var/www/magento/current/pub`). Once you've verified a deploy works: `sudo rm -rf /var/www/magento.legacy`.

Proper in-place migration support inside `init` is on the roadmap.

## Re-running `init` on an existing tree

From `v0.3.3+`, `init` is **deployment-aware**: it detects an existing `releases/` + `current` tree and runs in **register-only mode**. Refreshes `~/orbit-agent.env`, re-registers with the server, but doesn't touch `releases/` or the live `current` symlink. Useful when:

- You've upgraded the agent and want the env file's variables re-emitted (new versions add new vars; old vars get sensible defaults)
- You're rotating the token
- You're pointing at a different control plane URL

```bash
orbit-agent init \
  --token       obt_... \
  --server-url  https://orbit.byte8.io \
  --deploy-path /var/www/magento \
  --web-user    www-data
```

If you really want a destructive full re-init (rebuilds the initial release from `--magento-source`, swaps `current` to it — only do this when you genuinely mean to start the deploy history over):

```bash
orbit-agent init --force ...same args as above...
```

## Flag reference

| Flag | Required | Description |
|---|---|---|
| `--token` | yes (first run) | Agent token from the dashboard. Format `obt_<64 hex>`. Shown once on creation. |
| `--server-url` | yes (first run) | Control plane URL. `https://orbit.byte8.io` for SaaS. |
| `--deploy-path` | yes | Absolute path where the deploy tree lives. Must already exist + be writable by the deploy user. |
| `--web-user` | recommended | The user PHP-FPM runs as (`www-data`, `nginx`, `php-fpm`). Used for group ownership. Defaults to `www-data` if omitted. |
| `--magento-source` | migration only | Path to the existing Magento install. `init` copies its codebase + extracts shared state. |
| `--force` | no | Destructive re-init — rebuilds initial release even if the tree exists. |
| `--skip-perms` | no | Don't run the chgrp/chmod pass. Use only when you've already set up permissions and want `init` to leave the tree untouched. |
| `--skip-nginx` | no | Don't seed `shared/nginx.conf`. Use when you manage the include file out-of-band. |

## What ends up where

```
{deploy-path}/
├── releases/                    ← empty until first deploy (greenfield) or has initial release (migration)
├── shared/
│   ├── app/etc/env.php          ← migrated from --magento-source, never overwritten
│   ├── app/etc/config.php       ← optional; agent links it per-release if present
│   ├── nginx.conf               ← seeded from sample (greenfield) or legacy install (migration)
│   ├── pub/media/               ← user uploads
│   └── var/{log,session,...}    ← persistent vars
└── current                      ← symlink (greenfield: missing until first deploy)

~/orbit-agent.env                ← agent config (ORBIT_SERVER_URL, ORBIT_AGENT_TOKEN, etc.)
```

`init` does not start the agent. See [systemd](/docs/agent/systemd) or [logs](/docs/agent/logs) for that.

## Preflight warnings

`init` warns (doesn't fail) on:

- **PHP version drift** — the host's PHP differs from `composer.lock`'s `platform.php`. Magento's `composer install` will fail later if you don't pin or upgrade.
- **No Composer Marketplace creds** — `~/.composer/auth.json` missing. Fine if your composer.json doesn't reference `repo.magento.com`; otherwise the first deploy fails on auth.
- **No PHP-FPM socket detected** — `init` couldn't find a running PHP-FPM. The vhost snippet won't have the right socket path; you'll have to edit it manually.

Address the warnings before the first deploy.
