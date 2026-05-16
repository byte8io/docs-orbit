---
sidebar_position: 3
title: Run as a systemd service
description: Production-grade agent setup. Auto-restart on crash, starts on boot, log integration via journalctl.
---

# Run as a systemd service

For production hosts, run the agent as a systemd service so it survives reboots, auto-restarts on crash, and integrates with `journalctl`. Foreground mode (just `orbit-agent` in a shell) is fine for first-deploy validation but stops the moment the SSH session closes.

## Quickstart: install + enable the unit

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

The heredoc expands `$(whoami)`, `$(id -gn)`, `$HOME`, and `$(command -v orbit-agent)` at install time so the resulting unit file is correct for whichever deploy user you ran it as.

## v0.5.7+: `init --systemd`

From `v0.5.7+`, `orbit-agent init` can install the systemd unit for you:

```bash
sudo orbit-agent init --systemd ...usual flags...
```

It writes the unit, runs `systemctl daemon-reload`, and enables + starts the service. Equivalent to the manual heredoc above, just one less step. Requires `sudo` because `/etc/systemd/system/` is root-owned.

## Verify the agent registered

In the dashboard, the environment row should flip to **online** with a recent `last_seen_at`. From the host:

```bash
systemctl status orbit-agent
# ● orbit-agent.service - Orbit Deployment Agent
#      Loaded: loaded (/etc/systemd/system/orbit-agent.service; enabled)
#      Active: active (running) since ...
#      ...
#      INFO orbit_agent: Orbit Agent v0.5.10 starting
#      INFO orbit_agent: Registered with Orbit server environment="Production"
```

## Why `EnvironmentFile=` instead of `source ~/orbit-agent.env`

systemd's `EnvironmentFile=` reads the env file directly — no shell to source it through. Foreground mode uses `set -a; source ~/orbit-agent.env; set +a` to load the file into the current shell; systemd skips that dance.

## Restart policy

`Restart=on-failure` + `RestartSec=5` means systemd restarts the agent within 5 seconds of any non-zero exit. The agent treats network errors as recoverable and retries internally, so restarts are rare in practice — they mostly happen during version upgrades or when the env file changes.

If you'd rather have systemd never restart automatically (e.g. during a known-broken debugging window): `sudo systemctl edit orbit-agent` and override `Restart=no`.

## Switching between foreground and systemd

Foreground → systemd:

```bash
# Ctrl-C the foreground agent
sudo systemctl start orbit-agent
```

systemd → foreground (for ad-hoc debugging):

```bash
sudo systemctl stop orbit-agent
set -a; source ~/orbit-agent.env; set +a
orbit-agent
```

Never run both simultaneously — they'd race on tasks.

## Logs

[`orbit-agent logs`](/docs/agent/logs) is the user-friendly wrapper. It's a thin shell over `journalctl -u orbit-agent.service`. If you'd rather use journalctl directly:

```bash
journalctl -u orbit-agent -f                 # tail (sudo may be needed)
journalctl -u orbit-agent --since "1h ago"
journalctl -u orbit-agent -n 500 --no-pager
```

`sudo`-less access requires the deploy user be in the `systemd-journal` group: `sudo usermod -aG systemd-journal $USER` (log out + back in).

## Common systemd issues

| Symptom | Fix |
|---|---|
| `Failed to start orbit-agent.service: Unit not found` | `sudo systemctl daemon-reload` after creating/editing the unit |
| `status=203/EXEC` | `ExecStart=` path is wrong — re-run `command -v orbit-agent` and update the unit |
| Service starts then immediately exits with `status=1` | Token typo or revoked. `orbit-agent logs --since "5 minutes ago"` shows the registration failure |
| `EnvironmentFile: No such file or directory` | `~/orbit-agent.env` is missing. Re-run `orbit-agent init` to regenerate |

## Sudo for service reloads (optional)

If your deploys need to reload PHP-FPM or nginx (e.g. an OPcache warmer hook), grant the deploy user passwordless sudo for **specific commands only**:

```bash
sudo tee /etc/sudoers.d/orbit-deploy > /dev/null <<EOF
# Allow the orbit-agent user to reload specific services without a password.
# Scoped to exact commands — does NOT grant general sudo access.
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload php8.3-fpm
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl reload nginx
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart php8.3-fpm
EOF

sudo visudo -cf /etc/sudoers.d/orbit-deploy   # syntax check
```

Replace `deploy` with your deploy user name and `php8.3-fpm` with your actual PHP-FPM unit name.
