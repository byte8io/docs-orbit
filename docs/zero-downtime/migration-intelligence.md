---
sidebar_position: 4
title: Migration Intelligence
description: Orbit predicts how long setup:upgrade will block before it runs — a classified diff of your declarative schema, sized against your real table row counts.
---

# Migration Intelligence

The scariest unknown in a Magento deploy is a one-liner: **how long will `setup:upgrade` block?** Ten seconds is a non-event; four minutes at 2 PM is an incident. Historically you found out by running it.

Orbit answers the question **before the window opens**. When a deploy needs `setup:upgrade` (v0.10.0+), the agent analyses the pending migration and writes into the deploy log:

```
Migration analysis: 2 instant, 1 online, 1 blocking; 0 data patch(es); predicted hold ~24s (confidence: high)
  schema: sales_order_item.weight AddColumn → Instant (~0.1s, 2100000 rows)
  schema: sales_order_item.label ModifyColumn → Copy (~42.0s, 2100000 rows)
  schema: acme_widget ACME_WIDGET_SKU AddIndex → Inplace (~21.0s, 2100000 rows)
```

The full classified change table also lands on the deployment record in the dashboard, and the prediction drives the [traffic hold](./traffic-hold.md) waiting page's countdown.

Nothing about the analysis blocks or changes the deploy — it's a forecast, not a gate.

## How it works

Magento's **declarative schema** makes this statically answerable. Every module declares its target schema in `etc/db_schema.xml`, and `setup:db-schema:upgrade` reconciles the live database against the merged union of those files. So "what will this deploy do to my database" is a diff:

1. **Merge** every `db_schema.xml` across `app/code` and `vendor` in the *currently live* release — that's (a very good proxy for) your current DB structure.
2. **Merge** the same set in the *new* release.
3. **Diff** the two, table by table, column by column.
4. **Classify** each change against how MySQL 8 (InnoDB) actually executes DDL:

| Change | MySQL algorithm | Cost |
|---|---|---|
| New table, dropped table | metadata | ~0s |
| **Added column** | INSTANT | ~0s — regardless of table size |
| Dropped index / constraint | metadata | ~0s |
| Added index | INPLACE (online) | grows with rows; non-blocking but IO-visible |
| Dropped column | INPLACE (rebuild) | grows with rows |
| **Changed column type/length** | COPY | the slow, blocking class — grows with rows |
| Added FK / unique constraint | INPLACE | grows with rows |

5. **Size** the row-dependent classes with your actual table sizes: the agent reads DB credentials from the release's own `app/etc/env.php` and queries `information_schema.tables` for approximate row counts of just the changed tables. (The password travels via `MYSQL_PWD`, never the process list; the lookup is read-only and best-effort — if it fails, conservative per-class defaults keep the estimate usable.)

The headline number is the sum plus a fixed ~3s for Magento's own bootstrap of the two upgrade commands.

## Confidence levels

| Confidence | Meaning |
|---|---|
| `high` | No data patches; every row-dependent change was sized with a real row count. |
| `medium` | No data patches, but some row counts were unavailable — class defaults used. |
| `low` | The release ships **changed or new data patches** (`Setup/Patch/Data/*.php`). Patches are arbitrary PHP — a patch that backfills 5M rows can dwarf every DDL estimate. Changed patches are listed by name so you can review them. |

Treat a `low`-confidence forecast as "at least this long."

## What to do with a big prediction

- **Prediction fits your [hold budget](./traffic-hold.md)** → deploy whenever you like; snippet-wired visitors won't see an error.
- **Prediction exceeds the budget** → the deploy log warns you *before* the migration runs. Parked visitors will degrade gracefully to the waiting page — nothing breaks — but for a genuinely long migration, schedule a quiet window, or restructure the change:
  - A `COPY`-class type change on a huge table is the usual culprit. Consider the [forward-compatible two-deploy pattern](./maintenance-window.md#forward-compatible-migrations): add the new column (INSTANT), dual-write, migrate data gradually, drop the old column later.
  - Index additions are online in MySQL 8 — the site keeps serving during them; the estimate reflects IO time, not downtime.

## Limitations (honest edition)

- The old release's schema files are a proxy for the live DB. If someone changed the DB out-of-band (manual `ALTER`, third-party installer), the diff won't see it — but then `setup:upgrade` behaviour was already unpredictable.
- `information_schema.table_rows` is an InnoDB estimate (can be ±10–20%). Good enough for "10s vs 4 minutes"; don't read it as a benchmark.
- Throughput constants are deliberately conservative for mid-range hosting. Your NVMe box will usually beat the estimate.
- Data patches are listed, not costed. There is no static analysis that can predict arbitrary PHP; anyone claiming otherwise is guessing too.

## Where the results appear

- **Deploy log** — summary line plus per-change detail while the deploy runs.
- **Deployment detail page** — the classified change table (algorithm, rows, estimate), predicted vs. **measured** hold when [traffic hold](./traffic-hold.md) is enabled, and the data-patch list.
- **Waiting page** — visitors held during the migration see a live countdown fed by the prediction.
