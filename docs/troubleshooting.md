---
sidebar_position: 99
title: Troubleshooting
description: Common deploy failures, what causes them, and how to fix them. Categorised by where in the pipeline they surface.
---

# Troubleshooting

The first place to look: the per-deployment log in the dashboard. Every shell command's stdout/stderr streams there in real time. The second place: `orbit-agent logs` on the host.

## Agent registration

| Symptom | Cause | Fix |
|---|---|---|
| `Register failed (401 Unauthorized)` | Token typo, or revoked in the dashboard | Re-issue from dashboard → environment → Agent Tokens. Update `~/orbit-agent.env`. `sudo systemctl restart orbit-agent`. |
| `Register failed (404 Not Found)` | `ORBIT_SERVER_URL` is wrong | Check the env file. SaaS is `https://orbit.byte8.io`. Self-hosted: your actual control plane URL. |
| `Register failed (connection refused)` | Network can't reach the control plane | `curl -fsSI $ORBIT_SERVER_URL/health` from the host. Firewall / VPN / proxy. |
| Agent doesn't come "online" in the dashboard | Service crashed silently on first start | `journalctl -u orbit-agent --since "5 minutes ago"`. Usually a missing env var or unreadable env file (`chmod 600 ~/orbit-agent.env`). |

## Git clone

| Symptom | Cause | Fix |
|---|---|---|
| `git clone … exit 128 — Repository not found` | Deploy key not added to git host | Add `~/.ssh/id_ed25519.pub` to repo → Settings → Deploy keys (read-only is fine). |
| `Host key verification failed` | `known_hosts` doesn't have the git host | `ssh -T git@github.com` once, answer "yes". |
| `Permission denied (publickey)` | Wrong key, or key not loaded | `ssh -T git@github.com` to confirm the right key is being used. Check `~/.ssh/config` doesn't override. |
| Clone takes forever | Large repo + slow network | Consider shallow clone (PROGRESS: `--depth=50` is on the roadmap as an env option). |

## Composer

| Symptom | Cause | Fix |
|---|---|---|
| `composer install … exit 2 — lock file does not contain compatible packages` | PHP version drift between dev and prod | Pin `config.platform.php` in `composer.json` to prod's PHP version, regenerate `composer.lock`. |
| `Authentication required: repo.magento.com` | Marketplace creds missing | Create `~/.composer/auth.json` (see [installation](/docs/getting-started/installation#composer-marketplace-credentials-authjson)). |
| `composer install` exits 0 but `vendor/` is empty | Stale cache | `rm -rf var/composer_home/cache/*`, redeploy. |
| Memory exhaustion | Composer needs more than PHP's CLI memory limit | `php -d memory_limit=-1 ...` — or set `memory_limit = 2G` in the PHP CLI ini. |

## `setup:upgrade`

| Symptom | Cause | Fix |
|---|---|---|
| Exit 1 + "modules are not enabled" | Missing `app/etc/config.php` | Drop a working one into `shared/app/etc/config.php`. |
| Exit 1 + missing `*Factory.php` in autoload | Stale `generated/` from prior install — should be per-release after agent fix | Redeploy. First `di:compile` rebuilds factories. If sharing `shared/generated/`, delete: `rm -rf /var/www/magento/shared/generated`. |
| Hangs forever | Pending data patch with no I/O (rare) | Check `bin/magento setup:db-data:status` for the stuck patch class. Manual `bin/magento setup:upgrade` from a debug shell often surfaces the issue. |
| "Please upgrade your database" on storefront after deploy completes | Drift detection missed it — module bumped a version that needed upgrade | Verify drift is enabled. Check `SELECT module, schema_version FROM setup_module` against the code's `module.xml`. |

## `di:compile` / `static-content:deploy`

| Symptom | Cause | Fix |
|---|---|---|
| `di:compile` exit 1 — undefined class | Module's `requirejs-config.js` or `di.xml` references a non-existent class | Fix the offending file. If recent commit, `git revert` and redeploy. |
| `static-content:deploy` exits 0 but pages have unstyled markup | Theme failed silently, ended up with empty CSS | Check theme `require.js` config and `package.json`. Common with newly-added themes. |
| Slow (>5 min) | First deploy on a new locale — Magento compiles every locale's static content | Reduce `--locales` in the agent's static-content step if you don't need all locales (PROGRESS roadmap: per-locale opt-in). |

## Symlink swap

| Symptom | Cause | Fix |
|---|---|---|
| `ln -sfn: permission denied` | Deploy user doesn't own `current` or its parent | `sudo chown $USER:www-data /var/www/magento /var/www/magento/current`, redeploy. |
| Site 500s for a few seconds after the swap | OPcache hasn't picked up new files | `opcache_reset()` via a post-swap hook, or set `opcache.validate_timestamps=1`. Tradeoff: validation costs perf. |
| Site immediately reverts (auto-rollback) | Health check failed | See "Health check" below. |

## Health check

| Symptom | Cause | Fix |
|---|---|---|
| Health check `502` | nginx upstream socket mismatch | `grep -r php\.fpm\.sock /etc/nginx/` — match your installed PHP-FPM socket path. |
| Health check `500` + `cache_dir … is not writable` | `shared/var/` not group-writable by php-fpm | Re-run `init` with `--web-user www-data`, or `sudo chgrp -R www-data shared && find shared -type d -exec chmod 2775 {} \;`. |
| Health check timeout | Health endpoint too slow | Replace with a thin custom endpoint that responds in `<100ms`. Don't health-check the homepage. |
| Health check `404` | URL path wrong | Default is `http://127.0.0.1/health_check.php`. Magento ships this at `pub/health_check.php`. Confirm the file exists in the deployed release. |

## After-deploy

| Symptom | Cause | Fix |
|---|---|---|
| Customers logged out every deploy | Typo in `shared_dirs` (`var/sessions` plural instead of `var/session`) | Fix the shared list. The default has it right; double-check overrides. |
| User uploads disappearing | `pub/media` not in `shared_dirs` | Add it. Verify with `readlink current/pub/media`. |
| `current` symlink dangling | Old release pruned while symlinked | Sanity-check `keep_releases` is ≥ 5; smaller values risk pruning the live release in failure paths. |
| Stale CSS / JS in browser | CDN caching old `static_content_signature` | Bump the static-content signature (`bin/magento config:set system/full_page_cache/varnish/access_list ...` or wait for TTL). |

## Maintenance window

| Symptom | Cause | Fix |
|---|---|---|
| 503 lasts longer than `setup:upgrade` should | Likely waiting on cron or queue consumer holding a row lock | Set `manage_cron_and_consumers = true` on the env — Orbit kills them before deploy. |
| Site flips 503 even on code-only deploys | Drift detection caught a `setup_version` bump | Inspect `setup_module` vs code (`module.xml`). Either accept the migration window or remove the unnecessary version bump. ([drift detection](/docs/zero-downtime/drift-detection)) |
| Allowlist IPs don't work | nginx isn't passing the real client IP | Configure `set_real_ip_from` + `real_ip_header X-Forwarded-For` for your LB/CDN. See [allowlist IPs](/docs/zero-downtime/allowlist-ips#nginx-behind-a-load-balancer-or-cloudflare). |

## Agent upgrade

| Symptom | Cause | Fix |
|---|---|---|
| `orbit-agent self-upgrade` 404 | Brand-new release artifact not yet uploaded | Wait a few minutes, retry. Verify with the curl probe in [install](/docs/agent/install#verify-a-release-is-published). |
| Agent crashes on first start after upgrade | New version expects an env var that's missing | Re-run `orbit-agent init` to refresh `~/orbit-agent.env` with defaults. |
| Old + new agent both running | Forgot to stop systemd before manual install | `sudo systemctl stop orbit-agent`, verify with `pgrep -af orbit-agent`, restart. |

## Diagnostics quick-reference

| Question | Command |
|---|---|
| Is maintenance mode actually on? | `ls -la /var/www/magento/shared/var/.maintenance.flag` |
| What does external traffic see? | `curl -sI https://your-store.example.com/` |
| Watch maintenance flip live | `watch -n 1 'curl -sI http://127.0.0.1/ \| head -1'` |
| Agent log tail | `orbit-agent logs` or `journalctl -u orbit-agent -f` |
| Recent deploys (DB) | `psql byte8_orbit -c "SELECT version, status, maintenance_window, completed_at FROM deployments ORDER BY started_at DESC LIMIT 10;"` |
| Live release pointer | `readlink -f /var/www/magento/current` |
| All retained releases | `ls -la /var/www/magento/releases/` |
| Shared dir contents | `ls -la /var/www/magento/shared/` |

## Still stuck?

- **Open an issue** against `byte8io/orbit-agent` for agent bugs
- **Email helo@byte8.io** for control-plane issues or licensing
- **Check the changelog** ([/blog](/blog)) — your issue might be a known issue with a fix in a more recent release
