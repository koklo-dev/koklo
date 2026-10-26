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

## Scope is the trap
A repository usually runs more than one dependency gate, and they rarely share a
scope: production-only versus the whole lockfile, every advisory versus only those
with a released fix, allowlisted versus raw. **Passing one proves nothing about the
other.** Before concluding "the audit is green", check which gates `.github/workflows/`
actually runs and what each one covers — a branch that is green locally and red on
the PR is almost always this gap, not a flaky scanner.

Record the mapping here the first time you work it out, so the next session does not
rediscover it:

| CI job | Command | Scope |
|---|---|---|
| <job> | `TO CLARIFY` | <production only? whole tree? fixed-only?> |

## Procedure (strict order)
1. Run audit: `TO CLARIFY`
2. Parse findings: count critical, high, medium.
3. Run any wider scan the PR also enforces, and read its output even when it exits
   non-zero for advisories that cannot fail the merge (no fix released upstream).
4. Cross-check licenses against an allowlist (no GPL in proprietary code, etc.).

## Checks
- [ ] 0 critical vulnerabilities
- [ ] 0 high vulnerabilities
- [ ] No license violations
- [ ] Every gate the PR runs was reproduced locally, not just the cheapest one
- [ ] Any advisory left unfixed is unfixable upstream, and said so in the PR body

## On failure
Report the package + advisory ID. Fix it the way the tree resolves it: bump the direct
parent when it has released a fix, otherwise pin the transitive version through the
package manager's override mechanism and refresh the lockfile. If no fix exists
upstream, open an ADR documenting the mitigation or the replacement — never silence
the gate.

## Output
Audit report summary + exit code.
