---
sidebar_position: 7
title: The fail-open watchdog
description: A once-a-minute cron that clears stale traffic-hold flags if the agent ever dies mid-deploy. Install it before enabling traffic hold.
---

# The fail-open watchdog

Orbit's [traffic hold](/docs/zero-downtime/traffic-hold) works through two flag files under `shared/orbit/` (`hold` and `cutover-pending`) that your nginx checks per request. The deploy pipeline removes them on every success and failure path it controls — but not on the paths it can't see: the agent process being OOM-killed, `kill -9`'d, or the host rebooting mid-window. Without a backstop, that would leave nginx serving 503s until a human noticed.

The watchdog is that backstop. **Install it before enabling traffic hold.**

## Install

```bash
orbit-agent install-watchdog --deploy-path /var/www/magento
```

Writes a once-a-minute entry into your user crontab:

```
* * * * * /usr/local/bin/orbit-agent watchdog --deploy-path /var/www/magento >/dev/null 2>&1 # orbit-watchdog:/var/www/magento
```

Idempotent — re-running **updates** the existing entry (e.g. after the binary moved) instead of duplicating it, keyed by the trailing `# orbit-watchdog:<path>` marker. One entry per deploy path; hosts running [multiple environments](./multiple-environments.md) install one per path.

## What a sweep does

Each minute, `orbit-agent watchdog`:

1. Checks whether any orbit-agent process is running (excluding itself and other watchdog sweeps).
2. Removes the flag files when **either**:
   - no agent process is alive, **or**
   - a flag is older than `--max-age-secs` (default **300**) — no legitimate hold or cutover window lasts minutes, so age beats even a live agent. Failing open wins.

A cleared flag means nginx resumes routing straight to PHP-FPM on the next request — whatever release `current` points at keeps serving.

## Flags

| Flag | Default | Description |
|---|---|---|
| `--deploy-path` | (required, or `ORBIT_DEPLOY_PATH`) | Deploy tree root containing `shared/orbit/` |
| `--max-age-secs` | `300` | Remove a flag older than this even while an agent runs |

## Recovery-time expectations

| Scenario | Traffic resumes |
|---|---|
| Agent exits cleanly (normal deploys, failures, rollbacks) | Immediately — the pipeline removes flags itself; the watchdog never fires |
| Agent killed mid-hold | ≤ ~60s (next cron tick sees no agent process) |
| Deploy wedged with the agent still alive | ≤ `max-age-secs` after the flag was written |
| Host rebooted mid-hold | First cron tick after boot |

You can run a sweep manually at any time — it's safe when no flags exist:

```bash
orbit-agent watchdog --deploy-path /var/www/magento
```
