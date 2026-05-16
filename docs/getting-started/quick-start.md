---
sidebar_position: 1
title: Quick start
description: Get from zero to a live deploy in about 20 minutes.
---

# Quick start

End-to-end path: sign up → create an environment → install the agent → first deploy. Roughly 20 minutes if your host is ready.

## Prerequisites

- A Magento 2 host with a deploy user (SSH access, `sudo` for the deploy-path setup)
- The deploy user has SSH access to your Magento git repo (deploy key on GitHub/GitLab/Bitbucket — see [installation](/docs/getting-started/installation#ssh-deploy-key))
- PHP 8.2+, Composer, and the Magento system requirements installed
- A reachable health-check endpoint (e.g. `http://127.0.0.1/health_check.php`)

## 1. Sign up + create an environment

1. Sign in at [orbit.byte8.io](https://orbit.byte8.io).
2. **Environments → New Environment.**
3. Fill the form:

| Field | Example |
|---|---|
| Name | `Production` |
| Host | `203.0.113.10` *(display-only — no SSH from the control plane)* |
| Deploy Path | `/var/www/magento` |
| Health Check URL | `http://127.0.0.1/health_check.php` |
| Repository URL | `git@github.com:your-org/your-store.git` |
| Deploy Branch | `main` |
| Releases to Keep | `5` *(default)* |

Leave **Shared dirs** and **Shared files** blank — the agent uses sensible Magento defaults. See [shared dirs](/docs/environments/shared-dirs) when you need to deviate.

## 2. Issue an agent token

On the environment's detail page → **Agent Tokens → Generate**. Name it (e.g. `prod-host`), copy the token immediately — it's shown once. Format: `obt_<64 hex>`.

## 3. Install + initialise the agent on the host

SSH to the Magento host as the deploy user, then:

```bash
# Install
curl -fsSL https://get.byte8.io/orbit-agent | sh

# Pre-create the deploy path with the right permissions
sudo mkdir -p /var/www/magento
sudo chown $USER:www-data /var/www/magento
sudo chmod 2775 /var/www/magento

# Initialise — uses the token + URL from step 2
orbit-agent init \
  --token        obt_... \
  --server-url   https://orbit.byte8.io \
  --deploy-path  /var/www/magento \
  --web-user     www-data
```

`init` creates the `releases/` + `shared/` tree, seeds a default `shared/nginx.conf`, writes config to `~/orbit-agent.env`, and registers with the control plane. See [`orbit-agent init`](/docs/agent/init) for every flag.

## 4. Start the agent

Run as a systemd service:

```bash
sudo tee /etc/systemd/system/orbit-agent.service > /dev/null <<EOF
[Unit]
Description=Orbit Deployment Agent
After=network-online.target

[Service]
User=$(whoami)
Group=$(id -gn)
EnvironmentFile=$HOME/orbit-agent.env
ExecStart=$(command -v orbit-agent)
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now orbit-agent
```

Confirm in the dashboard: the environment row should flip to **online**. Live log:

```bash
orbit-agent logs   # tail -f wrapper around journalctl
```

## 5. Point nginx at the deploy tree

`init` printed a vhost snippet — paste it into a sites-available file:

```nginx
server {
    listen 80;
    server_name your-store.example.com;

    set $MAGE_ROOT /var/www/magento/current;
    set $MAGE_MODE production;

    include /var/www/magento/shared/nginx.conf;
}
```

```bash
sudo ln -sfn /etc/nginx/sites-available/magento.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The `current` symlink doesn't exist yet — that's expected, the first deploy creates it.

## 6. First deploy

In the dashboard → environment page → **Deploy**:

- **Type:** `full` (clone + composer + setup:upgrade if needed + di:compile + static-content:deploy + swap)
- **Git Ref:** blank (uses the environment's branch)

Watch the agent log. Roughly 2–3 minutes end to end. When it lands:

```bash
readlink -f /var/www/magento/current
# → /var/www/magento/releases/<TIMESTAMP>

curl -i http://127.0.0.1/health_check.php
# → HTTP/1.1 200 OK
```

## What you've got

```
/var/www/magento/
├── current → releases/20260516_104530/
├── releases/
│   └── 20260516_104530/          ← live release
└── shared/
    ├── app/etc/env.php           ← never overwritten by deploys
    ├── nginx.conf                ← what the vhost includes
    ├── pub/media/                ← user uploads
    └── var/{log,session,...}
```

## Next steps

- **Schedule a code deploy** for a tiny PHP change → verify it stays 200 throughout. ([deploy types](/docs/deployments/deploy-types))
- **Add a CI deploy** via Personal Access Token. ([API tokens](/docs/api/personal-access-tokens))
- **Configure conditional maintenance flags** (`always_enable_maintenance`, `maintenance_on_drift`, allowlist IPs). ([maintenance window](/docs/zero-downtime/maintenance-window))
- **Migrating an existing install** instead of greenfield? See [`init` migration mode](/docs/agent/init#migrating-an-existing-install).
