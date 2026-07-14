---
name: dependency-audit
description: >
  Scan project dependencies for known vulnerabilities and license issues; block on high/critical findings.
allowed-tools: Bash, Read
---

# Skill: dependency-audit

## Objective
Scan project dependencies for known vulnerabilities and license issues; block on high/critical findings.

## Preconditions
- [ ] Lockfile present and up-to-date
- [ ] Offline mirror or network available to the audit tool

## Procedure (strict order)
1. Run audit: `bash scripts/audit.sh`
2. Parse findings: count critical, high, medium.
3. Cross-check licenses against an allowlist (no GPL in proprietary code, etc.).

## Checks
- [ ] 0 critical vulnerabilities
- [ ] 0 high vulnerabilities
- [ ] No license violations
- [ ] No advisories without a documented mitigation

## On failure
Report the package + advisory ID. If a fix exists, upgrade; if not, open an ADR documenting the mitigation or replacement.

## Output
Audit report summary + exit code.
