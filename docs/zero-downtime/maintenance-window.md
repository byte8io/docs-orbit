---
sidebar_position: 2
title: Maintenance window classification
description: How Orbit decides whether to flip the 503 and how long. The five classes — none, migrations, drift, always, failed_rollback — and what triggers each.
---

# Maintenance window classification

Every deploy gets stamped with a **maintenance window class** that summarises whether (and how long) the site was returning 503 during the deploy. Stored in the `deployments.maintenance_window` column and rendered as a coloured chip in the dashboard.

The five classes:

| Class | Chip | When |
|---|---|---|
| `none` | <span className="mw-chip mw-chip--zerodowntime">Zero-downtime</span> | No gate flipped maintenance. Site stayed 200 throughout. |
| `migrations` | <span className="mw-chip mw-chip--migrations">Migrations</span> | `setup:db:status` reported migrations. 503 flips for the `setup:upgrade` window only. |
| `drift` | <span className="mw-chip mw-chip--drift">Drift</span> | Module/theme `setup_version` drift detected. `setup:upgrade` ran. 503 only if `maintenance_on_drift = true`. |
| `always` | <span className="mw-chip mw-chip--always">Always-on</span> | Environment has `always_enable_maintenance = true`. 503 for the whole deploy window. |
| `failed_rollback` | <span className="mw-chip mw-chip--rolledback">Rolled back</span> | Health check failed post-swap. Auto-rollback fired. |

## `none`

Code-only deploy, no migrations needed, no drift, no global maintenance flag. The agent never runs `maintenance:enable`.

`curl -sI` returns 200 throughout — your monitoring won't see a blip.

**Most production deploys should land here.** If yours don't, look at what's bumping the `migrations` or `drift` count and consider whether it's necessary.

## `migrations`

`bin/magento setup:db:status` reported pending changes. Orbit:

1. Runs `bin/magento maintenance:enable` (sets `shared/var/.maintenance.flag`)
2. Runs `bin/magento setup:upgrade --keep-generated`
3. Runs `bin/magento maintenance:disable`

Window duration ≈ duration of `setup:upgrade`. For a small migration (one column added), ~10–20 seconds. For a large refactor, can be minutes — and it's worth thinking hard about whether you can split it.

Customers hitting the site during the window get the Magento maintenance page (`pub/errors/503.phtml`). If they're already mid-checkout, their session in `shared/var/session/` persists, so they resume normally when the window closes.

### Forward-compatible migrations

To minimise the migration window, write schema changes as forward-compatible two-deploy pairs:

**Deploy 1 (new column, dual-write):**
```xml
<!-- etc/db_schema.xml -->
<column xsi:type="varchar" name="new_field" length="255" nullable="true"/>
<!-- both old and new code read/write the old + new fields -->
```

**Deploy 2 (drop old, switch to new):**
```xml
<!-- ... -->
<!-- old code path removed; only new_field is used now -->
```

Each individual deploy takes minimal time in `setup:upgrade`; you avoid the "rewrite half the table" multi-minute migration.

## `drift`

The module/theme `setup_version` in the codebase differs from `setup_module` in the database, but `setup:db:status` didn't catch it because there's no `db_schema.xml` change. This happens when:

- A module bumps its `setup_version` in `etc/module.xml` purely to invalidate caches
- A theme version bumped
- A data patch class was added but no schema change

Without drift detection, the storefront would 500 with "Please run setup:upgrade" until you noticed. Orbit catches it and runs `setup:upgrade` automatically.

By default, drift does **not** flip maintenance — `setup:upgrade` runs against the not-yet-symlinked new release while traffic continues hitting the old release. Maintenance window class: `drift`, no 503.

To flip maintenance during drift-triggered upgrade: `maintenance_on_drift = true` on the environment. Useful when your data patches modify shared tables in non-backwards-compatible ways. See [drift detection](/docs/zero-downtime/drift-detection).

## `always`

Environment has `always_enable_maintenance = true`. Orbit runs `maintenance:enable` as the first command after `pre_deploy_hook`, and `maintenance:disable` as the last command after the swap. 503 for the whole deploy window — clone, composer, di:compile, static-content:deploy, swap, cache:flush.

When to use:

- **Compliance-driven deploys** where partial-state visibility is unacceptable
- **Headless API consumers** that can't gracefully handle 503 — easier to give them one long known window than two short surprise ones
- **Manual smoke-testing windows** combined with `maintenance_allowlist_ips` — public traffic gets 503, your office IP gets the new release

Don't set this on every environment "just to be safe" — it gives up the main thing Orbit is for.

## `failed_rollback`

The post-swap health check failed. Orbit:

1. Flipped `current` back to the previous release
2. Ran `maintenance:disable` (if it was enabled)
3. Ran `cache:flush` on the now-current (previous) release

Deployment status: `rolled_back`. Site is back up on the old release. ([rollback](/docs/deployments/rollback))

The new (broken) release stays in `releases/<TIMESTAMP>/` for forensics — `ls` to find it, inspect, then manually `rm -rf` once you've extracted what you need.

## Setting maintenance flags

Dashboard → environment page → **Settings**:

- `always_enable_maintenance`: boolean. Default `false`.
- `maintenance_on_drift`: boolean. Default `false`.
- `maintenance_allowlist_ips`: newline-separated IPs (or CIDR — `203.0.113.0/24`). See [allowlist IPs](/docs/zero-downtime/allowlist-ips).

Changes take effect on the **next deploy** the agent picks up — no restart, no re-init.

## Inspecting in the DB

Power-user only — you can query the maintenance window classes directly:

```sql
SELECT version, status, maintenance_window, started_at, completed_at
FROM deployments
WHERE environment_id = (SELECT id FROM environments WHERE name = 'Production')
ORDER BY started_at DESC
LIMIT 20;
```

Useful for "which deploy class are we trending toward?" analyses — if `migrations` is becoming common in routine code deploys, you've got module-version creep that needs a cleanup pass.
