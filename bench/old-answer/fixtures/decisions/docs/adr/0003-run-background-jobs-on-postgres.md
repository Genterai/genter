# 3. Run background jobs on Postgres

Date: 2026-03-03

## Status

Superseded by [11. Run background jobs on Redis](0011-run-background-jobs-on-redis.md)

## Context

Background jobs (emails, exports, webhooks) need a queue, and we already run Postgres.

## Decision

Background jobs run on Postgres: a jobs table that workers poll every second with `SELECT ... FOR UPDATE SKIP LOCKED`.
A worker that polls the jobs table takes the oldest job first.

## Consequences

One database to run. The jobs table grows, so it is vacuumed every night.
