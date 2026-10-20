# Deprecation policy

We deprecate a flag one minor release before we remove it, and say so in the changelog.

## Notes on deprecated API handling

A call to a deprecated endpoint answers with a `Sunset` header.
