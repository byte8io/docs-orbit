---
sidebar_position: 5
title: app:config:import auto-step
description: Optional Orbit step that runs bin/magento app:config:import between setup:upgrade and the swap, so app/etc/config.php changes land in the DB automatically.
---

# `app:config:import` auto-step

Optional per-environment flag. When enabled, Orbit runs `bin/magento app:config:import` between `setup:upgrade` and the symlink swap. This pushes any changes from `app/etc/config.php` (the env-agnostic configuration file) into the database.

## Background

Magento 2 splits configuration across two files:

- `app/etc/env.php` — environment-specific (DB creds, cache backend, secrets). Never in git.
- `app/etc/config.php` — environment-agnostic (enabled modules, locales, default scopes). **Tracked in git**.

When `config.php` changes are committed and deployed, the underlying core_config_data table doesn't update on its own — you have to run `bin/magento app:config:import` for the changes to take effect. Easy to forget; the symptom is "the config we committed isn't applied".

## Without the auto-step

```
1. Developer runs `bin/magento config:set general/store_information/name "Acme Store"`
2. Developer runs `bin/magento app:config:dump`
3. Developer commits the resulting app/etc/config.php diff
4. Deploy ships
5. Admin → Stores → Configuration → General → Store Information → Name still shows the old value
6. Someone notices a week later, runs `bin/magento app:config:import` manually
```

## With `config_import_enabled = true`

```
1-4. Same as above
5. Orbit deploy runs app:config:import automatically as part of the pipeline
6. Admin reflects the new config immediately post-deploy
```

## Enabling

Dashboard → environment → Settings → `config_import_enabled = true`.

Takes effect on the next deploy.

## Where it runs in the pipeline

```
... setup:upgrade (if needed) ...
↓
[ if config_import_enabled ]
↓
bin/magento app:config:import
↓
setup:di:compile
↓
setup:static-content:deploy
↓
ln -sfn releases/<NEW> current     (swap)
...
```

It runs in the **new** release dir (before the symlink swap). The import reads `app/etc/config.php` from the new release, writes to the database, which is shared across releases.

## No-op case (typical)

When `app/etc/config.php` hasn't changed between deploys, `app:config:import` exits 0 in well under a second. Cheap to leave enabled.

## With pending changes

When the new release's `config.php` differs from the DB state, the import applies the diff:

```
INFO orbit_agent::executor: app:config:import
↪ Processing configuration data from configuration files...
↪ Stores were processed
↪ Websites were processed
↪ System config was processed
```

Visible side-effect: admin → Stores → Configuration → ... reflects the change immediately. Real-time without a manual import.

## When NOT to enable

- **You don't use `app/etc/config.php`**. Some shops manage all config in admin and never commit `config.php`. No reason to add the step.
- **You want manual control** over when config changes land. Rare — most shops want auto-application because forgetting is the bigger risk.

## Failure handling

If `app:config:import` exits non-zero (rare — usually a malformed `config.php`), Orbit treats it like any other command failure: the deploy fails before the symlink swap. The old release stays live; no rollback needed because the new release was never made current.

Inspect the agent log for the import command's stdout — Magento prints the offending config key.

## Testing

Two scenarios from the agent's regression suite (`__docs/TESTING_ZERO_DOWNTIME.md`):

**Scenario 7** — no-op case:
- Enable `config_import_enabled`. Don't touch `app/etc/config.php`. Deploy.
- Expect: log shows `app:config:import` between `setup:upgrade` and swap. Exits 0 in `<1s`. Admin unchanged.

**Scenario 8** — with pending changes:
- On the host, `bin/magento config:set general/store_information/name "DriftTest"` then `bin/magento app:config:dump`. Commit the `config.php` diff, push.
- Deploy.
- Expect: log shows `app:config:import` applying the change. Admin reflects the new store name post-deploy.

## Equivalents in other tools

| Tool | Equivalent |
|---|---|
| PHP Deployer | `deploy:magento:config:import` task |
| Capistrano-Magento | `magento:setup:config:import` task |
| Adobe Commerce Cloud | Built into the Cloud deploy pipeline |

Orbit's auto-step is functionally the same. The difference is it's a single flag in the dashboard, not a recipe modification.
