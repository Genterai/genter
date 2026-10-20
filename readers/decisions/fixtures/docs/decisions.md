# Decisions

One heading per decision, newest last. When one replaces another, the old one says so under its heading.

## 2026-03-03: Jobs run on Postgres

Status: superseded by [Jobs run on Redis](#2026-09-24-jobs-run-on-redis)

Background jobs use a `jobs` table with `SKIP LOCKED`; no new service to run.

## 2026-05-14: Invoices are numbered per shop

Status: accepted

Each shop has its own sequence, so numbers have no gaps a customer could notice.

## 2026-09-24: Jobs run on Redis

Status: accepted

At month end the jobs table slowed invoices down; jobs move to Redis streams.
