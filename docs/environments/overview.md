---
sidebar_position: 1
title: Environments
description: An Environment in Orbit is one (host + deploy path + repo + branch) tuple. Each environment has its own agent token, deployment history, and config flags.
---

# Environments

An **environment** in Orbit is one (host + deploy path + repo + branch) tuple. Each environment has:

- A unique ID
- One or more agent tokens
- Its own deployment history
- Per-environment config flags (maintenance behaviour, health-check URL, releases-to-keep, sync settings)

Common shapes:

| Setup | Environments |
|---|---|
| Single prod host | `Production` |
| Prod + staging | `Production`, `Staging` |
| Blue-green | `Production-Blue`, `Production-Green` |
| Per-region | `Production-EU`, `Production-US` |
| Per-customer SaaS shard | `Customer-A`, `Customer-B`, ... |

Each environment runs its own `orbit-agent` instance on its own host. The control plane fans tasks out per-environment.

## Creating an environment

Dashboard → **Environments → New Environment**. Required fields:

| Field | Description |
|---|---|
| Name | Human label. Used in the UI and in `orbit-agent logs`. |
| Host | Display-only — the control plane never SSHes into it. Used as a memory aid in the UI. |
| Deploy Path | Absolute path on the host where `releases/`, `shared/`, and `current` live. Pre-create it with the right permissions (see [host installation](/docs/getting-started/installation#deploy-path--permissions)). |
| Repository URL | Git URL the agent will clone from. Usually `git@github.com:org/repo.git` so the agent uses its SSH key. |
| Deploy Branch | Default ref to deploy. Can be overridden per-deploy. |
| Health Check URL | URL the agent hits after the symlink swap. Non-2xx triggers [auto-rollback](/docs/deployments/rollback). |
| Releases to Keep | How many `releases/{TIMESTAMP}/` directories to retain. Older ones are pruned after each successful deploy. Default `5`. |

Optional:

| Field | Default | When to change |
|---|---|---|
| Shared dirs | Magento defaults (see [shared-dirs](/docs/environments/shared-dirs)) | Custom shared paths (GeoIP DBs, custom upload dirs) |
| Shared files | Magento defaults | Custom shared config files |
| `always_enable_maintenance` | `false` | Always flip 503 for the whole deploy window. See [maintenance window → always](/docs/zero-downtime/maintenance-window#always) |
| `maintenance_on_drift` | `false` | Flip 503 even when only module registration changed | See [drift detection](/docs/zero-downtime/drift-detection) |
| `maintenance_allowlist_ips` | empty | Newline-separated IPs that bypass the 503 during maintenance. See [allowlist IPs](/docs/zero-downtime/allowlist-ips) |
| `config_import_enabled` | `false` | Run `bin/magento app:config:import` between `setup:upgrade` and swap. See [config import](/docs/zero-downtime/config-import) |
| `manage_cron_and_consumers` | `false` | Kill cron + queue-consumer processes before each deploy. Avoids stale-class fatals after `setup:upgrade` |

## What an environment owns

```
{environment_id}
├── agent_tokens[]
├── deployments[]
│   └── (each has: type, version, git_ref, status, maintenance_window, started_at, completed_at, ...)
└── config (above flags)
```

User-scoped — environments are owned by the Byte8 user who created them. Multi-user team sharing is on the roadmap; today, share via Personal Access Tokens for the GraphQL API.

## Updating an environment

Dashboard → environment page → Edit. Changes take effect on the **next deploy** the agent picks up. The running agent re-reads its env file on every task, so no agent restart is needed.

Exception: changing the `Server URL` for an existing agent requires re-running `init` (or editing `~/orbit-agent.env` manually + `systemctl restart orbit-agent`). The token + URL are baked into the env file at install time.

## Deleting an environment

Dashboard → environment page → Settings → Delete. This:

- Revokes all agent tokens for the environment
- Stops scheduling new deployments
- Keeps the deployment history (read-only) for audit

The deploy tree on the host is **not touched**. nginx keeps serving from `current` until you manually `rm -rf` the directory and update the vhost.

## Per-environment isolation

Each environment is independent. No shared shared-dir config, no cross-environment promotion (you can promote a git ref by deploying the same SHA to two environments, but there's no built-in "promote prod → staging" mutation).

This is intentional — keeping environments boring and self-contained avoids the cross-env coupling that turns into "we can't deploy Prod because Staging is broken".
