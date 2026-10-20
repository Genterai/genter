# 3. Run background jobs on Postgres

Date: 2026-03-03

## Status

Superseded by [11. Run background jobs on Redis](0011-run-jobs-on-redis.md)

## Context

Acme's background jobs (invoices, exports, reminders) need a queue. We already run Postgres and want no new service
to operate.

## Decision

Jobs run on Postgres, with `SELECT ... FOR UPDATE SKIP LOCKED` on a `jobs` table.

## Consequences

One service less to run; the queue shares the database's load.
