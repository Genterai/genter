# Changelog

All notable changes to this project are documented in this file. The format is based on Keep a Changelog, and this
project adheres to Semantic Versioning.

## [Unreleased]

### Added

- `acme export --since` takes a date.

## [2.0.0] - 2026-10-01

### Removed

- The `--legacy-auth` flag; sign in with `acme login`.

### Deprecated

- `acme sync`: use [acme pull](docs/pull.md) instead. It goes in 3.0.

### Changed

- Exports are written as UTF-8 with a byte-order mark.

## [1.4.0] - 2026-06-15

### Added

- Invoices can be exported as CSV.

### Fixed

- Reminders no longer go out twice when a job is retried.

## [1.0.0] - 2026-01-10

### Added

- The first release.

[Unreleased]: https://example.com/acme/compare/v2.0.0...HEAD
