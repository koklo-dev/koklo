---
name: condition-based-waiting
description: Replace arbitrary sleeps with bounded polling of observable completion conditions.
---

# Condition-based waiting

Define the observable success condition and terminal failure condition before waiting. Poll at a bounded interval, record the last observed state, and stop at a declared timeout. Never treat elapsed time alone as success. On timeout, report `UNVERIFIED` with the missing condition and evidence unless the project explicitly defines that condition as blocking.
