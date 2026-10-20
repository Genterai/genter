# 11. Run background jobs on Redis

Date: 2026-09-24

## Status

Accepted

Supersedes [3. Run background jobs on Postgres](0003-run-jobs-on-postgres.md)

## Context

At month end the jobs table holds a million rows and slows the invoice queries down.

## Decision

Jobs run on Redis streams, one stream per queue.
