---
sidebar_position: 1
title: Install the agent
description: Install orbit-agent via the one-liner, manually from GitHub releases, or in air-gapped environments.
---

# Install the agent

`orbit-agent` is a single static Rust binary, ~10 MB. No PHP, no Node, no system deps. Source: [`byte8io/orbit-agent`](https://github.com/byte8io/orbit-agent) (public, open source).

## The one-liner (recommended)

```bash
curl -fsSL https://get.byte8.io/orbit-agent | sh
```

The installer:

1. Detects the host's OS, arch, and libc (linux x86_64 / aarch64, gnu / musl)
2. Downloads the matching tarball from the [GitHub releases page](https://github.com/byte8io/orbit-agent/releases)
3. Verifies the sha256 against the published checksum
4. Installs to:
   - `/usr/local/bin/orbit-agent` when run as root
   - `~/.local/bin/orbit-agent` otherwise (and wires `~/.local/bin` into your shell PATH if missing)

Smoke-test:

```bash
orbit-agent --version
```

## Install + initialise in one command

The installer accepts pass-through args that exec as `orbit-agent init …` once installed:

```bash
curl -fsSL https://get.byte8.io/orbit-agent | sh -s -- \
  --token=obt_... \
  --server-url=https://orbit.byte8.io \
  --deploy-path=/var/www/magento
```

See [`orbit-agent init`](/docs/agent/init) for every flag.

## Pinning a version

The default installer pulls the latest stable release. To pin:

```bash
ORBIT_VERSION=orbit-agent-v0.5.10 curl -fsSL https://get.byte8.io/orbit-agent | sh
```

`ORBIT_VERSION` matches the git tag exactly. Find the available tags at [GitHub releases](https://github.com/byte8io/orbit-agent/releases).

## Air-gapped / offline install

If the host can't reach `get.byte8.io` (firewalled, VPC without NAT, etc.):

1. From a connected machine, grab the right tarball from [GitHub releases](https://github.com/byte8io/orbit-agent/releases):
   - `orbit-agent-x86_64-unknown-linux-gnu.tar.gz` for standard Linux x86_64
   - `orbit-agent-aarch64-unknown-linux-gnu.tar.gz` for ARM64 (Graviton, modern Apple racks)
   - `orbit-agent-x86_64-unknown-linux-musl.tar.gz` for static-musl builds (Alpine, distroless)
2. Also grab the `.sha256` alongside it for verification.
3. Copy both to the host (`scp`, USB, whatever).
4. Verify + install:

```bash
sha256sum -c orbit-agent-x86_64-unknown-linux-gnu.tar.gz.sha256
tar -xzf orbit-agent-x86_64-unknown-linux-gnu.tar.gz
sudo install -m 0755 orbit-agent /usr/local/bin/orbit-agent
orbit-agent --version
```

## Verify a release is published

Useful when you're rolling out a fresh build and want to confirm the GitHub Actions release workflow finished before running `self-upgrade`:

```bash
curl -fsSL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/byte8io/orbit-agent/releases/download/orbit-agent-v0.5.10/orbit-agent-x86_64-unknown-linux-gnu.tar.gz"
# 200 = ready to install
# 404 = build still running, retry in a few minutes
```

## What gets installed

Just the binary. No systemd unit, no config file, no shared libraries. `init` writes the config later (`~/orbit-agent.env`); the systemd unit is something you create in [systemd](/docs/agent/systemd).

## Uninstall

```bash
sudo systemctl disable --now orbit-agent 2>/dev/null || true
sudo rm -f /usr/local/bin/orbit-agent ~/.local/bin/orbit-agent
sudo rm -f /etc/systemd/system/orbit-agent.service
rm -f ~/orbit-agent.env
```

The deploy tree at `/var/www/magento` is left alone — `current` keeps pointing at the last release and the site keeps serving. Cleaning up the tree is a manual `rm -rf` decision.

## What's next

- [`orbit-agent init`](/docs/agent/init) — register the agent with the control plane and set up the deploy tree
- [Run as a systemd service](/docs/agent/systemd) — for production
- [Self-upgrade](/docs/agent/self-upgrade) — when a new version ships
