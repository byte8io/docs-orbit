---
slug: public-docs-launch
title: Orbit docs go public
authors: [byte8]
tags: [docs, launch]
---

The public docs are live at [docs.byte8.io/orbit](https://docs.byte8.io/orbit/). One stop for the full Orbit story — what it is, how to install it, every config flag, every gate, every gotcha.

<!-- truncate -->

## What's covered

- **[Quick start](/docs/getting-started/quick-start)** — zero to live deploy in about 20 minutes
- **[The agent](/docs/agent/install)** — install, init, systemd, self-upgrade, logs
- **[Environments](/docs/environments/overview)** — shared dirs, agent tokens, health checks
- **[Deployments](/docs/deployments/deploy-types)** — code vs full, triggering, rollback
- **[Zero-downtime](/docs/zero-downtime/overview)** — how the gates work, when maintenance flips, when it doesn't
- **[API](/docs/api/graphql)** — GraphQL endpoint, Personal Access Tokens for CI
- **[Troubleshooting](/docs/troubleshooting)** — the failure modes we've seen, what fixes them

## What's coming next

- **Multi-host fan-out.** One deploy → N agents in parallel on the same environment.
- **Traffic-holding proxy.** Opt-in Rust proxy that buffers HTTP requests during `setup:upgrade` so even DB-migration deploys can be true zero-downtime. Design doc in `__docs/ORBIT_V2_STRATEGY.md`; implementation timeline TBD.
- **Per-locale static-content deploys.** Skip locales you don't actually need. Reduces full-deploy time significantly for multi-locale shops.
- **Scheduled deploys.** First-class scheduling UI in the dashboard so you don't need a cron + SSH dance.

## Found a doc bug?

Each page has an **Edit this page** link in the footer that drops you straight into the right file on GitHub. PRs welcome.

## How to follow along

This changelog is the canonical update stream. RSS / Atom feed buttons at the top of [the changelog index](/blog).

For the agent's release notes specifically (separate from product docs), watch [byte8io/orbit-agent releases](https://github.com/byte8io/orbit-agent/releases).
