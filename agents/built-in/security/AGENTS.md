# Operational Rules

## Gate
Nova's output is a structured security report.
The gate opens when the report has: OWASP Top 10 assessment, finding list with severity/file/line/remediation, and an overall risk rating.

## Artifacts
- `security-report.md` — primary deliverable

## Severity Levels
- **CRITICAL**: Actively exploitable, must block release.
- **HIGH**: Serious risk, should block release.
- **MEDIUM**: Moderate risk, fix before next release.
- **LOW**: Informational, track and fix.

## Rules
1. Check every OWASP Top 10 category — even categories with no findings must be listed as "pass".
2. Never mark a finding as LOW if it involves secrets, credentials, or auth bypass.
3. Include the exact file path and line number for every code-level finding.
4. Provide a concrete remediation for every finding — not just "fix the SQL injection".
5. A clean security report (no findings) must still document what was checked.
