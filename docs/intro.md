---
sidebar_position: 1
title: What is Orbit?
description: Zero-downtime Magento 2 deployments. Atomic releases, automatic rollback, no maintenance window for code-only deploys.
slug: /
---

# What is Orbit?

**Orbit is zero-downtime deployment automation for Magento 2.** Atomic Capistrano-style releases, instant symlink swaps, health-check auto-rollback. Maintenance mode only flips when a database migration actually requires it — code-only deploys stay 200 the whole way through.

## How it's wired

Two pieces:

1. **A tiny Rust agent** (`orbit-agent`, ~10 MB single binary) runs on your Magento host. It polls the Orbit control plane for tasks and executes `git clone`, `composer install`, `bin/magento ...`, and the symlink swap locally.
2. **The cloud control plane** at [`orbit.byte8.io`](https://orbit.byte8.io) stores environments, schedules deploys, holds the deployment history, and shows you what's happening in real time.

The agent only ever makes **outbound** HTTPS calls — no inbound ports to expose, no webhooks to configure, no public agent endpoint.

## What you get over a hand-rolled deploy script

- **Atomic releases.** New releases land in `releases/{TIMESTAMP}/` next to the live one. The swap is a single `ln -sfn`. Customers never see a half-built site.
- **Conditional maintenance mode.** `bin/magento setup:db:status` runs first. No migrations → no `503`. Migrations present → mode flips for the upgrade only, not the whole build.
- **Automatic rollback.** After the swap, the agent hits your health-check URL. Non-2xx → symlink reverts, cache flushes, maintenance disables. The site is back up before the on-call gets paged.
- **Traffic hold (opt-in, v0.10.0).** During a migration window, checkout/cart requests are parked in RAM and replayed against the new release; everyone else sees a live waiting page with a countdown — instead of the maintenance 503. Bounded (default 25s budget) and fail-open by construction. ([traffic hold](/docs/zero-downtime/traffic-hold))
- **Migration Intelligence (v0.10.0).** Before `setup:upgrade` runs, Orbit diffs your declarative schema, classifies each change against MySQL 8's online-DDL behaviour, sizes it with your real table row counts, and predicts how long the migration will block — in the deploy log, before the window opens. ([migration intelligence](/docs/zero-downtime/migration-intelligence))
- **Release safety steps (v0.11.0).** Service preflight TCP-probes DB/Redis/RabbitMQ from the release's `env.php` before anything disruptive; an optional `mysqldump` runs before migration windows; configured URLs are warmed after the health check passes. ([release safety](/docs/zero-downtime/release-safety))
- **Module-drift detection.** Bumped a module's `setup_version` without a `db_schema.xml` change? Orbit still notices and runs `setup:upgrade` so registration state matches the deployed code. ([drift detection](/docs/zero-downtime/drift-detection))
- **Maintenance allowlist.** Whitelist your office IP so you can validate the new release before flipping traffic back. ([allowlist IPs](/docs/zero-downtime/allowlist-ips))
- **Centrally upgraded.** `orbit-agent self-upgrade` pulls the latest stable build from GitHub. No SSH-and-`sudo apt upgrade` per host.

## Where to start

| You want to... | Go to |
|---|---|
| Get an environment live in under 30 min | [Quick start](/docs/getting-started/quick-start) |
| Install the agent on a server you already own | [Install the agent](/docs/agent/install) |
| Understand the deployment shape | [Zero-downtime overview](/docs/zero-downtime/overview) |
| Keep checkout alive through DB migrations | [Traffic hold](/docs/zero-downtime/traffic-hold) |
| Wire CI/CD against the GraphQL API | [Personal Access Tokens](/docs/api/personal-access-tokens) |
| Migrate an existing single-directory install | [`orbit-agent init`](/docs/agent/init#migrating-an-existing-install) |
| Diagnose a stuck deploy | [Troubleshooting](/docs/troubleshooting) |

## Where Orbit isn't a fit (yet)

- **Long, blocking migrations still need planning.** [Traffic hold](/docs/zero-downtime/traffic-hold) makes short migration windows invisible to snippet-wired traffic, and [Migration Intelligence](/docs/zero-downtime/migration-intelligence) tells you the duration in advance — but a genuinely multi-minute `COPY`-class migration exceeds any honest hold budget and deserves a scheduled window (or an [expand/contract restructure](/docs/zero-downtime/maintenance-window#forward-compatible-migrations)). Orbit tells you which case you're in before the window opens; it doesn't pretend the slow case away.
- **One host per deploy.** A single deploy targets one host. Running several *environments* on one host **is** supported (`--name` — see [Multiple environments](/docs/agent/multiple-environments)); what's not shipped is **multi-host fan-out** — one deploy updating N agents across N hosts in parallel (a horizontally-scaled app tier). That's on the roadmap.
- **Magento 2 only.** Magento 1 is not a target. Other PHP stacks (Symfony, Laravel) might work with the agent but aren't tested.

## Pricing

See [byte8.io/products/orbit](https://byte8.io/products/orbit#pricing). One agent token works on one environment; multi-environment plans cover multiple hosts under one dashboard.
