---
sidebar_position: 4
title: Upgrading the agent
description: Self-upgrade via the built-in command, the install one-liner, or manual binary swap. Plus what the env file evolution means for you.
---

# Upgrading the agent

The agent ships frequently — bug fixes, new deploy hooks, new dashboard flags. Three ways to upgrade, easiest first.

## `orbit-agent self-upgrade` (v0.3.3+)

The agent knows how to upgrade itself. Checks GitHub for the latest release, delegates to the same `install.sh` you'd run manually, prints restart instructions.

```bash
orbit-agent self-upgrade
# → checks latest release
# → downloads if newer, verifies sha256, installs in place
# → prints "restart now" footer

sudo systemctl restart orbit-agent
# or foreground: Ctrl-C the running agent, then `orbit-agent`

orbit-agent --version   # verify
```

The running process keeps its old binary loaded (Linux holds the inode open) until you restart, so the install itself is safe to run while the agent is live.

Useful one-liner:

```bash
orbit-agent self-upgrade && sudo systemctl restart orbit-agent
```

### Flags

| Flag | Description |
|---|---|
| `--force` | Reinstall even if you're already on latest. Useful after a corrupted install or for re-running a release with hot-fixed sha256. |
| `--skip-version-check` | Skip the GitHub API call. Mostly internal. |

## At-startup version nudge

From `v0.3.3+`, the agent pings GitHub once at startup for the latest tag and logs a warn-level nudge if you're behind:

```
WARN A newer orbit-agent is available — upgrade with: orbit-agent self-upgrade
     current=0.5.6 latest=0.5.10
```

The check is best-effort: silent on any GitHub failure, doesn't block registration, never auto-installs. Disable with `ORBIT_DISABLE_VERSION_CHECK=1` in `~/orbit-agent.env` if you really need to.

## Manual upgrade (any version)

The same `install.sh` overwrites the binary in place via `install -m 755`, so re-running the one-liner replaces it atomically:

```bash
# 1. Stop the running agent
sudo systemctl stop orbit-agent
#   - or for foreground: Ctrl-C in its terminal

# 2. Pull the latest binary (or pin: ORBIT_VERSION=orbit-agent-v0.5.10)
curl -fsSL https://get.byte8.io/orbit-agent | sh

# 3. Confirm
orbit-agent --version

# 4. Start again
sudo systemctl start orbit-agent
```

**Always stop the agent first.** Two instances polling for the same environment would race on tasks.

## `~/orbit-agent.env` evolves between versions

New env vars get added as the agent grows — for example `v0.3.1` added `ORBIT_WEB_USER` for the executor's post-clone permission normalisation. The agent treats missing vars as defaults, so your existing env file keeps working.

If you'd rather have every variable explicit (cleaner for audit), re-run `init` against the same `--deploy-path`. From `v0.3.3+`, `init` is deployment-aware: it detects the existing tree, runs in register-only mode, refreshes the env file, and re-registers — without touching `releases/` or `current`. ([init](/docs/agent/init#re-running-init-on-an-existing-tree))

```bash
orbit-agent init \
  --token       obt_... \
  --server-url  https://orbit.byte8.io \
  --deploy-path /var/www/magento \
  --web-user    www-data
```

## Wait for the release artifact

If you're rolling out a brand-new release, the GitHub Actions release workflow might still be uploading the tarball. `get.byte8.io` always serves the latest tag, but the underlying GitHub release artifact lags by a few minutes. Confirm before you upgrade:

```bash
curl -fsSL -o /dev/null -w "%{http_code}\n" \
  "https://github.com/byte8io/orbit-agent/releases/download/orbit-agent-v0.5.10/orbit-agent-x86_64-unknown-linux-gnu.tar.gz"
# 200 = ready to install
# 404 = build still running, retry in a few min
```

## Downgrading

If a release introduces a regression you need to roll back from:

```bash
sudo systemctl stop orbit-agent
ORBIT_VERSION=orbit-agent-v0.5.9 curl -fsSL https://get.byte8.io/orbit-agent | sh
sudo systemctl start orbit-agent
```

Then please [open an issue](https://github.com/byte8io/orbit-agent/issues) so the next release fixes whatever caught you.

## What's compatible

The agent + control plane communicate via a versioned task schema. Major schema changes are introduced as additive fields with backwards-compatible defaults; the agent and server can be one or two versions apart in either direction. We document any **required** version pair in the release notes when it happens (rare).

Practically: keep agents within ~3 minor versions of the latest control-plane release and you'll never notice.
