#!/usr/bin/env node
// No keys, no packages:  genter add ./docs   ·   genter ask "how do we deploy?"   ·   genter mcp
import { local } from "./local.js";

await local(process.argv.slice(2));
process.exit(process.exitCode ?? 0);
