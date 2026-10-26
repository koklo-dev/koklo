---
name: validation-front
description: >
  Validate a user-visible change in a real browser before calling it done: a Chrome walk-through
  when the session has the Claude in Chrome extension, an end-to-end test of the touched screens
  otherwise, UNVERIFIED (never PASS) when neither can run. Mandatory whenever the diff touches a
  frontend package, a shared UI package, or a screen's copy or styles.
allowed-tools: Bash, Read
---

# Skill: validation-front

## Objective
Lint, tests and build prove the code runs. They do not prove the screen works: a layout that
collapsed, a button that does nothing, a stale export served instead of the new build, a text
that overflows. This skill makes "I looked at it, and here is what I saw" part of the definition
of done for every frontend change.

## When it applies
The change touches any of:
- a frontend application or a shared UI/component package (pages, components, styles, assets);
- a user-visible string (labels, help texts, error messages) rendered by one of them;
- a contract consumed by a screen in a way that changes what the screen shows.

Pure backend, infrastructure, documentation or test-only changes are out of scope: say so in one
line in the report instead of running it.

## Procedure — pick the strongest level available, in this order

### Level 1 — Chrome walk-through (interactive session with the Claude in Chrome tools)
1. Build what the user will actually get. For a static export, rebuild it and check the build
   output ends without a type or compile error **and** that the exported page's timestamp is
   newer than your last edit — a failed build leaves the previous export in place, and the
   browser then shows the old screen.
2. Serve it against a running API with real or seeded data. Never reuse a port another session
   owns; check before starting a second server.
3. Load the Chrome tools in one `ToolSearch`, open a **new** tab, and walk every acceptance
   criterion as a user would: navigation in and out, the main action, cancel/reset, the empty
   state, an error state when reachable, reload (state kept in the URL survives), back button.
4. For every write you perform on shared data, restore the original value afterwards and say so.
5. Check the narrow layout (phone width) when the screen is responsive. If the window cannot be
   resized, say it was not checked — do not claim it.
6. Read the console (`read_console_messages` with a pattern) for errors raised during the walk.
7. Stop the servers you started and close the tabs you opened.

### Level 2 — End-to-end test (no browser tool: autonomous loop, CI-only session)
1. Run the project's end-to-end suite **scoped to the touched screens** (the e2e command is in
   the `push-to-github` skill). A screen without any e2e coverage gets at least one: it loads,
   its main action works, and it passes the accessibility check when the project has one.
2. When the project declares a visual gate (screenshot manifest with enabled shots), its result
   is part of the evidence; a drift is a failure, a capture pending approval is reported as such.

### Level 3 — Neither is possible
Mark the frontend validation **UNVERIFIED**, with the reason (no browser tool, application does
not start, missing service). UNVERIFIED never becomes PASS: the reviewer or a human performs
level 1 before merge.

## Evidence (mandatory in the report / PR body, section "Validation front")
- the level reached (Chrome / e2e / UNVERIFIED) and why not a stronger one;
- for Chrome: the route(s) visited and, per acceptance criterion, what was observed; data
  modified and restored; what was not checked (e.g. phone width);
- for e2e: the exact command and its result (passed/failed counts);
- defects found during the walk and fixed in the same change.

## Checks
- [ ] Applicability stated (applies / out of scope, with the touched paths)
- [ ] Strongest available level used
- [ ] Every acceptance criterion with a visible effect observed, one by one
- [ ] Shared data restored after any write
- [ ] Unchecked aspects named explicitly, never implied as checked
