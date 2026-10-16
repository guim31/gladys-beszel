# Beszel for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings your [Beszel](https://beszel.dev) systems into Gladys: one device
per monitored system, the Beszel alerts and the systems going offline as scene
triggers, scene actions and a dashboard widget. It reads the API of your Beszel
hub (PocketBase) over the local network. No cloud.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

> Tested against a real Beszel 0.21.0 hub and agent (Docker): a system stopped
> and started again, alerts triggered and resolved, a read-only user, a revoked
> token. Not yet in a real Gladys nor on every installation: feedback welcome in
> the [issues](https://github.com/guim31/gladys-beszel/issues).

## Features

- **One device per Beszel system** the configured user sees, proposed in the
  Discover tab: **Online**, **CPU**, **Memory**, **Disk**, **Highest
  temperature**, **Network traffic**, **Load** (1, 5 and 15 min), **Uptime**,
  **Failed services** (when the agent watches systemd) and **Triggered
  alerts**. Feature names in French by default (English, German and Spanish
  available).
- **Scene triggers**, for every system, added to Gladys or not: _Beszel system
  offline or back_ (filters: system, new state) and _Beszel alert_ triggered or
  resolved (filters: system, alert kind, new state; variables: the alert with
  its threshold).
- **Scene actions**: _State of a Beszel system_ (every figure, and a
  ready-made summary for a message) and _State of every Beszel system_ (counts
  and a summary).
- **Dashboard widget** "Beszel systems": every system at a glance, or the
  gauges, temperature and alerts of one system, with a **Refresh** button.
- A **Test the connection** button, a connection status that says what is
  wrong, a **transport badge** per device.
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **Beszel hub** 0.12 or later (0.21.0 tested), reachable from the Gladys
  machine (port 8090 by default), and the email and password of a Beszel user:
  best, a user created for Gladys with the read-only role, with whom the
  systems are shared.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-beszel`
   (or install **Beszel** from the catalog once it is listed).
2. In **Configuration**, enter the address of the hub, the email and the
   password of the Beszel user. Save, then click **Test the connection**.
3. Open the **Discover** tab and add the systems to follow.

## How it works

- Every refresh interval (30 s to 5 min, 30 s by default), two requests to
  the hub whatever the number of systems: the list of the systems (their
  status and the `info` summary the hub keeps from the last agent report) and
  the list of the user's alerts (with `triggered`). Polling, not the realtime
  stream of PocketBase: the hub refreshes a system once a minute.
- Authentication with `auth-with-password`; the token stays in memory and is
  renewed a day before it expires. PocketBase answers an **empty list, not an
  error**, to a dead token: an empty answer is checked with `auth-refresh`
  before it is believed, so a revoked token never makes the systems vanish.
- The devices are published with `should_poll: false`: the integration drives
  the reads with its own timer. Only the devices the user added receive
  states, only the changes, the busy values at most once a minute.
- The last status of each system and the alerts seen triggered are kept in
  `/data/beszel-state.json`, so a restart neither repeats an announcement nor
  misses one.

## Checked on a real Beszel, and what was not

The Docker image of the integration ran with the Gladys sandbox constraints
(read-only root, all capabilities dropped, 256 MB, bridge network) against a
real `henrygd/beszel` 0.21.0 hub and a `henrygd/beszel-agent` (no host Docker
socket mounted): discovery, states, widget, scene actions, then the agent
stopped (system down, Beszel _Status_ alert triggered) and started again
(system up, _Status_ resolved, a _Memory_ alert triggered), across restarts of
the integration. Errors checked on the real hub: wrong password, unknown user,
read-only user, dead token, wrong port, HTTPS on the HTTP port, the SSH port of
an agent, a path without hub. The answers are kept, anonymized, in
`test/fixtures/beszel/`.

Not checked: a real Gladys (the widget, the scene editor), a hub behind a
reverse proxy in HTTPS, agents with systemd services or a GPU, many systems.

## Limitations

- Read only: nothing is changed in Beszel.
- One hub per installation, 100 systems at most; only the alerts of the
  configured user.
- The summary of each system only: containers, extra disks, GPU and history
  are not read.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK
(`@gladysassistant/integration-sdk/testing`) and an in-memory Beszel hub
(`test/helpers/fakeBeszel.js`) serving the real answers of Beszel 0.21.0. See
[`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Beszel](https://github.com/henrygd/beszel) by henrygd and contributors
  (MIT): the API read here; the meaning of the `info` fields and the alert
  kinds come from its source code.
- The architecture and the conformity tests follow
  [gladys-netdata](https://github.com/guim31/gladys-netdata) and
  [gladys-wled](https://github.com/guim31/gladys-wled).
- The cover is a generic illustration, without the Beszel logo.

## Disclaimer

This project is not affiliated with, endorsed or sponsored by the Beszel
project or its authors.

## License

Apache-2.0
