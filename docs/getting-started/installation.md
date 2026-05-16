---
sidebar_position: 2
title: Host installation
description: Server prerequisites, SSH deploy key, filesystem permissions, deploy-user setup.
---

# Host installation

What you need on the Magento host before running `orbit-agent init`. Most of this is one-time setup per server.

## System prerequisites

Whatever Magento itself needs:

- PHP 8.2+ with the [Magento required extensions](https://devdocs.magento.com/guides/v2.4/install-gde/system-requirements_tech.html) (`bcmath`, `ctype`, `curl`, `dom`, `gd`, `iconv`, `intl`, `mbstring`, `mysqlnd`, `openssl`, `pdo_mysql`, `simplexml`, `soap`, `sodium`, `xsl`, `zip`)
- Composer 2.x
- A running PHP-FPM (the agent auto-detects the socket path during `init` if it's running)
- nginx or Apache
- MySQL/MariaDB reachable from the host (Magento talks to it; the agent doesn't)

The agent itself is a single static Rust binary — no PHP, no Node, no system deps.

## Deploy user

Pick (or create) a non-root user that owns the deploy. By convention something like `softcom`, `deploy`, or `byte8`. Add them to the web-server group so php-fpm has read access to deployed files:

```bash
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG www-data deploy
# log out + back in for the group membership to take effect
```

The agent runs as this user. **Don't run it as root** — `init` will warn, deploys will work but file ownership becomes a maintenance burden.

## SSH deploy key

The agent uses the deploy user's `~/.ssh/id_ed25519` to clone the Magento repo. One-time setup:

```bash
# As the deploy user:
test -f ~/.ssh/id_ed25519 || ssh-keygen -t ed25519 -C "$(whoami)@$(hostname)"

cat ~/.ssh/id_ed25519.pub
# Copy this and paste it into:
#   GitHub: repo Settings → Deploy keys → Add deploy key (read-only is enough)
#   GitLab: repo Settings → Repository → Deploy keys
#   Bitbucket: repo Settings → Access keys

# Trust the host so the first clone doesn't hang on a "known hosts" prompt:
ssh -T git@github.com   # answer "yes" once
```

The agent never pushes, so read-only access is correct.

## Deploy path + permissions

`/var/www/` is typically root-owned. The deploy user needs write access to the path under it. Set the group to the web-server group (`www-data` on Debian/Ubuntu, `nginx` on RHEL/Alma) and set the **setgid bit** so new files inherit the right group:

```bash
sudo mkdir -p /var/www/magento
sudo chown $USER:www-data /var/www/magento
sudo chmod 2775 /var/www/magento
```

The `2` in `2775` is the setgid flag — when `init` (or any later deploy) creates files inside this directory, they land as `deploy:www-data` instead of `deploy:deploy`. PHP-FPM then has read access without further `chgrp` work. This matches Magento's own `setup:permissions` recommendation.

## Composer Marketplace credentials (`auth.json`)

If your Magento install pulls from `repo.magento.com`, the agent needs Composer's Marketplace creds available at deploy time. The simplest place is the deploy user's home directory:

```bash
mkdir -p ~/.composer
cat > ~/.composer/auth.json <<'EOF'
{
  "http-basic": {
    "repo.magento.com": {
      "username": "<public-key>",
      "password": "<private-key>"
    }
  }
}
EOF
chmod 600 ~/.composer/auth.json
```

(Get the keys from Adobe Commerce Marketplace → My Profile → Access Keys.)

`init`'s preflight checks for this file and prints a warning if it's missing — useful catch before the first deploy fails on Composer auth.

## Install the agent binary

The recommended path is the one-liner:

```bash
curl -fsSL https://get.byte8.io/orbit-agent | sh
```

It detects the host's OS, arch, and libc (linux x86_64 / aarch64, gnu / musl), downloads the matching tarball from the [`byte8io/orbit-agent`](https://github.com/byte8io/orbit-agent/releases) release page, verifies the sha256, and installs to:

- `/usr/local/bin/orbit-agent` when run as root, **or**
- `~/.local/bin/orbit-agent` otherwise (and adds `~/.local/bin` to your PATH if missing)

Verify:

```bash
orbit-agent --version
```

See [Install the agent](/docs/agent/install) for offline / air-gapped installs and version pinning.

## Smoke checks

Before running `init`, confirm:

```bash
# Deploy user is in the web group
groups | tr ' ' '\n' | grep -q www-data && echo "✓ deploy user in www-data" || echo "✗ run usermod"

# Deploy path is writable + setgid
ls -ld /var/www/magento

# SSH to git host works
ssh -T git@github.com 2>&1 | grep -q "successfully authenticated" && echo "✓ SSH key recognised"

# Agent binary is on PATH
command -v orbit-agent && orbit-agent --version
```

All four green → you're ready for [`orbit-agent init`](/docs/agent/init).
