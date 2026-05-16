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
- **Module-drift detection.** Bumped a module's `setup_version` without a `db_schema.xml` change? Orbit still notices and runs `setup:upgrade` so registration state matches the deployed code. ([drift detection](/docs/zero-downtime/drift-detection))
- **Maintenance allowlist.** Whitelist your office IP so you can validate the new release before flipping traffic back. ([allowlist IPs](/docs/zero-downtime/allowlist-ips))
- **Centrally upgraded.** `orbit-agent self-upgrade` pulls the latest stable build from GitHub. No SSH-and-`sudo apt upgrade` per host.

## Where to start

| You want to... | Go to |
|---|---|
| Get an environment live in under 30 min | [Quick start](/docs/getting-started/quick-start) |
| Install the agent on a server you already own | [Install the agent](/docs/agent/install) |
| Understand the deployment shape | [Zero-downtime overview](/docs/zero-downtime/overview) |
| Wire CI/CD against the GraphQL API | [Personal Access Tokens](/docs/api/personal-access-tokens) |
| Migrate an existing single-directory install | [`orbit-agent init`](/docs/agent/init#migrating-an-existing-install) |
| Diagnose a stuck deploy | [Troubleshooting](/docs/troubleshooting) |

## Where Orbit isn't a fit (yet)

- **PHP-only zero-downtime is current scope.** Database migrations still require a maintenance window — Orbit minimises it (mode flips only around `setup:upgrade`) but doesn't eliminate it. A fail-open traffic-holding proxy is on the roadmap.
- **Single web-host today.** Multi-host fan-out (one deploy → N agents in parallel) is on the roadmap but not shipped.
- **Magento 2 only.** Magento 1 is not a target. Other PHP stacks (Symfony, Laravel) might work with the agent but aren't tested.

## Pricing

See [byte8.io/products/orbit](https://byte8.io/products/orbit#pricing). One agent token works on one environment; multi-environment plans cover multiple hosts under one dashboard.
