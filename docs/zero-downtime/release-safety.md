---
sidebar_position: 5
title: Release safety — preflight, DB backup, cache warming
description: Verify backing services before the disruptive phase, take an optional pre-migration database backup, and warm caches after the health check passes.
---

# Release safety

Three lifecycle steps (v0.11.0) that harden the deploy around the parts Orbit already automates. All are configured per-environment; none require anything on the host beyond the agent.

## Service preflight

**On by default.** Before anything disruptive happens — before composer, before any maintenance window — the agent reads the new release's `app/etc/env.php` and TCP-probes every backing service it names:

- the **database** connection
- **Redis** session and cache backends
- **RabbitMQ** (when `queue/amqp` is configured)

Each probe is a plain TCP connect with a 3-second timeout — reachability, not authentication. An unreachable service **fails the deploy immediately**, while the live release is still serving untouched:

```
Service preflight: probing 4 endpoint(s) from env.php
  preflight: database db.internal:3306 reachable (2ms)
  preflight: redis-session 10.0.0.5:6379 reachable (1ms)
  preflight: redis-cache-default 10.0.0.5:6380 UNREACHABLE — connection refused
  preflight: rabbitmq mq.internal:5672 reachable (3ms)
```

This closes the ugliest failure class in deployment automation: the deploy "succeeds" and the site dies on the first real request because a backing service moved, got firewalled, or changed ports.

Notes:

- Unix-socket endpoints (`/var/run/redis.sock`) are **skipped**, never reported as down.
- OpenSearch/Elasticsearch config lives in `core_config_data`, not `env.php`, so it isn't probed (yet).
- If your env.php intentionally names endpoints unreachable from the deploy host, disable the toggle (Environment → **Maintenance** tab).

## Pre-migration database backup

**Off by default — opt in.** When a deploy will actually run `setup:upgrade`, the agent takes a dump *before* the maintenance window opens, so the backup never extends customer-visible downtime:

```
mysqldump --single-transaction --quick --routines --triggers
  → shared/orbit/backups/db/<version>.sql.gz
```

- Credentials come from the release's own `env.php`; the password travels via `MYSQL_PWD`, never the process list.
- `--single-transaction` means no table locks on InnoDB — the live site keeps serving during the dump.
- The newest **3** dumps are kept; older ones are pruned automatically.
- **Strict by design:** if you enabled the backup and it fails, the deploy fails. A safety net that silently skips is worse than none.

Mind the cost on large databases: the dump is written uncompressed first, then gzipped — budget disk for roughly the DB size, and expect the deploy to take as long as the dump does. Code-only deploys (no migrations) never trigger it.

Restoring is standard MySQL:

```bash
gunzip < shared/orbit/backups/db/20260728_141500.sql.gz | mysql -u <user> -p <dbname>
```

## Cache warming

**Off unless URLs are configured.** After the post-deploy health check passes — never inside a maintenance window, never before rollback detection — the agent GETs each configured URL to prime the full-page cache, OPcache, and block caches before real customers arrive:

```
Cache warming: 3 URL(s)
  warmed https://www.example.com/ — 200 OK in 840ms
  warmed https://www.example.com/bestsellers — 200 OK in 620ms
  warmed https://www.example.com/checkout/cart — 200 OK in 410ms
```

Configure in Environment → **Operations** tab: one absolute URL per line (up to 50), `#` comments allowed. Warming is strictly best-effort — a failed warm is logged and never fails the deploy.

Good candidates: the homepage, your top category pages, top sellers, CMS landing pages. The first visitor after a deploy then hits a warm FPC instead of paying the cold-cache penalty.

## How the three fit the deploy timeline

```
prep → env.php linked
  ├─ service preflight        ← fails fast, site untouched
build (composer, di:compile, static content)
  ├─ migration analysis       ← predicted hold (Migration Intelligence)
  ├─ DB backup (opt-in)       ← before the window, no downtime added
maintenance window / traffic hold
  └─ setup:upgrade → swap → cache:flush
health check
  └─ cache warming            ← only after the release is verified good
```
