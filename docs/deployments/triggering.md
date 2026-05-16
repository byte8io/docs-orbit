---
sidebar_position: 2
title: Triggering deploys
description: Three ways to trigger a deploy — dashboard click, agent CLI, GraphQL API. Plus the --watch flag for streaming logs locally.
---

# Triggering deploys

Three ways to fire a deploy. All of them produce identical results — same task, same execution, same audit trail.

## 1. Dashboard

Environment page → **Deploy**. Fill in:

- **Type**: `code` or `full`. ([deploy types](/docs/deployments/deploy-types))
- **Version**: leave blank (auto-generated) or set your own label (e.g. release tag).
- **Git Ref**: leave blank (uses the env's branch) or pin to a SHA / tag / branch.

Click Deploy. The task is queued; the agent picks it up on its next poll (≤5s). The page switches to live log streaming.

Best for: ad-hoc deploys, the first deploy on a new environment, anyone without shell access to the host.

## 2. Agent CLI (on the host)

If you have SSH to the host, `orbit-agent deploy` triggers from the command line:

```bash
ssh prod 'orbit-agent deploy'                                     # code deploy, branch=main
ssh prod 'orbit-agent deploy --type full'                         # full pipeline
ssh prod 'orbit-agent deploy --type code --git-ref abc1234'       # specific commit
ssh prod 'orbit-agent deploy --type full --git-ref v3.0.1'        # specific tag
ssh prod 'orbit-agent deploy --version "hotfix-2026-05-16"'       # custom version label
```

The agent talks to the same control plane endpoint the dashboard uses. The deploy still shows up in the dashboard's deployment history.

### `--watch` — stream logs locally

```bash
ssh prod 'orbit-agent deploy --type full --watch'
```

`--watch` blocks until the deploy completes (or fails), streaming the live log to your terminal. Exit code reflects deployment status — 0 on success, non-zero on failure. Useful from CI scripts that want to fail the build when the deploy fails.

Without `--watch`, `orbit-agent deploy` returns immediately after queueing — fire-and-forget mode.

## 3. GraphQL API

For CI/CD or your own tooling, use the GraphQL endpoint with a [Personal Access Token](/docs/api/personal-access-tokens).

```bash
curl -X POST https://orbit.byte8.io/graphql \
  -H "Authorization: Bearer $ORBIT_PAT" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation Create($input: CreateDeploymentInput!) { createDeployment(input: $input) { id status } }",
    "variables": {
      "input": {
        "environmentId": "env_01HXYZ...",
        "deployType": "FULL",
        "gitRef": "abc1234"
      }
    }
  }'
```

Returns the deployment ID; poll `deployment(id:)` for status, or subscribe via the dashboard's per-deploy log viewer.

## GitHub Actions

The two patterns. Pick one based on your appetite for SSH-from-CI vs API-from-CI.

### Pattern A: SSH to host

Simple if you already have SSH access from your CI runners:

```yaml
- name: Deploy to production
  run: ssh prod 'orbit-agent deploy --type full --git-ref ${{ github.sha }} --watch'
```

Pros: no PAT to manage, the deploy blocks until done, exit code propagates.
Cons: requires an SSH key in your CI secrets, and your runners must reach prod.

### Pattern B: GraphQL via PAT

Cleaner separation — no SSH from CI at all:

```yaml
- name: Trigger deploy
  env:
    ORBIT_PAT: ${{ secrets.ORBIT_PAT }}
  run: |
    curl -fsSL -X POST https://orbit.byte8.io/graphql \
      -H "Authorization: Bearer $ORBIT_PAT" \
      -H "Content-Type: application/json" \
      -d '{
        "query": "mutation { createDeployment(input: { environmentId: \"env_01HXYZ...\", deployType: FULL, gitRef: \"'"${{ github.sha }}"'\" }) { id } }"
      }'
```

The CI job exits as soon as the deploy is queued. To block on completion, poll `deployment(id:)` in a follow-up step. (Or just `ssh prod 'orbit-agent deploy --watch'` instead — pragmatic combo.)

## Scheduling

There's no built-in scheduler today. To deploy at a specific time:

- **GitHub Actions `schedule:`** trigger pointing at the GraphQL mutation
- **`cron` on a controller host** firing `orbit-agent deploy` over SSH
- **Anything that can POST** to the GraphQL endpoint with a PAT

A first-class scheduling UI in the dashboard is on the roadmap.

## What gets recorded

Every triggered deployment shows up in the dashboard with:

- Trigger source (dashboard click / CLI / API)
- Triggering user (or PAT name) — even CLI deploys are tagged with the token used
- Type, version, git_ref
- Status (`pending`, `running`, `succeeded`, `failed`, `rolled_back`)
- Maintenance window class (`none`, `migrations`, `drift`, `always`, `failed_rollback`)
- Duration
- Full agent log

Useful when post-mortem'ing a bad deploy — you can see exactly who pushed Deploy and what type they picked.
