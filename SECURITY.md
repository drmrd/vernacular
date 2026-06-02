# Security Policy

Vernacular is in pre-release development (Phase 0). The web app does not
yet collect, transmit, or persist any sensitive data, and there are no
publicly hosted instances we operate. Even so, we take any potential
security issue seriously and welcome reports.

## Reporting a vulnerability

Please report suspected vulnerabilities by opening a private GitHub
security advisory:
[github.com/drmrd/vernacular/security/advisories/new](https://github.com/drmrd/vernacular/security/advisories/new).

Use the advisory description to share what you observed, how to
reproduce it, and any thoughts on remediation. Avoid filing public
issues for the same content until we have responded.

## What to expect

While Vernacular is pre-1.0 and maintained by a small team, we do not
yet offer formal response-time guarantees. Our intent is:

- Acknowledge new advisories within a few business days.
- Confirm or dispute the report once we have reproduced it.
- Coordinate a fix and a disclosure timeline before any public
  discussion.

When Vernacular reaches 1.0 and gains a published deployment story,
this policy will be revised with concrete timelines.

## Supported versions

Until 1.0, only the `main` branch is supported. Older commits do not
receive backports.

## Scope

In scope: the code in this repository, the published asset packs, and
the build pipeline.

Out of scope: third-party hosting or instances run by others.
