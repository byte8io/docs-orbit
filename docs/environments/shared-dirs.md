---
sidebar_position: 2
title: Shared dirs and files
description: Per-release vs shared state. The defaults mirror PHP Deployer's Magento recipe. Override when you have extra persistent paths.
---

# Shared dirs and files

The split between **per-release** state and **shared** state is what makes zero-downtime deploys work. Each release lives in its own `releases/{TIMESTAMP}/` directory; the shared paths get symlinked into every release so files persist across deploys.

## The defaults

When `shared_dirs` and `shared_files` are blank in the dashboard, the agent uses these defaults (`orbit-agent/src/executor.rs`, `DEFAULT_SHARED_DIRS` / `DEFAULT_SHARED_FILES`):

| Shared dirs | Why |
|---|---|
| `var/log` | Logs persist across deploys |
| `var/session` | File-based session storage |
| `var/backups` | `bin/magento setup:backup` output |
| `var/import` | Import payloads |
| `var/import_history` | Import history records |
| `var/export` | Export output |
| `var/report` | Magento reports |
| `var/tmp` | Temp files used by import/export |
| `var/composer_home` | Composer's per-user cache |
| `var/importexport` | Bulk operations staging |
| `pub/media` | User uploads (the big one — catalog images, CMS uploads) |

| Shared files | Why |
|---|---|
| `app/etc/env.php` | DB creds, crypt key, install date — never goes in git |
| `app/etc/config.php` | Only linked when the release didn't ship its own (universal `-s` guard). If you commit `config.php` per release, the per-release file wins. |

The defaults mirror [PHP Deployer's Magento recipe](https://deployer.org/docs/7.x/recipe/magento2.html) — battle-tested for Magento 2 production.

## Pointedly NOT shared

These get rebuilt every deploy and **must not** be shared:

- `var/cache` — Magento cache. Sharing breaks `cache:flush` post-deploy.
- `var/page_cache` — full-page cache. Same problem.
- `var/view_preprocessed` — preprocessed CSS/Less. Per-release scratch.
- `var/generation` — DI-generated classes. Per-release artefacts.

Sharing any of these causes stale-cache bugs after `setup:upgrade` partially clears them.

## Customising

Override via the dashboard's environment → Magento tab. Two textareas, one path per line.

:::warning Filling the textareas REPLACES the defaults — it doesn't merge.

If you need to add one extra path, you have to repeat the entire default list. Otherwise you'll silently lose the defaults.
:::

Example — adding a GeoIP database that ships out-of-band:

```
# shared_dirs
var/log
var/session
var/backups
var/import
var/import_history
var/export
var/report
var/tmp
var/composer_home
var/importexport
pub/media
var/geoip
```

```
# shared_files
app/etc/env.php
app/etc/config.php
var/geoip/GeoLite2-Country.mmdb
```

## Common shared-path gotchas

| Symptom | Cause | Fix |
|---|---|---|
| Customers logged out every deploy | Typo — `var/sessions` (plural) instead of `var/session` | Use the singular. The default list has it right; double-check overrides. |
| `setup:upgrade` exit 1 + missing `*Factory.php` in autoload | `var/generation` was shared and contains stale classes | Remove `var/generation` from shared list; `rm -rf shared/generation` |
| Bash glob doesn't expand | Patterns aren't supported — list each path literally | One path per line. No `*` or `?` |
| Symlinks have wrong permissions | The shared dir was created by root, not the deploy user | `sudo chown -R deploy:www-data shared/ && find shared -type d -exec chmod 2775 {} \;` |
| Custom path 404s after deploy | Path is below the release root but not in the shared list | Add to `shared_dirs`; agent symlinks it into the next release |

## How it works (per-release)

After cloning a release into `releases/{TIMESTAMP}/`:

```
1. rm -rf the to-be-replaced paths inside the release dir
   (e.g. release/var, release/pub/media — they may exist as
   real dirs from git or composer install)
2. mkdir -p the parent dirs the symlinks need (e.g. release/app/etc)
3. ln -sfn ../../shared/var/log release/var/log
   ...one per shared_dir...
4. ln -sfn ../../shared/app/etc/env.php release/app/etc/env.php
   ...one per shared_file...
   (config.php is universally guarded with [ -f shared/app/etc/config.php ])
```

After step 4 the release directory looks complete — the release-specific code plus symlinks into shared state. The atomic `ln -sfn current → releases/{TIMESTAMP}/` happens later, after Composer + DI + static-content all succeed.

## Seeding shared on a brand-new install

Greenfield: `init` creates empty shared dirs. The first deploy populates them with the cloned code's defaults (composer adds `var/composer_home`, the first request from PHP-FPM creates `var/session/sess_*`, etc.).

**You still need to seed two things by hand** before the first deploy if you used the greenfield path:

```bash
# Required — Magento can't boot without it
cp /path/to/working/env.php /var/www/magento/shared/app/etc/env.php

# Optional — only if your repo doesn't track app/etc/config.php
cp /path/to/working/config.php /var/www/magento/shared/app/etc/config.php
```

The migration path (`init --magento-source ...`) handles both automatically by moving them out of the legacy install.
