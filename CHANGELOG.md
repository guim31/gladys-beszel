# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-16

### Added

- One device per Beszel system the configured user sees, proposed in the
  Discover tab: online, CPU, memory, disk, highest temperature, network
  traffic, load (1, 5 and 15 min), uptime, failed services (when the agent
  watches systemd) and triggered alerts. Feature names in French by default,
  also in English, German and Spanish.
- Scene triggers "Beszel system offline or back" and "Beszel alert"
  (triggered or resolved), for every system, with filters on the system, the
  alert kind and the new state.
- Scene actions "State of a Beszel system" and "State of every Beszel
  system", with a ready-made summary for a message.
- Dashboard widget "Beszel systems": every system at a glance, or the gauges
  and alerts of one system, with a Refresh button.
- A "Test the connection" button, a connection status that says what is
  wrong, and a transport badge per device.
- Read-only access with the email and password of a Beszel user, the token
  renewed before it expires; refresh every 30 seconds to 5 minutes;
  self-signed certificates accepted on request.
- Documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-beszel/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-beszel/releases/tag/v1.0.0
