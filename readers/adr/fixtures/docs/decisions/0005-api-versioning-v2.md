---
status: accepted
date: 2026-08-19
deciders: Priya, Dana, Omar
---
# Version the API in a header

## Context and Problem Statement

Paths with versions break every client link at each release.

## Decision Outcome

Chosen option: an `Api-Version` header, defaulting to the newest.
