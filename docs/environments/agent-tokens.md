---
sidebar_position: 3
title: Agent tokens
description: How agents authenticate. Token format, generation, rotation, revocation.
---

# Agent tokens

Each `orbit-agent` instance authenticates to the control plane with an **agent token** scoped to one environment. Tokens are issued from the dashboard, hashed at rest, and shown to you exactly once on creation.

## Format

```
obt_<64 hex chars>
```

`obt_` = "orbit token". The 64 hex chars are cryptographically random. Treat the whole string as a credential — anyone with it can register agents and execute deploys against that environment.

## Generating

Dashboard → environment page → **Agent Tokens → Generate**.

1. Give the token a name (e.g. `prod-host`, `prod-host-blue`, `staging`). The name is just a label — useful when multiple agents share an environment (rare) or for audit when rotating.
2. Click **Generate**.
3. **Copy the token immediately.** It's only shown once. If you lose it, revoke + generate a new one — there's no recovery path.

The token is hashed (Argon2id) before storage; the dashboard can't show it back even to you.

## Where the agent stores it

After `orbit-agent init --token obt_...`, the token is written to:

```
~/orbit-agent.env

ORBIT_AGENT_TOKEN=obt_276a480e4f9383...
ORBIT_SERVER_URL=https://orbit.byte8.io
```

systemd loads this via `EnvironmentFile=` (see [systemd](/docs/agent/systemd)). Foreground mode loads it via `set -a; source ~/orbit-agent.env; set +a`.

**File permissions:** `init` writes the env file `0600` (owner read/write only). Verify with `ls -la ~/orbit-agent.env`; if it's anything more permissive, fix it: `chmod 0600 ~/orbit-agent.env`.

## Multiple agents on one environment

Rare but supported. Each agent gets its own token (so you can revoke them independently). They'll race on task pickup — whichever polls first wins the task, the other waits for the next one. This is **not** how you do multi-host fan-out (one deploy → N agents in parallel); that's a roadmap item.

Practical uses:
- **Blue/green on the same environment** during a cutover window
- **Replacing an agent** without downtime — bring up the new token-holder, verify it registers, then revoke the old token

## Rotation

```
1. Dashboard → Agent Tokens → Generate (new token, e.g. "prod-host-rotated-2026-05")
2. On the host: edit ~/orbit-agent.env, replace ORBIT_AGENT_TOKEN=
3. sudo systemctl restart orbit-agent
4. Verify "Registered with Orbit server" in `orbit-agent logs --since "5 minutes ago"`
5. Dashboard → revoke the old token
```

The agent reads the env file at startup, so a restart is needed (no SIGHUP).

## Revoking

Dashboard → Agent Tokens → **Revoke** next to the token.

After revoke:
- The agent's next poll returns `401 Unauthorized` → the agent logs the failure and waits for retry
- No new tasks can be dispatched to anyone holding that token
- The agent stays running but in a degraded state until you update the env file with a fresh token

Revoke immediately if a token leaks (committed to git, posted to chat, etc.). Generate a replacement, update the host, restart the agent.

## What a token can do

Within its environment:
- Register the agent (one initial call on startup)
- Poll for deployment tasks
- Stream deployment status updates (stdout/stderr, exit codes, completion status)
- Send heartbeats so the dashboard shows the agent online

What a token **cannot** do:
- Access other environments (scope is enforced server-side)
- Read the GraphQL API as a user (use [Personal Access Tokens](/docs/api/personal-access-tokens) for that)
- Modify environment config (read-only — config edits are user-only)
- See other users' data

## Auditing

Each token's `last_used_at` is shown in the dashboard. Tokens unused for 90 days are eligible for the auto-prune sweep (configurable per-environment in a future release — today they stay live until manually revoked).

The deployment history shows which token authenticated each run, so post-incident you can trace a bad deploy back to a specific agent.
