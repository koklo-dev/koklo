---
name: dependency-selection
description: >
  Resolve the latest stable upstream version and the matching official documentation before adding
  or initialising any dependency, framework or project generator. Never version from memory.
allowed-tools: Bash, Read, WebFetch, WebSearch
---

# Skill: dependency-selection

## Objective
Guarantee that every dependency, framework or scaffold introduced in this node project is
pinned to the **latest stable upstream release at the time it is added**, and that the code written
against it follows the **official documentation of that exact version**.

Model memory is out of date by construction. A version taken from memory is a defect, even when it
resolves and installs.

## When this skill is mandatory
- Initialising the project or a new package (any `create-*` / `init` generator)
- Adding a runtime or dev dependency
- Adopting a new framework, ORM, test runner, linter, build tool or CI action
- Upgrading a dependency as part of a task
- Writing an ADR that names a library (§5 of the engineering standards)

## Procedure (strict order)
1. **Resolve the latest stable version at the source** — never from memory, never from an example
   found in a blog post or in existing code:
   - npm: `npm view <pkg> version` (and `npm view <pkg> dist-tags time.<version>` for the release date)
   - Composer: `composer show -a <vendor/pkg> | head -20`
   - PyPI: `pip index versions <pkg>`
   - Cargo: `cargo search <crate>` · Go: `go list -m -versions <module>`
   - GitHub Actions / runtimes: the upstream repository's releases page
2. **Reject pre-releases** — ignore `alpha`, `beta`, `rc`, `next`, `canary` and `dev` tags unless the
   task explicitly asks for one; record the justification if it does.
3. **Check the runtime floor** — the resolved version must support the runtime this project actually
   targets (Node/PHP/Python version in the manifest and in CI). If the latest stable requires a newer
   runtime, either raise the runtime in the same change or pin the latest version compatible with the
   current floor **and write down why**.
4. **Read the official documentation of that version** — use the Context7 MCP server when available
   (`resolve-library-id` then `query-docs`, version-specific id when the library exposes one),
   otherwise the upstream documentation site for that release. Do not write API calls from memory:
   the API of the latest major is frequently not the one the model remembers.
5. **Check the breaking changes** — read the CHANGELOG / migration guide entry for the major you are
   adopting when it is not the one previously used in the project.
6. **Install and pin explicitly** — install the resolved version, commit the lockfile, and never leave
   a floating `*`, `latest` or an unbounded range in the manifest.
7. **Run the audit** — `TO CLARIFY` after the install; a fresh dependency with a known
   high/critical advisory is not adopted (see `dependency-audit`).

## Checks
- [ ] Every added dependency was resolved through a registry/upstream command in this session
- [ ] No pre-release version adopted without a written justification
- [ ] Resolved versions are compatible with the runtime declared in the manifest and in CI
- [ ] Official documentation of the adopted version was consulted before writing code against it
- [ ] Lockfile committed; no floating range left in the manifest
- [ ] Dependency audit clean for the newly added packages

## On failure
If the latest stable cannot be resolved (no network, registry down), **do not guess a version**.
Report the blocker, and either reuse a version already present and locked in the project, or stop the
task as `[BLOCKING]`.

## Evidence to emit
Emit this table in the stage artifact — it satisfies the `global.dependency-currency` engineering rule:

```
| package | version retained | latest stable observed | source | docs consulted |
|---|---|---|---|---|
| <name> | <x.y.z> | <x.y.z> | <command or URL> | <doc url / context7 id> |
```
Mention the rule id `global.dependency-currency` in the artifact so
`engineering-rules validate --evidence` can match it.
