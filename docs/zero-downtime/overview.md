---
sidebar_position: 1
title: How zero-downtime works
description: Atomic releases, conditional maintenance, health-check rollback. Why code deploys stay 200 and migration deploys flip the 503 only for as long as the migration runs.
---

# How zero-downtime works

The technique is Capistrano-style atomic releases. Nothing novel — it's a 15-year-old pattern, ported to Magento with a few Magento-specific guards. This page explains the shape so you can predict deploy behaviour, debug edge cases, and trust that "zero-downtime" means what it says.

## The deploy tree

```
/var/www/magento/
├── current → releases/20260516_104530/    ← atomic symlink
├── releases/
│   ├── 20260516_104530/                   ← live release
│   ├── 20260515_213000/                   ← previous (rollback target)
│   ├── 20260514_175200/
│   └── ...                                ← keep_releases honoured
└── shared/                                ← persistent across deploys
    ├── app/etc/env.php
    ├── pub/media/
    └── var/{log,session,...}
```

nginx is configured to serve from `current/pub`. That symlink is the only thing that changes between releases.

## The deploy sequence

For a **code-only deploy** with no DB migrations and no module drift:

```
1. orbit-agent receives task from control plane
2. mkdir releases/<NEW_TIMESTAMP>/
3. git clone --branch <branch> <repo_url> releases/<NEW>
4. Link shared/ → release/ (env.php, pub/media, var/log, ...)
5. (code deploy: symlink vendor/ + pub/static/ + generated/ from previous release)
6. setup:db:status → no migrations
7. (no maintenance flip)
8. ln -sfn releases/<NEW> current               ← atomic swap (instant)
9. cd current && bin/magento cache:flush
10. curl health-check URL → 200
11. Status: succeeded, maintenance window: none
12. Prune old releases beyond keep_releases
```

The user-visible window where customers might notice anything: **nothing**. The symlink swap is atomic at the syscall level. `cache:flush` runs in the new release; in-flight requests on the old release continue serving from their now-stale code (held by PHP-FPM workers), new requests hit the new release immediately.

For a **full deploy with DB migrations**:

```
1-5. Same as above
6. setup:db:status → migrations present
7. maintenance:enable (in the NEW release dir, not yet symlinked as current)
   ↓ — this flips 503 because shared/var/.maintenance.flag is read by current/
   — wait, the flag lives in shared/ which is symlinked into current/
   — and the NEW release also symlinks shared/
   — so maintenance:enable IN the new release flips the flag in shared/, which current/ sees
   — so customers see 503 during this window
8. setup:upgrade --keep-generated (in the new release)
9. maintenance:disable
   ↓ — flag removed from shared/var/, current/ now serves 200 from OLD code
10. setup:di:compile (no traffic impact — still building the new release)
11. setup:static-content:deploy -f
12. ln -sfn releases/<NEW> current               ← atomic swap
13. cd current && bin/magento cache:flush
14. curl health-check URL → 200
15. Status: succeeded, maintenance window: migrations
```

The 503 window covers ONLY steps 7–9 — typically 20–60 seconds for a typical migration. Composer, di:compile, and static-content:deploy (the heavy steps, several minutes combined) happen with the site serving normally from the old release.

## The 4 deployment gates

Each gate makes one decision. They run in order:

1. **DB-status gate** — `bin/magento setup:db:status` decides whether `setup:upgrade` needs to run. ([maintenance window → migrations](/docs/zero-downtime/maintenance-window#migrations))
2. **Drift gate** — module/theme registration drift detection. Catches code deploys that bumped a `setup_version` without a schema change. ([drift detection](/docs/zero-downtime/drift-detection))
3. **Config-import gate** — `bin/magento app:config:import` (optional, off by default). Pushes any new config from `app/etc/config.php` into the DB. ([config import](/docs/zero-downtime/config-import))
4. **Health-check gate** — `curl $HEALTH_CHECK_URL`. Non-2xx → auto-rollback. ([rollback](/docs/deployments/rollback))

The dashboard shows which gates fired for each deploy as a chip on the deployment row:

- <span className="mw-chip mw-chip--zerodowntime">Zero-downtime</span> — no gate flipped maintenance
- <span className="mw-chip mw-chip--migrations">Migrations</span> — gate 1 fired, brief 503 around `setup:upgrade`
- <span className="mw-chip mw-chip--drift">Drift</span> — gate 2 fired, `setup:upgrade` ran (with or without 503 depending on `maintenance_on_drift`)
- <span className="mw-chip mw-chip--always">Always-on</span> — environment has `always_enable_maintenance = true`, 503 for the whole deploy
- <span className="mw-chip mw-chip--rolledback">Rolled back</span> — gate 4 fired, automatic revert to previous release

## Why the symlink swap is "atomic"

`ln -sfn` is implemented as `rename(2)` on Linux. From [the man page](https://man7.org/linux/man-pages/man2/rename.2.html):

> If newpath already exists, it will be atomically replaced, so that there is no point at which another process attempting to access newpath will find it missing.

So `ln -sfn releases/NEW current` either succeeds (current points at NEW) or fails (current still points at OLD). There's no in-between state. nginx + PHP-FPM resolve `current/` on every request, picking up the new target on the next file access.

## Why in-flight requests don't break

PHP-FPM workers hold file handles open. A request that started loading `current/pub/index.php` before the swap continues running against the old release's code — the symlink change doesn't yank the file out from under it. The next request hits the new release.

This is why `cache:flush` runs **after** the swap, and why the old release's `vendor/` isn't pruned until N-keep_releases later: in-flight requests need it to still be there.

## Where this breaks down

- **DB migrations are inherently NOT zero-downtime.** Customers can't write to a table while you're running `ALTER TABLE`. Orbit minimises the window but doesn't eliminate it. A traffic-holding proxy (V2 roadmap) closes this gap by buffering HTTP requests in RAM during the migration window.
- **Long-running PHP requests on the old release** can hold open file handles long after the swap. If you immediately deploy again and prune the old release, those requests would error. The default `keep_releases=5` is comfortable headroom; don't drop it below 3.
- **Filesystem-level corruption.** Disk full mid-`composer install`, network partition mid-`git clone`. The atomic swap protects you from half-built releases — those never become `current`. The old release stays live; the new release is left in `releases/` for forensics or manual cleanup.

## What you can do to make zero-downtime more reliable

- **Forward-compatible schema migrations** — see [maintenance window](/docs/zero-downtime/maintenance-window#forward-compatible-migrations) for the pattern
- **Avoid huge `setup:upgrade` migrations** in production — split them across deploys
- **Set `keep_releases` ≥ 5** so rollbacks always work
- **Tune the health check to fail fast** (under 1s) so rollback fires before customers notice
- **Whitelist your office IP** during always-on maintenance for live-validation before flipping public traffic
