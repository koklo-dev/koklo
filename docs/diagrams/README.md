---
title: Diagrams
audience: technical
doc_version: 0.1.0
status: draft
last_reviewed: 2026-10-26
covers_release: unreleased
sources: []
---
# Diagrams

**Mermaid is the project standard.** Diagrams live inside the document they
explain, in a fenced `mermaid` block, so they are versioned, diffable and
reviewable with the text they belong to.

This folder is only for diagram sources that are reused by several documents:
one `.mmd` file per diagram, included by reference from the documents.

Conventions:
- one idea per diagram; split rather than crowd
- label every edge with what actually flows over it
- keep node names identical to the names used in the code
- no manual layout tuning: readability comes from fewer nodes
