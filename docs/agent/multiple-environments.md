---
sidebar_position: 6
title: Multiple environments on one host
sidebar_label: Multiple environments
description: Run several orbit-agents on one server (e.g. staging + production) with the --name instance flag and systemd template units.
---

# Multiple environments on one host

Sometimes a single server hosts more than one Orbit environment — most commonly **staging and production on the same box**. From **agent v0.7.0**, `orbit-agent` supports this natively with the `--name <instance>` flag, so you don't have to hand-roll duplicate systemd units.

:::info
If staging and production are on **separate servers**, you don't need any of this — just run one default agent per server (`orbit-agent init … --systemd`, no `--name`). The `--name` flag is only for running multiple environments on the **same** host.
:::

## How it works

An **instance name** namespaces the three things that are otherwise tied to a single agent:

| Concern | Default instance (no `--name`) | Named instance (`--name staging`) |
|---|---|---|
| Config file | `~/orbit-agent.env` | `~/orbit-agent.staging.env` |
| systemd unit | `orbit-agent.service` | `orbit-agent@staging.service` (one template unit) |
| Logs | `orbit-agent logs` | `orbit-agent logs --name staging` |
| CLI deploy | `orbit-agent deploy` | `orbit-agent deploy --name staging` |

Everything else is unchanged: each agent is bound to exactly **one** environment by its token, and the `deploy_path` comes from the Orbit server — so two agents on one host never collide as long as their environments have **different deploy paths**.

The default instance (no `--name`) maps to the exact legacy paths (`~/orbit-agent.env`, `orbit-agent.service`), so existing single-agent installs are untouched.

## Setup

**1. Dashboard:** create **two environments** (e.g. Staging and Production) with **different Deploy Paths**, and generate **one agent token per environment**.

**2. Init each instance** — the `--name` namespaces its config + unit; `--systemd` installs and starts it:

```bash
# Staging
orbit-agent init --name staging \
  --token       obt_<staging-token> \
  --server-url  https://orbit.byte8.io \
  --deploy-path /var/www/example/staging \
  --web-user    deploy \
  --systemd

# Production
orbit-agent init --name production \
  --token       obt_<production-token> \
  --server-url  https://orbit.byte8.io \
  --deploy-path /var/www/example/production \
  --web-user    deploy \
  --systemd
```

`--systemd` installs **one** template unit (`/etc/systemd/system/orbit-agent@.service`) and enables `orbit-agent@staging` + `orbit-agent@production` from it. The template's `EnvironmentFile=<home>/orbit-agent.%i.env` selects each instance's config at start time.

## Managing instances

```bash
orbit-agent ls                            # list configured instances + systemd status
orbit-agent logs --name production -f     # tail one instance (sudo or be in systemd-journal)
orbit-agent deploy --name staging --type full
orbit-agent self-upgrade --name staging   # upgrade hint targets orbit-agent@staging
sudo systemctl status  orbit-agent@staging
sudo systemctl restart orbit-agent@production
```

`orbit-agent ls` is the quickest way to confirm both instances are wired up after init:

```
INSTANCE       STATUS   SERVER                   TOKEN          PROFILE
production     active   https://orbit.byte8.io   obt_1a2b3c4d…  self-hosted
staging        active   https://orbit.byte8.io   obt_9f8e7d6c…  self-hosted
```

## Things to know

- **Different deploy paths are mandatory.** Two agents pointed at the same tree would fight over `current`. Each environment must have its own `deploy_path`.
- **All named instances run as the same OS user.** The systemd template unit bakes one `User=` (the user that ran `init`). That fits the common "one deploy user, many stores" case. If you genuinely need a different OS user per environment, run that one as a separate hand-written unit instead of `--systemd`.
- **Don't run two agents against the same environment.** e.g. an old hand-rolled `orbit-agent.service` *and* a new `orbit-agent@staging` both using the same token — they'll race on deploys (the deploy lock rejects the loser, but it's messy). Use `orbit-agent ls` + `systemctl list-units 'orbit-agent*'` to confirm exactly one agent per environment.
- **`logs`/`deploy` need `--name`.** Without it they target the default `orbit-agent.service`, which won't exist on a host that only has named instances.

## Removing an instance

```bash
sudo systemctl disable --now orbit-agent@staging
rm ~/orbit-agent.staging.env
```

The shared template unit (`orbit-agent@.service`) can stay — it's inert unless an instance is enabled from it.
