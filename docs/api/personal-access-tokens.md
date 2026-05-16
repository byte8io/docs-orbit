---
sidebar_position: 2
title: Personal Access Tokens
description: Issue, scope, rotate, revoke PATs for CI, scripts, and your own tooling. Token format obit_<token>, hashed at rest, shown once.
---

# Personal Access Tokens

PATs authenticate the GraphQL API for non-interactive use: CI/CD, scripts, chatops bots, your own dashboards. Each PAT is owned by a user and inherits that user's permissions. Two-tier model:

1. **Personal Access Tokens (this page)** — user-scoped, for talking to the GraphQL API.
2. **[Agent tokens](/docs/environments/agent-tokens)** — environment-scoped, for `orbit-agent` to register and poll for tasks. Different format, different scope.

## Format

```
obit_<32 hex chars prefix>_<32 hex chars secret>
```

`obit_` (one letter different from `obt_` for agent tokens) + a prefix the dashboard shows for identification + a secret that's hashed at rest. The full string is shown on creation only.

## Creating

Dashboard → **Profile → Personal Access Tokens → New Token**.

1. Name the token (e.g. `github-actions-prod-deploys`, `chatops-bot`, `migration-script-2026-05`). Names are searchable in the audit log.
2. Optionally set an **expiry** (30 days, 90 days, 1 year, never). Tokens with an expiry are auto-revoked at the deadline.
3. Click **Generate**.
4. **Copy the full token immediately.** Only the prefix is shown after this; the secret is gone.

Store it in your CI secrets manager (GitHub Actions secrets, Vault, etc.). Never commit to a repo. Never echo to chat.

## Authenticating requests

```bash
curl -X POST https://orbit.byte8.io/graphql \
  -H "Authorization: Bearer obit_..." \
  -H "Content-Type: application/json" \
  -d '{"query":"{ environments { id name } }"}'
```

`Authorization: Bearer <token>`. No other auth mechanisms — no API key headers, no query-param tokens, no Basic auth.

## What a PAT can do

A PAT inherits the **full permissions of its owning user** at the time of use. If you're an admin on the account, your PAT is an admin on the account. If you're a read-only collaborator (when team sharing ships), your PAT is read-only.

There's no per-PAT scope today (no "this PAT can only create deployments on Production"). Scoping is on the roadmap; today, treat PATs as a session-replacement for your user.

The blast radius if a PAT leaks is therefore the same as your user account being compromised. Mitigations:
- Set expiries
- Use one PAT per use case (so revocation is granular)
- Audit `last_used_at` regularly (dashboard → Profile → PATs)
- Rotate on any suspicion of leak

## CI patterns

### GitHub Actions

```yaml
name: Deploy to production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger Orbit deploy
        env:
          ORBIT_PAT: ${{ secrets.ORBIT_PAT }}
          ORBIT_ENV_ID: env_01HXYZ...
        run: |
          DEPLOYMENT_ID=$(curl -fsSL -X POST https://orbit.byte8.io/graphql \
            -H "Authorization: Bearer $ORBIT_PAT" \
            -H "Content-Type: application/json" \
            -d '{
              "query": "mutation { createDeployment(input: { environmentId: \"'"$ORBIT_ENV_ID"'\", deployType: FULL, gitRef: \"'"${{ github.sha }}"'\" }) { id } }"
            }' | jq -r .data.createDeployment.id)
          echo "Deployment queued: $DEPLOYMENT_ID"

      - name: Wait for completion
        env:
          ORBIT_PAT: ${{ secrets.ORBIT_PAT }}
        run: |
          for i in {1..60}; do
            STATUS=$(curl -fsSL -X POST https://orbit.byte8.io/graphql \
              -H "Authorization: Bearer $ORBIT_PAT" \
              -H "Content-Type: application/json" \
              -d '{"query":"{ deployment(id: \"'"$DEPLOYMENT_ID"'\") { status } }"}' \
              | jq -r .data.deployment.status)
            echo "Status: $STATUS"
            case "$STATUS" in
              SUCCEEDED) exit 0 ;;
              FAILED|ROLLED_BACK) exit 1 ;;
            esac
            sleep 5
          done
          echo "Timeout waiting for deploy"
          exit 1
```

Or skip the polling and use the simpler SSH-from-CI pattern with `--watch` (see [triggering](/docs/deployments/triggering#pattern-a-ssh-to-host)).

### Shell script with `gh` CLI for SHA lookup

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO=byte8io/your-store
SHA=$(gh api repos/$REPO/commits/main --jq .sha)

curl -fsSL -X POST https://orbit.byte8.io/graphql \
  -H "Authorization: Bearer $ORBIT_PAT" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { createDeployment(input: { environmentId: \\\"$ORBIT_ENV_ID\\\", deployType: FULL, gitRef: \\\"$SHA\\\" }) { id } }\"}"
```

## Rotation

```
1. Dashboard → Profile → PATs → Generate (new token, descriptive name)
2. Update your CI secret with the new token
3. Run one job to verify the new token works
4. Dashboard → revoke the old token
```

Rotate on:
- Any suspected compromise
- Departure of a team member who had access to the secret
- Routine 90/180-day rotation (good hygiene)
- After a major incident (CYA)

## Revoking

Dashboard → Profile → PATs → **Revoke** next to the token.

After revoke:
- All future requests with that token return `401 Unauthorized`
- In-flight requests (mid-execution server-side) complete; only future calls fail
- The token's audit history stays — you can still see what it did

Revoke immediately if a token leaks. Generate a replacement, update consumers, then revoke the leaked one.

## Auditing

Dashboard → Profile → PATs shows:

- Token name + prefix (so you can match against logs)
- Creation date
- Last used at
- Expiry (if set)
- IP of last use

For request-level audit (which token triggered which deploy), the deployment history row shows the PAT name.

## Limits

| Limit | Value |
|---|---|
| PATs per user | 50 |
| Rate limit per PAT | 60 req/min |
| Max expiry | 1 year (longer? please rotate instead) |
| Min name length | 3 chars |

50 should be far more than any sane user needs. If you hit the cap, you're probably treating PATs as per-script-invocation rather than per-use-case — consolidate.
