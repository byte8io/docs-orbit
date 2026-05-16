---
sidebar_position: 5
title: Agent logs
description: Tail the agent's log with orbit-agent logs (a thin journalctl wrapper) or journalctl directly.
---

# Agent logs

The agent logs to journald when run as a systemd service (the production setup) and to stdout when run in foreground mode.

## `orbit-agent logs` (v0.3.3+)

A thin shell wrapper around `journalctl -u orbit-agent.service`, discoverable as a subcommand so you don't have to remember the journalctl flag set.

```bash
orbit-agent logs                          # live tail, last 100 lines + follow
orbit-agent logs --no-follow -n 500       # last 500 lines, exit
orbit-agent logs --since "1 hour ago" --no-follow
orbit-agent logs --since "2026-05-15 14:00" --until "2026-05-15 15:00"
```

On permission errors (the deploy user isn't in `systemd-journal`), it prints the `usermod -aG systemd-journal` fix inline.

## Direct journalctl

If you prefer the raw tool:

```bash
journalctl -u orbit-agent -f                       # tail (sudo may be needed)
journalctl -u orbit-agent --since "1h ago"
journalctl -u orbit-agent -n 500 --no-pager
journalctl -u orbit-agent --since today | grep ERROR
```

`sudo`-less access:

```bash
sudo usermod -aG systemd-journal $USER
# log out + back in
```

## Foreground mode

When you run the agent foreground (`orbit-agent` in a shell, no systemd), logs go to stdout/stderr — no `journalctl` involved. Pipe to a file if you need to keep them:

```bash
orbit-agent 2>&1 | tee orbit-agent.log
```

## Log levels

The agent uses `tracing` with the standard `RUST_LOG` env var. Default level is `INFO`. To get debug detail (lots of output — only useful when actively debugging):

```bash
# In ~/orbit-agent.env:
RUST_LOG=orbit_agent=debug,info

# Or one-off:
RUST_LOG=debug orbit-agent
```

Targeted modules:

| Module | Notable detail |
|---|---|
| `orbit_agent::client` | HTTP calls to the control plane (registration, task polling, status updates) |
| `orbit_agent::executor` | Each shell command's stdout/stderr |
| `orbit_agent::deployment` | High-level deploy state machine |

## What's interesting in the log

Normal life:

```
INFO orbit_agent: Orbit Agent v0.5.10 starting
INFO orbit_agent: Registered with Orbit server environment="Production"
INFO orbit_agent: Polling for tasks every=5s
```

A deploy:

```
INFO orbit_agent::deployment: Picked up task task_id=... deploy_type=full
INFO orbit_agent::executor: git clone --branch main ...
INFO orbit_agent::executor: composer install --no-dev --optimize-autoloader
INFO orbit_agent::executor: setup:db:status reports migrations needed
INFO orbit_agent::executor: maintenance:enable in release_dir
... etc
INFO orbit_agent: Health check passed url=http://127.0.0.1/health_check.php
INFO orbit_agent::deployment: Deployment completed successfully task_id=...
```

A drift detection:

```
INFO orbit_agent::executor: Module/theme registration changed — enabling maintenance mode and running setup:upgrade
```

An auto-rollback:

```
WARN orbit_agent::deployment: Health check failed url=... status=500
INFO orbit_agent::deployment: Auto-rollback starting previous_release=releases/20260515_104530
INFO orbit_agent::executor: ln -sfn releases/20260515_104530 current
INFO orbit_agent::executor: maintenance:disable
INFO orbit_agent::executor: cache:flush
WARN orbit_agent::deployment: Deployment rolled back task_id=...
```

## Streaming to the dashboard

Per-deploy: every shell command's stdout/stderr also streams to the dashboard's per-deployment log viewer in real time. **You don't need SSH access to read deploy logs**, which matters when delegating deploys to teammates without server access.

The agent log via journalctl is broader — it includes registration, polling, version checks, drift evaluations, and any background work the agent does outside the per-deploy stream. Use the dashboard for "why did this deploy fail", and journalctl for "is the agent itself healthy".
