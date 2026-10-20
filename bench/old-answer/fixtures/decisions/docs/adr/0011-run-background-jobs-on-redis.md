# 11. Run background jobs on Redis

Date: 2026-09-24

## Status

Accepted. Supersedes [3. Run background jobs on Postgres](0003-run-background-jobs-on-postgres.md)

## Context

Polling made the database the bottleneck at peak hours.

## Decision

Queued work moves to Redis streams; workers read it with consumer groups and acknowledge each entry.
