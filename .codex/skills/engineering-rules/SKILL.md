---
name: engineering-rules
description: Configure, explain and validate the effective Shipyard engineering rules for an agent and package.
allowed-tools: Read, Bash($HOME/.claude/shipyard/bin/engineering-rules.sh:*)
---

# Engineering rules

Use the framework helper as the only resolver:

```bash
"${CLAUDE_HOME:-$HOME/.claude}/shipyard/bin/engineering-rules.sh" <action> --root . <options>
```

Actions:

- `configure [--path <scope>] [--profiles <csv>]`: show detected and proposed profiles. Ask the user to confirm the proposal, then rerun with `--confirm`. Business profiles such as `privacy-rgpd` are never inferred.
- `explain --agent <role> [--path <scope>]`: load the effective rules, origins, severities and enforcement contracts before the agent acts.
- `validate --agent <role> [--path <scope>] [--evidence <artifact>]`: run applicable gates and verify evidence rule ids before PASS.

Treat exit `1` as a measured blocking failure and exit `2` as invalid configuration,
protected-rule conflict or blocking `UNVERIFIED` evidence. Neither may become PASS.

Project additions belong in `shipyard/rules/project-rules.json`, or the vault
project's `rules/project-rules.json`. Never edit the locked catalogue directly.
