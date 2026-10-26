---
name: shipyard-quality-verdict
description: Classify delivery checks consistently as blocking, advisory, or unverified.
---

# Shipyard quality verdict

Blocking failures are limited to: failed tests/lint/build; a measured regression against a configured Core Web Vitals budget; a deterministic AccessLint WCAG A/AA violation; an unsatisfied acceptance criterion; or incomplete end verification.

Aesthetic and heuristic UX recommendations, SEO, unmeasured performance opportunities, and architecture/documentation/test debt without an immediate regression are advisory.

When a runnable URL, measurement tool, baseline, or required evidence is absent, report `UNVERIFIED` and advisory. Never convert missing evidence into PASS. A project may explicitly promote an unverified check to blocking in its engineering standards.
