---
sidebar_position: 4
title: Health checks
description: The URL Orbit hits after the symlink swap to decide whether to keep or roll back. Pick a path that actually exercises Magento boot.
---

# Health checks

After every successful symlink swap, the agent hits the environment's **Health Check URL**. Non-2xx response → automatic rollback. The choice of URL matters more than people expect.

## What it does

```
1. ln -sfn releases/<NEW> current     (atomic swap)
2. cd current && bin/magento cache:flush
3. curl -fsS --max-time 30 "$HEALTH_CHECK_URL"
   - 2xx → deployment marked complete
   - non-2xx, timeout, connection refused → rollback
```

Rollback flips the symlink back, runs `cache:flush` again on the previous release, and disables maintenance mode if it was enabled. The site is back up in seconds. ([rollback](/docs/deployments/rollback))

## Recommended choices

**Best: a path that hits PHP-FPM and exercises a tiny Magento boot.**

Magento ships `pub/health_check.php` exactly for this — `bin/magento maintenance:status`-aware, returns 200 + `OK` when boot succeeds, 503 when maintenance is on, 500 when boot fails. Out-of-the-box default in the environment form:

```
http://127.0.0.1/health_check.php
```

The hostname is `127.0.0.1` because the agent runs on the same host — no need to round-trip through your load balancer, no DNS resolution lag, no nginx caching.

## What to avoid

| URL | Why it's bad |
|---|---|
| Static file (`http://127.0.0.1/favicon.ico`) | Returns 200 if nginx is up. Says nothing about whether Magento boots. A broken `env.php` or missing extension would still pass. |
| Public hostname (`https://your-store.example.com/`) | Round-trips through load balancer / DNS / CDN. Slower, may hit a cached response, may fail when the LB isn't aware of the host yet. |
| Public homepage | Often 100s of database queries. Slow (timeout risk) and not robust — a single broken block returns 200 with an error in the middle of the page. |
| `/admin/` | Auth-protected. 302 to login. 302 is not 2xx; rollback would trigger. |
| Anything CDN-cached | A cached 200 from the old release would mask a broken new release. |

## Custom health endpoints

Sometimes the Magento default isn't enough — you want to verify cron is running, queues are draining, a third-party module is configured. Roll your own thin PHP file at `pub/orbit-health.php`:

```php
<?php
require __DIR__ . '/../app/bootstrap.php';

use Magento\Framework\App\Bootstrap;
$bootstrap = Bootstrap::create(BP, $_SERVER);
$objectManager = $bootstrap->getObjectManager();

// Exercise something specific
$config = $objectManager->get(\Magento\Framework\App\Config\ScopeConfigInterface::class);
$urlKey = $config->getValue('web/unsecure/base_url');

if (!$urlKey) {
    http_response_code(500);
    echo "base_url not set";
    exit;
}

http_response_code(200);
echo "OK";
```

Then set the environment's health check URL to `http://127.0.0.1/orbit-health.php`.

**Keep the check fast (under 1 second) and side-effect-free.** Cron checks, queue depth checks, DB integrity — fine inside the request. Sending emails, writing files, calling third-party APIs — no.

## Timing

The agent gives the health-check URL up to 30 seconds before considering it failed. Most Magento health endpoints respond in under 100ms.

If your check is genuinely slow (it shouldn't be, but say you're warming a complex page cache): consider running the warming in a separate post-deploy hook and keeping the health check trivial. The 30s is hardcoded — there's no per-environment override.

## Disabling

You can't disable the health check entirely — every deploy hits the URL. If your URL temporarily 500s after deploy (e.g. you're seeding a fresh test environment and Magento isn't ready yet), use **manual deploy mode**: trigger from the dashboard with the **"Skip health check"** option (only available to environment owners; see PROGRESS for the timeline on this UI).

In a real production environment, you want the health check on. Disabling it is the equivalent of disabling the smoke alarm in your kitchen.

## Multi-host setups

When you have multiple agents on one environment (rare; see [agent tokens](/docs/environments/agent-tokens#multiple-agents-on-one-environment)), each agent runs its own health check against its own loopback. There's no cross-host coordination — each agent decides independently whether its deploy succeeded.

Multi-host fan-out (one deploy → N agents) is a roadmap item; the design is for per-host health checks with an aggregated dashboard view.
