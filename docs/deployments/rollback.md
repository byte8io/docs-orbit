---
sidebar_position: 3
title: Rollback
description: Automatic on health-check failure, manual via the dashboard. The previous release is one symlink flip away.
---

# Rollback

Rollback is one of Orbit's load-bearing features: the previous release is always present on disk, and reverting to it is a single `ln -sfn`. Two paths trigger it — automatic (on health-check failure) and manual (you decide).

## Automatic rollback

Happens when the post-swap health check fails:

```
1. Symlink swap: current → releases/<NEW>
2. cache:flush on the new release
3. curl --max-time 30 $HEALTH_CHECK_URL
4. Non-2xx response, timeout, or connection refused
   ↓
5. AUTO-ROLLBACK:
   - ln -sfn releases/<PREVIOUS> current
   - maintenance:disable (if it was enabled by this deploy)
   - cache:flush on the now-current (previous) release
   - Status: rolled_back
   - Maintenance window class: failed_rollback
```

You see the deployment marked **Rolled back** in the dashboard with a red chip. The agent log shows the health-check failure reason and the rollback sequence.

The site is back up within seconds of the failure — usually before anyone sees a 5xx in their monitoring.

## What constitutes "health check failed"

- HTTP status code outside `200–299`
- TCP connection refused (PHP-FPM down, nginx not serving)
- Timeout (default 30s — health check should respond in under 1s)
- DNS resolution failure (only relevant if you use a hostname; default `127.0.0.1` avoids this)

Pick a meaningful health-check URL — one that actually exercises Magento boot, not just nginx serving a static file. See [health checks](/docs/environments/health-checks).

## Manual rollback

When the deploy succeeded by Orbit's metrics (health check passed, no command failed) but **you've decided the new release is bad** — performance regression, a feature shipping that shouldn't have, an Akamai cache poisoning issue, anything an automated health check won't catch.

### Via the dashboard

Environment page → **Deployments** list → previous successful deployment → **Roll back to this release**.

This:
- Flips `current` back to the chosen release
- Runs `cache:flush`
- Logs a new deployment entry with type `manual_rollback`
- Does NOT touch `shared/` (env.php, media, var/log all stay)

The forward release (the one you rolled away from) stays on disk until pruned by future deploys.

### Via the host (`orbit-agent rollback`)

If you've got SSH and want zero dashboard latency:

```bash
ssh prod 'orbit-agent rollback'                          # previous release
ssh prod 'orbit-agent rollback --release 20260514_213000'  # specific timestamp
ssh prod 'orbit-agent rollback --steps 2'                 # two releases back
```

`--release` accepts the timestamp directory name. `--steps N` rolls back N releases (`--steps 1` is the default).

The rollback still shows up in the dashboard.

## What rollback doesn't undo

- **Database changes.** `setup:upgrade` is a one-way function. If the new release ran a migration that added a column, rolling back the symlink leaves the column in place. Magento usually handles forward-compatible schemas (new code reads new columns, old code ignores them) — but **a destructive migration** (renaming, dropping) breaks the rolled-back release.
- **`shared/` mutations.** If the deploy ran a script that wrote into `shared/var/log` or `shared/app/etc/env.php`, those stay. Most deploys don't mutate `shared/`; the exceptions are seeding new env values or one-off data fixes.
- **External side effects.** Emails sent, queue jobs published, API calls to third parties — all real and not reversible.

If the bad release ran a destructive migration, you need a database rollback (PITR, last-known-good dump restore) in addition to the symlink flip. That's outside Orbit's scope.

## Preventing rollback foot-guns

- **Default to forward-compatible migrations.** Adding columns, adding tables — fine. Renaming, dropping, narrowing types — schedule a two-deploy migration (write new column → backfill → switch reads → next release drops old).
- **Set `releases_to_keep` high enough to roll back to your last green release.** Default `5` covers most teams — at one deploy a day, that's a week. High-velocity shops (multiple deploys an hour) might want `20+`.
- **Test the rollback path occasionally.** Trigger a rollback in staging, verify your site comes back. The first time you discover rollback is broken should NOT be production.

## Audit

The deployment history shows every rollback (auto or manual), who triggered manuals, and the full agent log of the rollback sequence. Useful for post-mortems when "what changed" needs a definitive answer.
