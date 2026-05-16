---
sidebar_position: 1
title: Code vs full deploys
description: Two deploy types — code (no Composer, no static-content) and full (the whole pipeline). When to pick which, and the v0.4.0 code-deploy safety net.
---

# Code vs full deploys

Orbit has two deploy types: **code** and **full**. Pick based on what changed in the release.

## At a glance

| | `code` | `full` |
|---|---|---|
| `git clone` | ✓ | ✓ |
| Link shared dirs/files | ✓ | ✓ |
| `composer install` | ✗ (re-uses `vendor/` from previous release) | ✓ |
| `setup:db:status` | ✓ | ✓ |
| `setup:upgrade` (when needed) | ✓ (v0.4.0+ safety net) | ✓ |
| `setup:di:compile` | ✗ | ✓ |
| `setup:static-content:deploy` | ✗ | ✓ |
| Symlink swap | ✓ | ✓ |
| `cache:flush` | ✓ | ✓ |
| Health check | ✓ | ✓ |
| Typical duration | 30–60s | 2–5 min |

## When to use `code`

A `code` deploy is the right call when the change is **PHP source only** — no Composer dependency change, no XML/Less/JS that needs a fresh `setup:di:compile` or `setup:static-content:deploy`.

Examples:
- Bug fix in a PHP file under `app/code/`
- Updated `view/frontend/templates/*.phtml` (CMS-style template tweak)
- Hot-fix to a custom plugin

Tradeoff: dramatically faster (30–60s vs 2–5min), but **the new release re-uses the previous release's `vendor/` and `pub/static/`** via symlink. If those don't match the new source, weird things happen — stale class definitions, missing factory classes, 404s on static assets.

## When to use `full`

When you've changed anything that affects generated code or static output:

- `composer.json` / `composer.lock`
- New module installed
- `etc/di.xml`, `etc/events.xml`, `etc/module.xml` — anything DI-touchable
- `view/frontend/web/*.{less,css,js}` — static-content needs rebuilding
- Theme changes
- Anytime you're not sure

Default to `full`. The minute saved by `code` isn't worth the dead site if you guessed wrong.

## The v0.4.0 code-deploy safety net

Before v0.4.0, code deploys silently shipped broken sites when modules bumped `setup_version` without a schema change — Magento wouldn't run migrations because the type was `code`, but `setup_module` was now out of date, and the storefront 500'd until someone realised they needed `setup:upgrade`.

From v0.4.0, **code deploys also run `setup:db:status` and module/theme drift detection**. If either reports work to do:
- DB migrations needed → maintenance window flips for the upgrade, then back. Maintenance window class becomes `migrations`.
- Module registration drift → `setup:upgrade` runs (and optionally flips maintenance, if `maintenance_on_drift = true`). Class becomes `drift`. ([drift detection](/docs/zero-downtime/drift-detection))

In practice this means **`code` deploys are safe**. Worst case you get an extra 30s and a maintenance flip you didn't expect. Best case (and the common case) — zero downtime, fast deploy.

## Triggering with a specific type

Dashboard → Deploy → **Type** dropdown.

CLI:
```bash
orbit-agent deploy --type code              # branch=main, fast
orbit-agent deploy --type full              # full pipeline
orbit-agent deploy --type full --git-ref v3.0.1  # specific tag
orbit-agent deploy --type full --watch      # stream logs locally
```

GraphQL (CI):
```graphql
mutation {
  createDeployment(input: {
    environmentId: "env_..."
    deployType: FULL
    gitRef: "abc1234"
  }) { id status }
}
```

See [Personal Access Tokens](/docs/api/personal-access-tokens) for the auth header.

## How the agent makes `code` faster

It skips the expensive steps and re-uses the previous release's heavy artefacts:

```
NEW_RELEASE/vendor → ../<previous-release>/vendor          (symlink)
NEW_RELEASE/pub/static → ../<previous-release>/pub/static  (symlink)
NEW_RELEASE/generated → ../<previous-release>/generated    (symlink)
```

This is why `code` is fast: no Composer download, no di:compile, no static-content:deploy. It's also why `code` is dangerous when `composer.json` changed — the symlinked `vendor/` is from the old release.

After the swap, when the old release is pruned (after N more deploys), the agent breaks the symlinks and copies the targets into the still-live release first. So you can't accidentally `rm -rf` the live release's `vendor/`.

## Recommended workflow

- **Default CI deploys**: `full`. Reliable, predictable, ~3 min.
- **Emergency hot-fixes**: `code`. 30s. Only when you're certain it's a PHP-source-only change.
- **First deploy on a new environment**: `full`. Always.
- **After a `composer update`**: `full`. Always.
- **Routine prod deploys**: pick based on the commit. `git diff main HEAD -- composer.json view/frontend/` will tell you whether `code` is safe.
