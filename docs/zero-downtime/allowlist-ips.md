---
sidebar_position: 3
title: Maintenance allowlist IPs
description: Whitelist specific IPs to bypass the 503 during maintenance. Validate the new release from your office before flipping public traffic back.
---

# Maintenance allowlist IPs

Magento's `maintenance:enable` takes a `--ip` flag — listed IPs see the live site, everyone else sees 503. Orbit wires this through as a per-environment config.

## When you need it

The classic case: **always-on maintenance + you want to validate the new release before public traffic resumes.**

```
T+0    Deploy starts. maintenance:enable --ip=203.0.113.50 (your office IP)
T+0–5  Deploy runs (clone, composer, di:compile, static-content:deploy).
       Public traffic: 503. Your laptop: serves from the OLD release (still live).
T+5    Swap. current → new release. cache:flush.
T+5–6  Your laptop hits the live new release directly. You smoke-test:
         - homepage loads
         - checkout flow works
         - admin reachable
         - critical third-party integrations functional
T+6    Happy → maintenance:disable. Public traffic resumes against the new release.
T+6    Unhappy → manual rollback. Public traffic stays on 503, then resumes against
       the OLD release.
```

The allowlist gives you a real production-shaped validation window without exposing customers to a half-validated release.

## Setting it

Dashboard → environment → **Maintenance allowlist IPs**. One IP (or CIDR) per line. Comments with `#` are ignored.

```
# office VPN exit
203.0.113.50
# personal VPN
198.51.100.7
# CI runner
192.0.2.10/30
```

Then enable `always_enable_maintenance = true` (or rely on the natural `migrations`/`drift` window — allowlist applies whenever maintenance is on, regardless of why).

## How Orbit applies it

When maintenance flips on, the agent runs:

```
bin/magento maintenance:enable --ip=203.0.113.50 --ip=198.51.100.7 --ip=192.0.2.10/30
```

Magento writes these into `shared/var/.maintenance.ip` alongside the flag file. nginx checks the requesting `$remote_addr` against the list (via the standard Magento maintenance check shipped in `pub/index.php`) and decides 503 vs serve-normally.

## Common gotchas

### Your real public IP isn't what you think it is

The allowlist is the public-internet-facing IP your traffic arrives from at the web server, NOT your local LAN address. From your laptop:

```bash
curl ifconfig.me
# → 203.0.113.50
```

If you're on a corporate VPN, this is the VPN exit. If you're working from home, it's your ISP-assigned IP (which can change without notice — most consumer ISPs use dynamic IPs).

### nginx behind a load balancer or Cloudflare

If a CDN or LB sits in front, `$remote_addr` in nginx is the LB/Cloudflare IP, not the customer's. Magento's `pub/index.php` reads `$_SERVER['REMOTE_ADDR']` by default — which is whatever nginx set.

Fix: configure nginx to honour `X-Forwarded-For`:

```nginx
# In your nginx vhost, before the maintenance check:
set_real_ip_from 173.245.48.0/20;     # Cloudflare ranges
set_real_ip_from 103.21.244.0/22;
# ... full list from cloudflare.com/ips ...
real_ip_header X-Forwarded-For;
real_ip_recursive on;
```

After reload, `$remote_addr` reflects the original client IP, and Magento's maintenance check honours your allowlist.

### IPv6

Magento's maintenance check accepts IPv6 literals — list them the same way:

```
2001:db8::1
203.0.113.50
```

If your office VPN is IPv6-only and your test laptop is dual-stack, list both — your traffic will arrive on whichever protocol resolves first.

### CIDR support is recent

Older Magento 2 versions (≤2.3) accept only single IPs, not ranges. Magento 2.4.x supports CIDR. If you're on an older version, list individual IPs.

## Verifying it works

Before the next deploy:

```bash
# On the host
bin/magento maintenance:enable --ip=203.0.113.50

# From a non-allowlisted client (e.g. your phone on cellular)
curl -sI https://your-store.example.com/
# → HTTP/1.1 503

# From an allowlisted client (your office)
curl -sI https://your-store.example.com/
# → HTTP/1.1 200

# Restore
bin/magento maintenance:disable
```

If allowlisted clients also get 503, the IP isn't matching — see the gotchas above (LB X-Forwarded-For is the usual culprit).

## Removing the allowlist

Clear the textarea, save. Subsequent deploys run `maintenance:enable` with no `--ip` flag — everyone gets 503 during the window. The setting takes effect on the next deploy; an in-flight maintenance window keeps whatever was set when it started.

## Operational pattern

A common pattern that combines allowlist with manual cutover:

1. Set `always_enable_maintenance = true` + your office IPs in the allowlist
2. Deploy
3. Smoke-test from the office; flag any issue
4. **Manually** clear the allowlist (or run `maintenance:disable` on the host) to release public traffic
5. After 24h of green, set `always_enable_maintenance` back to `false` for routine deploys

Useful for high-stakes deploys (Black Friday weekend, payment provider migrations) where the operational cost of a brief 503 during validation is worth the assurance.
