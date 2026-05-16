---
sidebar_position: 3
title: First deployment
description: End-to-end walkthrough of your first deploy, what the agent prints, and how to verify the round-trip.
---

# First deployment

You've finished [Quick start](/docs/getting-started/quick-start). Now you trigger the first deploy and verify the round-trip. This page documents what to expect — the log lines you'll see, the file layout afterwards, and the most common first-deploy gotchas.

## Trigger the deploy

In the dashboard → environment page → **Deploy**.

- **Type:** `full` for the first deploy. Exercises the whole pipeline: clone → composer → `setup:db:status` → conditional `setup:upgrade` → `setup:di:compile` → `setup:static-content:deploy` → swap → `cache:flush` → health check. ([deploy types](/docs/deployments/deploy-types))
- **Version:** leave blank (auto-generated as `release-{YYYYMMDD_HHMMSS}`).
- **Git Ref:** leave blank to use the environment's branch (`main` by default).

Click **Deploy**. The agent picks the task up on its next poll (≤5s).

## What you'll see in the log

Open the deployment in the dashboard for live streaming, or tail the agent log on the host:

```bash
orbit-agent logs    # tail -f wrapper around journalctl
```

Expected sequence, ~2–3 minutes total:

```
git clone --branch main … releases/<TIMESTAMP>      ~15-30s
rm -rf var pub/media; mkdir -p app/etc pub generated <1s
ln -sfn shared/var/{log,session,…} release/var/{…}   <1s
ln -sfn shared/pub/media release/pub/media           <1s
ln -sfn shared/app/etc/env.php release/app/etc/…     <1s
[ -f shared/app/etc/config.php ] && ln -sfn …        <1s
composer install --no-dev --optimize-autoloader      ~25s
setup:db:status                                       <1s
[ if migrations needed:                                       ]
[   maintenance:enable in release_dir                         ]
[   setup:upgrade in release_dir                       ~30s   ]
[   maintenance:disable in release_dir                        ]
setup:di:compile                                     ~45s
setup:static-content:deploy -f                       ~1-2 min
ln -sfn releases/<TIMESTAMP> current                 <1s
cd current && bin/magento cache:flush                <1s
Health check passed url=http://127.0.0.1/health_check.php
Deployment completed successfully
```

## Verify the round-trip

From the host:

```bash
readlink -f /var/www/magento/current
# → /var/www/magento/releases/<TIMESTAMP>

ls /var/www/magento/releases/
# → exactly one release after the first deploy

ls -la /var/www/magento/current/var
# → symlinks pointing into shared/

curl -i http://127.0.0.1/health_check.php
# → HTTP/1.1 200 OK
```

From the public network:

```bash
curl -i https://your-store.example.com/
# → 200 OK; storefront markup
```

## The file layout you should have

```
/var/www/magento/
├── current → releases/20260516_104530/
├── releases/
│   └── 20260516_104530/        ← live
└── shared/
    ├── app/etc/env.php          ← never in git; agent only writes once
    ├── app/etc/config.php       ← optional; agent links if present
    ├── nginx.conf               ← what the vhost include resolves
    ├── pub/media/               ← user uploads (persists across deploys)
    └── var/
        ├── log/
        ├── session/
        ├── backups/
        ├── import/
        ├── import_history/
        ├── export/
        ├── report/
        ├── tmp/
        ├── composer_home/
        └── importexport/
```

Anything `var/cache`, `var/page_cache`, `var/view_preprocessed`, `var/generation` is **not** shared — those are per-release scratch space. Sharing them causes stale-cache bugs after `setup:upgrade`.

## Common first-deploy failures

| Symptom | Cause | Fix |
|---|---|---|
| `Register failed (401)` | Token typo / revoked | Re-issue from the dashboard, update `~/orbit-agent.env` |
| `git clone … exit 128 — Repository not found` | Deploy key not added to git host | Add `~/.ssh/id_ed25519.pub` to repo → Deploy Keys |
| `composer install … exit 2 — lock file does not contain compatible packages` | PHP version drift between dev and prod | Pin `config.platform.php` in `composer.json` to prod's PHP, regenerate `composer.lock` |
| `Marketplace credentials missing for repo.magento.com` | No `auth.json` in `~/.composer/` | See [installation → Composer Marketplace](/docs/getting-started/installation#composer-marketplace-credentials-authjson) |
| Health check `502` | nginx upstream socket mismatch | `grep -r php\.fpm\.sock /etc/nginx/` — match your installed PHP-FPM socket |
| Health check `500` + `cache_dir … is not writable` | `shared/var/` not group-writable by php-fpm | Re-run `init` with `--web-user www-data`, or `sudo chgrp -R www-data shared && find shared -type d -exec chmod 2775 {} \;` |
| `setup:di:compile`: "modules are not enabled" | Missing `app/etc/config.php` | Drop a working one into `shared/app/etc/config.php` |

When in doubt: dashboard's per-deployment log viewer shows every shell command's stdout/stderr in real time. ([troubleshooting](/docs/troubleshooting))

## What just happened, end-to-end

```
Mac dev   ─git push→   GitHub   ←──poll──   orbit-server   ←──poll──   orbit-agent (on prod)
                                                  │                        │
                                                  └──── task scheduled ────┘
                                                                           │
                                          git clone → link shared → composer →
                                          setup:upgrade (if needed) → di:compile →
                                          static-content:deploy → atomic swap →
                                          cache:flush → health check → DONE
```

Every shell command's stdout/stderr streams to the dashboard. Failure mid-way triggers auto-rollback. ([rollback](/docs/deployments/rollback))

## What to do next

- **Schedule a code-only deploy** (no DB migrations) and watch `curl -sI` stay 200 throughout. That's the zero-downtime guarantee.
- **Trigger one from CI** — see [Personal Access Tokens](/docs/api/personal-access-tokens) for the GraphQL recipe.
- **Add a second environment** (Staging) by repeating the install + init on another host.
