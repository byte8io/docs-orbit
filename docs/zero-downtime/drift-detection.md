---
sidebar_position: 4
title: Module / theme drift detection
description: Catches code deploys that bumped a setup_version but didn't ship a db_schema.xml change. Runs setup:upgrade automatically so the site doesn't 500.
---

# Module / theme drift detection

A subtle Magento 2 pitfall: bumping a module's `setup_version` in `etc/module.xml` without shipping a `db_schema.xml` change means `bin/magento setup:db:status` says "no migrations needed" — but Magento's runtime knows the registered version is stale and refuses to boot the storefront until you run `setup:upgrade`.

**Symptom**: storefront 500s after deploy with "Please upgrade your database" until someone notices.

**Without Orbit**: this happens silently to the customer between the deploy completing (status: succeeded) and the first request hitting the broken module. You find out via monitoring.

**With Orbit's drift detection**: caught before the swap. `setup:upgrade` runs in the new release; the storefront comes up clean.

## What gets checked

After `setup:db:status` returns clean, the agent compares two states:

1. **Code state**: the `setup_version` declared in every installed module's `etc/module.xml` and every theme's `theme.xml`.
2. **DB state**: `setup_module.schema_version` and `setup_module.data_version` in the byte8 database.

If any module/theme has different code-vs-DB versions, drift fired. The agent logs:

```
INFO orbit_agent::executor: Module/theme registration changed — enabling maintenance mode and running setup:upgrade
```

(The "enabling maintenance mode" part appears only if `maintenance_on_drift = true`; see below.)

## How it differs from `setup:db:status`

`setup:db:status` checks **schema** — does any module have a `db_schema.xml` declaration that doesn't match the DB?

Drift detection checks **registration metadata** — does any module's declared `setup_version` differ from what's stored as installed?

They can be independent:

| Schema change? | `setup_version` bumped? | What Magento needs | What `setup:db:status` says | Drift detected? |
|---|---|---|---|---|
| No | No | Nothing | "No schema updates required" | No (none needed) |
| Yes | No | `setup:upgrade` | "Update needed" | Schema gate fires |
| No | Yes | `setup:upgrade` (data patches, registration update) | "No schema updates required" ⚠ | **Drift gate fires** |
| Yes | Yes | `setup:upgrade` | "Update needed" | Schema gate fires (drift would also catch it but schema wins) |

Row 3 is where drift detection earns its keep.

## Why people bump `setup_version` without a schema change

- **Adding a data patch class** under `Setup/Patch/Data/` — Magento only runs new patches if the version says it should
- **Cache-busting** — bumping the version invalidates the module's contribution to cached metadata
- **Indicating a meaningful release** — internal convention, even when nothing technical requires it

All legitimate. The pitfall is just that `setup:db:status` doesn't notice.

## `maintenance_on_drift`

Default: `false`. Drift-triggered `setup:upgrade` runs against the new release dir (not the live `current`), so traffic keeps serving from the old release the whole time. Maintenance class: `drift`, no 503.

When to set `true`:

- Your data patches modify shared tables in non-backwards-compatible ways
- The data patches are slow + you want a clean 503 window for predictability
- Compliance says "no half-state visibility during migrations"

Set on the environment → Settings → `maintenance_on_drift = true`.

## When drift would be wrong

If you legitimately want to ship a code change that bumps a `setup_version` without running `setup:upgrade` — e.g. you're testing version arithmetic — drift detection will get in your way. The agent will run `setup:upgrade` whether you want it or not.

In practice this is vanishingly rare. The default behaviour is correct for ~99% of deploys.

If you're sure you want to suppress drift detection for one deploy: there's no per-deploy override flag (yet). You'd need to either revert the `setup_version` bump or temporarily set `disable_drift_detection = true` on the environment (also coming, see PROGRESS).

## What drift looks like in a deploy log

```
... composer install done ...
INFO orbit_agent::executor: setup:db:status
↪ No schema updates required.

INFO orbit_agent::executor: Drift check
↪ Module Byte8_StoreFinder schema_version=1.2.0 in code,
  setup_module.schema_version=1.1.0 in DB → drift detected

INFO orbit_agent::executor: Module/theme registration changed — running setup:upgrade
INFO orbit_agent::executor: setup:upgrade --keep-generated
↪ ... patches applied ...
↪ Magento installation complete.

INFO orbit_agent::executor: setup:di:compile
... rest of deploy ...
```

And in the dashboard:

- Deployment row shows the <span className="mw-chip mw-chip--drift">Drift</span> chip
- `maintenance_window = 'drift'` in the DB

## Inspecting drift state manually

If you suspect drift but the deploy hasn't run yet:

```bash
# On the host
cd /var/www/magento/current

# Show code-declared versions
find app/code vendor -name module.xml -exec grep -lE 'setup_version' {} + | head

# Show DB-recorded versions
bin/magento module:status --enabled

# Or directly
mysql -e "SELECT module, schema_version, data_version FROM setup_module ORDER BY module"
```

Modules where the code's `setup_version` differs from the DB are the drift candidates the next deploy will catch.

## Testing drift handling

Two test scenarios from the agent's regression suite (`__docs/TESTING_ZERO_DOWNTIME.md`):

**Scenario 4** — drift + `maintenance_on_drift = true`:
- Bump a test module's `setup_version` (1.1.0 → 1.2.0)
- Deploy
- Expect: log shows the drift line, maintenance flips, `setup:upgrade` runs, deploy completes with `drift` chip and maintenance window `drift`

**Scenario 5** — drift + `maintenance_on_drift = false`:
- Same setup, just with the flag off
- Expect: drift fires, `setup:upgrade` runs, but NO `maintenance:enable` line. Site stays 200 throughout. `drift` chip, maintenance window `none`.

Both scenarios verify the gate fires correctly without breaking the site.

## Why this lives in Orbit instead of upstream Magento

Magento 2's `setup:db:status` is intentionally schema-focused — it's cheap to run, it only checks `db_schema.xml` declarations. Catching every registration state in `setup_module` would be more expensive and would risk false positives.

Orbit can afford the extra DB query during deploy because (a) it only runs once per deploy, and (b) the cost of a missed drift is catastrophic (silent site break). Trade-off makes sense in a deploy gate but not in a routine `bin/magento` command.
