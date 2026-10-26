---
title: Domain model
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
---
# Domain model

## Entities and responsibilities
TO DOCUMENT — one line per entity: what it owns, what it must never own.

## Relationships and cardinalities

```mermaid
erDiagram
  ENTITY_A ||--o{ ENTITY_B : owns
```

## Enums, invariants and constraints
TO DOCUMENT — the rules the database or the domain layer enforces.

## Lifecycle and state machines
TO DOCUMENT — the state transitions that carry business meaning.

```mermaid
stateDiagram-v2
  [*] --> Draft
  Draft --> Active
  Active --> [*]
```

## Persistence and migrations
TO DOCUMENT — storage mapping, migration strategy, backward compatibility.
