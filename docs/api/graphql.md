---
sidebar_position: 1
title: GraphQL API
description: GraphQL endpoint at orbit.byte8.io/graphql. Single endpoint for queries + mutations. Authenticate with Personal Access Tokens for scripts and CI.
---

# GraphQL API

The dashboard talks to the same GraphQL API your scripts can use. Endpoint:

```
https://orbit.byte8.io/graphql
```

Single endpoint for queries + mutations + subscriptions. Schema is introspectable — point your favourite GraphQL client at it (Apollo Sandbox, Insomnia, GraphiQL) for live exploration.

## Authentication

Two modes:

1. **Session cookie** — what the dashboard uses. Set by signing in to `auth.byte8.io`. Not usable from scripts.
2. **Personal Access Token (PAT)** — `Authorization: Bearer obit_<token>`. Right choice for CI, scripts, your own tooling. See [Personal Access Tokens](/docs/api/personal-access-tokens) for issuance + lifecycle.

```bash
curl -X POST https://orbit.byte8.io/graphql \
  -H "Authorization: Bearer $ORBIT_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ environments { id name host deployBranch } }"}'
```

## Key queries

### `environments` — list all your environments

```graphql
{
  environments {
    id
    name
    host
    deployPath
    deployBranch
    healthCheckUrl
    lastDeploymentAt
    agentLastSeenAt
    isOnline
  }
}
```

### `environment(id:)` — single environment with deploys

```graphql
{
  environment(id: "env_01HXYZ...") {
    id
    name
    deployments(first: 20) {
      edges {
        node {
          id
          version
          gitRef
          deployType
          status
          maintenanceWindow
          startedAt
          completedAt
          durationSeconds
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}
```

`deployments` is Relay-style cursor pagination (see [`byte8-graphql-pagination`](https://github.com/byte8io/byte8.io/tree/main/packages/rust/byte8-graphql-pagination) for the schema shape).

### `deployment(id:)` — one deploy with log

```graphql
{
  deployment(id: "dep_01HXYZ...") {
    id
    status
    maintenanceWindow
    log              # full agent stdout/stderr
    errorMessage     # populated when status = failed
  }
}
```

The `log` field returns the entire concatenated agent output for the deploy. For very long deploys (large static-content:deploy), this can be megabytes — page it with `log(offset:, limit:)` once you're past a hundred lines.

### `dashboardStats` — aggregate counters

```graphql
{
  dashboardStats {
    totalEnvironments
    onlineAgents
    deploymentsLast24h
    successRate30d
  }
}
```

## Key mutations

### `createDeployment` — trigger a deploy

```graphql
mutation Create($input: CreateDeploymentInput!) {
  createDeployment(input: $input) {
    id
    status
    version
  }
}
```

Variables:

```json
{
  "input": {
    "environmentId": "env_01HXYZ...",
    "deployType": "FULL",
    "gitRef": "abc1234",
    "version": "release-2026-05-16-hotfix"
  }
}
```

`deployType`: `CODE` or `FULL`. `gitRef` and `version` are optional.

### `rollbackDeployment` — manual rollback

```graphql
mutation { rollbackDeployment(environmentId: "env_...") { id status } }
```

Rolls back to the most recent successful deployment that isn't `current`. To roll back further:

```graphql
mutation {
  rollbackDeployment(environmentId: "env_...", targetReleaseTimestamp: "20260514_175200") {
    id status
  }
}
```

### `createEnvironment` / `updateEnvironment` / `deleteEnvironment`

Standard CRUD. See the schema (introspect or check `apps/orbit/server/crates/orbit-server/src/graphql/`).

### `createAgentToken` / `revokeAgentToken`

For agent token lifecycle. `createAgentToken` returns the plaintext token **once** in its response — store it immediately.

```graphql
mutation { createAgentToken(environmentId: "env_...", name: "prod-host") { token } }
```

## Error model

Transport errors (auth, permission, malformed query) come back as standard GraphQL `errors[]` with a `code` extension:

```json
{
  "errors": [
    {
      "message": "Not authorised",
      "extensions": { "code": "UNAUTHORIZED" }
    }
  ]
}
```

Codes:
- `UNAUTHORIZED` — missing or invalid `Authorization` header
- `FORBIDDEN` — token doesn't have access to the resource (other user's environment)
- `NOT_FOUND` — environment / deployment / token doesn't exist
- `BAD_REQUEST` — malformed input (e.g. invalid `gitRef` shape)
- `INTERNAL` — surprise server error

Field-level validation errors (e.g. "version label too long") come back **inside the payload**:

```json
{
  "data": {
    "createDeployment": {
      "errors": [{ "field": "version", "message": "must be ≤ 64 chars" }]
    }
  }
}
```

So your client can render per-field errors without parsing exception text.

## Rate limiting

Per-token: 60 requests/minute. Standard for write mutations; reads are more generous. Exceeded → HTTP 429 with `Retry-After` header.

If you're polling deploy status, back off: poll every 5s for the first 30s, then every 15s. Don't tight-loop.

## Versioning

Schema is additive. Fields are deprecated with `@deprecated(reason: "...")` and removed in a major version with at least 6 months notice. The current major is `v1`; the `/graphql` endpoint always serves the latest stable major.

For breaking changes (rare), there's a header-pinned escape hatch:

```
X-Orbit-Schema-Version: 2026-01-01
```

(Not used in practice yet — the schema has been stable since v1.0.)

## Schema introspection

```bash
curl -X POST https://orbit.byte8.io/graphql \
  -H "Authorization: Bearer $ORBIT_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __schema { types { name kind } } }"}'
```

Or hit the live GraphiQL UI at `https://orbit.byte8.io/graphql` (signed-in users only — sandbox URL for PAT-only clients is on the roadmap).

## Subscriptions (live deploy logs)

```graphql
subscription { deploymentLog(deploymentId: "dep_...") { line stream } }
```

WebSocket transport at `wss://orbit.byte8.io/graphql/ws`. The dashboard uses this for live log streaming; you can use the same for terminal UIs or chatops bots.

Subscription delivery is best-effort — at-most-once. If you need guaranteed delivery, poll the `deployment(id:)` log field instead.
