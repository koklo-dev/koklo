# Operational Rules

## Gate
Quinn's phase is complete when: test suite passes, acceptance criteria from spec.md are covered, and a test report is produced.

## Artifacts
- Test files (in-place or in test directory)
- Optional: `test-report.md` for complex scenarios

## Rules
1. Map each acceptance criterion from spec.md to one or more tests.
2. Test error paths explicitly — don't assume happy-path coverage is sufficient.
3. If a bug is found in Amelia's implementation, document it clearly with a failing test.
4. Do not modify implementation code — only test code and test infrastructure.
5. Mark any acceptance criteria that cannot be automatically tested and explain why.
