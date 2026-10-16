# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration holds:

- the email and password of a Beszel user, kept by Gladys in the integration
  configuration (a `secret` field) and sent only to the configured Beszel hub;
  a user with the read-only role is recommended;
- the session token of the hub, in memory only, never written to disk nor to
  the logs;
- under `/data`, `beszel-state.json`: the last status of each system and the
  ids of the alerts seen triggered. No secret.

Network: requests to the configured hub only (HTTP or HTTPS, port 8090 by
default), nothing else, no cloud service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the third-party services and devices the integration talks to, Beszel
included.
