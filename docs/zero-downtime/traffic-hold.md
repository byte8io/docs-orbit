---
sidebar_position: 3
title: Traffic hold
description: Park checkout and cart requests in RAM while setup:upgrade runs, replay them against the new release, and show everyone else a live waiting page — instead of a maintenance 503.
---

# Traffic hold

By default, a deploy that needs DB migrations flips Magento's maintenance mode for the duration of `setup:upgrade` — anyone hitting the site in that window gets the 503 maintenance page ([maintenance window classification](./maintenance-window.md)).

**Traffic hold** upgrades that window, for stores that opt in:

- **Transactional requests are parked, not rejected.** POSTs and checkout/cart/customer traffic hold their connection open (in the agent's RAM) while the migration runs, then replay against the **new** release. The customer clicking *Place Order* mid-deploy experiences a long load — not a lost order.
- **Everyone else gets a live waiting page.** An honest `503 + Retry-After` with a spinner, the current deploy phase ("Running setup:db-schema:upgrade"), a countdown from the [migration forecast](#migration-forecast), and auto-reload the moment the hold ends.
- **Bounded and fail-open.** No request is parked longer than the **hold budget** (default 25s, max 60) — past it, the buffer answers with the waiting page itself, so nothing upstream ever times out. If the agent dies mid-hold, nginx falls back within seconds and a watchdog cron clears the flag within a minute.

Maintenance mode still runs underneath — traffic hold is purely additive. Visitors arriving through the nginx snippet see the hold; anything else (or any Orbit failure) sees exactly the behaviour you had before enabling it.

Requires agent **v0.10.0+**.

## Setup

Three steps, all from the environment page in the dashboard:

### 1. Paste the nginx snippet

The **Traffic Hold** card on your environment page renders the snippet with your `deploy_path` baked in. It adds two flag-file checks to your server block:

- `shared/orbit/hold` → route to the buffer on `127.0.0.1:8090` (with a `503 + Retry-After` fallback when the buffer isn't running — the snippet is safe to paste before enabling anything)
- `shared/orbit/cutover-pending` → brief `503 + Retry-After 3` for the ~1–3s cutover instant around the symlink swap

Then `nginx -t && systemctl reload nginx`.

The flag-file test costs effectively nothing per request (OS page cache), and no flag exists outside deploy windows. **Varnish-fronted stack?** Put the snippet on the backend nginx — the one Varnish talks to — so cached pages keep serving during holds (see [Varnish grace](#varnish-grace) below).

### 2. Install the watchdog

```bash
orbit-agent install-watchdog --deploy-path /var/www/magento
```

Idempotent; writes a once-a-minute crontab entry that removes the flag files if no agent process is running or a flag is older than 5 minutes. This is the fail-open guarantee — install it before enabling the hold.

### 3. Enable the toggle

Environment → Edit → **Maintenance** tab → *Traffic hold*. Set the **hold budget** if the default 25s doesn't fit — the ceiling is 60s because CDN and load-balancer timeouts (Cloudflare cuts at 100s, typical LBs at 30–60s) make longer holds dishonest.

## What gets parked vs. shown the waiting page

| Request | Behaviour during the hold |
|---|---|
| POST / PUT / PATCH / DELETE (any path) | Parked, replayed after the migration |
| GET under `/checkout`, `/customer`, `/payment`, `/paypal` | Parked |
| REST cart API (`/rest/*/carts`, `/rest/*/guest-carts`) | Parked |
| Everything else (browsing, media, other GETs) | Waiting page immediately |

Parking caps: 2 MB request body, 512 concurrent parked requests — beyond either, the request gets the waiting page instead. A client that disconnects while parked is **dropped, never replayed** — no store-and-forward, no double orders.

## Migration forecast

When a deploy actually needs `setup:upgrade`, the agent diffs the declarative schema (`db_schema.xml`) between the live release and the new one **before the window opens**, classifies each change against MySQL 8's online-DDL behaviour, and sizes it with your real table row counts:

```
Migration analysis: 2 instant, 1 online, 1 blocking; 0 data patch(es); predicted hold ~24s (confidence: high)
  schema: sales_order_item.weight AddColumn → Instant (~0.1s, 2100000 rows)
  schema: sales_order_item.label ModifyColumn → Copy (~42.0s, 2100000 rows)
  ...
```

The prediction drives the waiting page's countdown, lands on the deployment record (full change table in the dashboard), and — when it exceeds your hold budget — logs a heads-up so you can schedule the deploy for a quiet window instead.

Data patches (arbitrary PHP under `Setup/Patch/Data/`) can't be statically predicted; changed ones are listed by name and drop the forecast confidence to `low`.

## The `held` classification

A migration deploy that ran with the buffer active is stamped <span className="mw-chip mw-chip--zerodowntime">Traffic held 14s</span> instead of the orange `migrations` chip. The deployment detail page shows the measured hold window, how many requests were parked and replayed, and how many saw the waiting page — per-deploy evidence of what your customers actually experienced.

## Varnish grace

The buffer exposes `/__orbit/health`: `200` normally, `503` for exactly the hold window. Point a Varnish backend probe at it and set a grace period, and Varnish serves **stale cache to anonymous visitors for the duration of the hold** — browsing literally never stops; only cache misses and transactional traffic ever reach the buffer. The Traffic Hold card includes a copyable probe + grace VCL snippet.

## Fail-open guarantees

| Failure | What your visitors see |
|---|---|
| Snippet never pasted | Exactly the pre-hold behaviour (Magento maintenance page during migrations) |
| Buffer not running while flag exists | nginx fallback: `503 + Retry-After` |
| Agent killed mid-hold | Watchdog clears the flag within a minute; traffic resumes to PHP-FPM |
| Migration overruns the budget | Parked requests degrade to the waiting page — no upstream timeout, no 504 |
| Deploy fails mid-window | Auto-rollback removes the flags unconditionally and releases parked requests |

## Notes

- Replayed requests are forwarded to your vhost on loopback (`http://127.0.0.1:80`) with the original `Host` header, after the flag is removed. If your vhost only listens on 443, set `ORBIT_HOLD_BACKEND` in `~/orbit-agent.env` to a reachable plain-HTTP listener.
- The buffer binds `127.0.0.1:8090` only while a deploy is running, and only for environments with the toggle on. Zero-downtime deploys never route a single request to it.
