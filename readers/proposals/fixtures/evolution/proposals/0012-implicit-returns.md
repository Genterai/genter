# Implicit returns from single-expression closures

* Proposal: [SE-0012](0012-implicit-returns.md)
* Authors: [Dana](https://example.org/dana)
* Review Manager: [Omar](https://example.org/omar)
* Status: **Implemented (Acme 2.1)**
* Superseded by: [SE-0030](0030-implicit-returns-everywhere.md)

## Introduction

A closure whose body is one expression returns its value without `return`.
