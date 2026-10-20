# 50 repositories: what the readers find

Written by `node bench/repos/run.mjs` on 2026-10-20 with genter-cli 0.3.1 and the readers adr, changelog, decisions, rfc, banners, obsidian. The method is in [README.md](README.md); the numbers are in [results/2026-10-20.json](results/2026-10-20.json).

## The gate

**Does not pass.** The gate (step 1.10 of Genter's open-source plan) passes when the median repository has 5 or more decision records and 15 of the 50 have an explicit replaced mark.

* The median repository has **0** decision records the readers read (below 5). The records are there: by each group's own pattern for its records (candidates.json), whatever their format, the median repository holds 33 (the changelog group holds none by definition); the readers as shipped take few of their formats (below).
* **28 of 50** have at least one document that carries a mark the readers read (at least 15); in 7 of them a mark names a replacing document that is in the repository (where Genter puts the current answer first).
* The gate counts a mark of any kind, from any reader, the fallback ones (banners, front matter) included, as the readers read it: a heading or a sentence a fallback reader takes for a document's own mark counts too. By kind, the repositories with a mark: superseded 14, moved 12, deprecated 16, obsolete 4; with a superseded or moved mark (one that names a replacement or a new place) 22, at least 15; with a superseded mark alone 14, below 15.

| group | repositories | median decision records read | median records in the tree | with a replaced mark | with a mark naming a document there |
| -- | --: | --: | --: | --: | --: |
| Decision archives | 18 | 0 | 124 | 10 | 2 |
| Decision records in a project's own tree | 16 | 0 | 57 | 14 | 4 |
| Deprecation notices in a changelog | 16 | 0 | – | 4 | 1 |

**The three archives** for the launch pages and the old-answer test (bench/old-answer): [jaegertracing/jaeger](https://github.com/jaegertracing/jaeger), [python/peps](https://github.com/python/peps), [kubernetes/enhancements](https://github.com/kubernetes/enhancements): among the repositories with 5 or more decision records, the most documents whose mark names a replacing document that is there, then the most that name what replaces them, then the most marked.

* **jaegertracing/jaeger**: 3 of its 3 marked documents were marked by a fallback reader alone, not by a record's own status: [docs/adr/002-mcp-server.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/adr/002-mcp-server.md#L3) (banners, superseded) "* **Status**: Implemented ([#8423](https://github.com/jaegertracing/jaeger/pull/8423)); graduated from [RFC 0012](../rfc/0012-mcp-server-extension.md). Decisions 2 and 3 are superseded — see below"; [docs/rfc/0002-ai-gateway-contextual-tools.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0002-ai-gateway-contextual-tools.md#L3) (banners, superseded) "- **Status:** Implemented — the §5 tool-routing decision is superseded by [RFC 0008](./0008-ai-gateway-mcp-tool-routing.md)"; [docs/rfc/0012-mcp-server-extension.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0012-mcp-server-extension.md#L3) (banners, superseded) "- **Status:** Implemented — graduated into [ADR-002](../adr/002-mcp-server.md); tool routing superseded by [RFC 0008](./0008-ai-gateway-mcp-tool-routing.md)". Genter applies each mark to its whole document, so a line that supersedes only a part of one marks all of it; a launch page built on these marks waits for the owner's review of each.
* **kubernetes/enhancements**: 2 of its 2 marked documents were marked by a fallback reader alone, not by a record's own status: [EXCEPTIONS.md](https://github.com/kubernetes/enhancements/blob/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8/EXCEPTIONS.md#L1) (banners, moved) "This file has moved to https://git.k8s.io/sig-release/releases/EXCEPTIONS.md."; [keps/sig-storage/2451-service-account-token-volumes/README.md](https://github.com/kubernetes/enhancements/blob/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8/keps/sig-storage/2451-service-account-token-volumes/README.md#L1) (banners, superseded) "# Service Account Token Volumes [Replaced by [Bound Service Account Tokens](https://github.com/kubernetes/enhancements/tree/master/keps/sig-auth/1205-bound-service-account-tokens)]". Genter applies each mark to its whole document, so a line that supersedes only a part of one marks all of it; a launch page built on these marks waits for the owner's review of each.

## Per repository

Decision records: documents the adr or rfc reader reads a date, a status or a mark in, and entries of a decision log; in the tree: the files that match the group's own pattern for the repository's records (candidates.json), read or not. Replaced: documents that carry a mark the readers read (superseded, deprecated, obsolete, archived, moved, removed, unmaintained), from any reader; named: the mark names what replaces it; there: the replacing document it links is in the repository. Dated: documents a reader reads a date in. Changelog deprecations: entries' deprecated and removed items, not marks of a document.

| repository | stars | commit | files read | decision records | in the tree | replaced | named | there | dated | changelog deprecations | readers that read something |
| -- | --: | -- | --: | --: | --: | --: | --: | --: | --: | --: | -- |
| **Decision archives** | | | | | | | | | | | |
| [tc39/proposals](https://github.com/tc39/proposals) | 19199 | [07002d4](https://github.com/tc39/proposals/tree/07002d4d999558b9c7326f98e5134e0222b13808) 2026-10-14 | 11 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | – |
| [swiftlang/swift-evolution](https://github.com/swiftlang/swift-evolution) | 15885 | [58a9986](https://github.com/swiftlang/swift-evolution/tree/58a9986b616a427a9cf6584219cb6cb1a12cc1fe) 2026-10-20 | 611 | 0 | 559 | 0 | 0 | 0 | 0 | 0 | – |
| [ethereum/EIPs](https://github.com/ethereum/EIPs) | 14036 | [cd7b26d](https://github.com/ethereum/EIPs/tree/cd7b26d2cf39d2eb071a26e1890e331f58767079) 2026-10-20 | 1024 | 0 | 966 | 366 | 365 | 0 | 601 | 0 | obsidian 967, banners 366 |
| [dotnet/csharplang](https://github.com/dotnet/csharplang) | 12719 | [80f71eb](https://github.com/dotnet/csharplang/tree/80f71ebeb01cb9d973611929834599fdaaf171ba) 2026-10-17 | 906 | 0 | 216 | 25 | 25 | 1 | 0 | 0 | banners 25 |
| [WebAssembly/design](https://github.com/WebAssembly/design) | 11628 | [6e43416](https://github.com/WebAssembly/design/tree/6e43416ebc8becd6cdf5d91d9ae7d3712111df32) 2025-10-21 | 25 | 0 | 25 | 1 | 1 | 0 | 0 | 0 | banners 1 |
| [bitcoin/bips](https://github.com/bitcoin/bips) | 10979 | [130b8e0](https://github.com/bitcoin/bips/tree/130b8e0fa7f30fa45532f080b87b8db27a79e46e) 2026-10-19 | 43 | 0 | 213 | 0 | 0 | 0 | 3 | 0 | changelog 3 |
| [rust-lang/rfcs](https://github.com/rust-lang/rfcs) | 6612 | [f63a7ef](https://github.com/rust-lang/rfcs/tree/f63a7efbb9d83ae0616cf752c000cd3df4ca5d3e) 2026-10-20 | 657 | 0 | 652 | 1 | 1 | 1 | 0 | 0 | banners 1 |
| [reactjs/rfcs](https://github.com/reactjs/rfcs) | 5818 | [c15bc9d](https://github.com/reactjs/rfcs/tree/c15bc9df5afa8fd1dca6e5fd1c2ed073f7a9bd79) 2023-11-03 | 24 | 0 | 19 | 0 | 0 | 0 | 0 | 0 | – |
| [python/peps](https://github.com/python/peps) | 5029 | [1317769](https://github.com/python/peps/tree/1317769c334c658db28aa5336d910f58443049eb) 2026-10-20 | 772 | 746 | 745 | 31 | 31 | 0 | 745 | 0 | rfc 746 |
| [vuejs/rfcs](https://github.com/vuejs/rfcs) | 4927 | [2c62d12](https://github.com/vuejs/rfcs/tree/2c62d12d0b8dc53018ed6ab6fbc5aea336d8eea6) 2023-10-13 | 45 | 0 | 43 | 0 | 0 | 0 | 0 | 0 | – |
| [kubernetes/enhancements](https://github.com/kubernetes/enhancements) | 3972 | [5b503a7](https://github.com/kubernetes/enhancements/tree/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8) 2026-10-17 | 1433 | 691 | 686 | 2 | 2 | 0 | 675 | 0 | rfc 691, banners 2 |
| [Kotlin/KEEP](https://github.com/Kotlin/KEEP) | 3774 | [b6d5dc8](https://github.com/Kotlin/KEEP/tree/b6d5dc8b53db82ee3dc561c935bd8f2073bb90a2) 2026-10-20 | 134 | 0 | 121 | 0 | 0 | 0 | 0 | 0 | – |
| [golang/proposal](https://github.com/golang/proposal) | 3459 | [83ee2aa](https://github.com/golang/proposal/tree/83ee2aaf9fdcc1a1cf4bb4d20216fc979635cf04) 2026-10-16 | 133 | 0 | 91 | 2 | 2 | 0 | 0 | 0 | banners 2 |
| [nostr-protocol/nips](https://github.com/nostr-protocol/nips) | 3120 | [0b5532c](https://github.com/nostr-protocol/nips/tree/0b5532c0355ab27f447e071a93c09cf3a2b4aad5) 2026-10-19 | 100 | 0 | 99 | 1 | 1 | 0 | 0 | 0 | banners 1 |
| [dart-lang/language](https://github.com/dart-lang/language) | 2936 | [d78725f](https://github.com/dart-lang/language/tree/d78725f3797b115dbb8b1ce922843e925706e564) 2026-10-19 | 218 | 0 | 76 | 5 | 1 | 0 | 0 | 0 | banners 5 |
| [tensorflow/community](https://github.com/tensorflow/community) | 1289 | [1855301](https://github.com/tensorflow/community/tree/185530183d8f3734795beb520d02b8265c230a12) 2024-02-13 | 167 | 0 | 127 | 0 | 0 | 0 | 0 | 0 | – |
| [matrix-org/matrix-spec-proposals](https://github.com/matrix-org/matrix-spec-proposals) | 1261 | [927e20f](https://github.com/matrix-org/matrix-spec-proposals/tree/927e20f5115681ea5a28394d53d2928ccf8f5949) 2026-10-18 | 277 | 0 | 272 | 1 | 0 | 0 | 0 | 0 | banners 1 |
| [WebAssembly/proposals](https://github.com/WebAssembly/proposals) | 1139 | [df6a2ac](https://github.com/WebAssembly/proposals/tree/df6a2aca1cd9d779eb4f2f3e19dae8277f336015) 2026-10-06 | 4 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | – |
| **Decision records in a project's own tree** | | | | | | | | | | | |
| [microsoft/terminal](https://github.com/microsoft/terminal) | 105195 | [9e6cf22](https://github.com/microsoft/terminal/tree/9e6cf223ddb7d62eba85254ed88f8e2d663a172e) 2026-10-19 | 132 | 0 | 58 | 6 | 4 | 0 | 0 | 0 | banners 6 |
| [pingcap/tidb](https://github.com/pingcap/tidb) | 40660 | [88d75cb](https://github.com/pingcap/tidb/tree/88d75cb0335509f29fba343d17ee668282e0d5e8) 2026-10-20 | 201¹ | 0 | 120 | 0 | 0 | 0 | 0 | 0 | – |
| [backstage/backstage](https://github.com/backstage/backstage) | 34678 | [b29d944](https://github.com/backstage/backstage/tree/b29d944884849e0f108f4cc2463c5c23b0a34b6a) 2026-10-20 | 2047¹ | 0 | 16 | 6 | 3 | 1 | 0 | 0 | changelog 232, obsidian 16, banners 6 |
| [carbon-language/carbon-lang](https://github.com/carbon-language/carbon-lang) | 33922 | [505c4ae](https://github.com/carbon-language/carbon-lang/tree/505c4ae308c0fe4e18eafddbab47a848b8731019) 2026-10-19 | 340 | 0 | 189 | 0 | 0 | 0 | 0 | 0 | – |
| [numpy/numpy](https://github.com/numpy/numpy) | 33063 | [a43563f](https://github.com/numpy/numpy/tree/a43563f6d7e6424a5dea38181982af284eede2d7) 2026-10-20 | 672 | 0 | 56 | 4 | 0 | 0 | 0 | 0 | banners 4 |
| [cockroachdb/cockroach](https://github.com/cockroachdb/cockroach) | 32575 | [d30c905](https://github.com/cockroachdb/cockroach/tree/d30c905fff79ef825adc96bcc647f1872a90f2ff) 2026-09-23 | 701¹ | 183 | 188 | 4 | 0 | 0 | 177 | 0 | rfc 183, banners 2, changelog 1 |
| [opentofu/opentofu](https://github.com/opentofu/opentofu) | 30550 | [42f15c9](https://github.com/opentofu/opentofu/tree/42f15c9bfc27b5e59e0f324466824338d5abb2a2) 2026-10-19 | 440 | 0 | 52 | 2 | 2 | 2 | 0 | 0 | banners 2, changelog 1 |
| [grafana/loki](https://github.com/grafana/loki) | 29049 | [610e593](https://github.com/grafana/loki/tree/610e593d485de7fc32ccc33f1e2c8b856da2ebb5) 2026-10-20 | 346¹ | 0 | 8 | 4 | 2 | 0 | 25 | 0 | obsidian 23, banners 4, changelog 3 |
| [argoproj/argo-cd](https://github.com/argoproj/argo-cd) | 24440 | [5f6569e](https://github.com/argoproj/argo-cd/tree/5f6569ec51bdb7c88a7402f9ea1395a21fe7f540) 2026-10-20 | 512¹ | 0 | 36 | 7 | 1 | 1 | 1 | 0 | banners 7, changelog 1 |
| [jaegertracing/jaeger](https://github.com/jaegertracing/jaeger) | 23319 | [ca047c7](https://github.com/jaegertracing/jaeger/tree/ca047c72f34cf413c16d1118e19c7419de04bbab) 2026-10-19 | 122 | 32 | 15 | 3 | 2 | 2 | 28 | 0 | rfc 18, adr 14, banners 3 |
| [vectordotdev/vector](https://github.com/vectordotdev/vector) | 22737 | [3884947](https://github.com/vectordotdev/vector/tree/3884947e662e004eceda87c9838038b26fb1a795) 2026-10-20 | 698 | 0 | 79 | 11 | 2 | 0 | 181 | 0 | obsidian 181, banners 11 |
| [gravitational/teleport](https://github.com/gravitational/teleport) | 21006 | [1283425](https://github.com/gravitational/teleport/tree/1283425b60ec5f60d509ba4c791183d452923ff7) 2026-08-25 | 1605¹ | 0 | 228 | 2 | 0 | 0 | 0 | 0 | banners 2, changelog 1 |
| [quarkusio/quarkus](https://github.com/quarkusio/quarkus) | 15950 | [637cff2](https://github.com/quarkusio/quarkus/tree/637cff27027d2c5f2521ee9cd100bb6ced96390a) 2026-10-20 | 594¹ | 0 | 11 | 2 | 2 | 0 | 0 | 0 | banners 2 |
| [apache/pulsar](https://github.com/apache/pulsar) | 15351 | [5307d76](https://github.com/apache/pulsar/tree/5307d760114dd23528dd33c16b5446f93de37abb) 2026-10-20 | 409¹ | 0 | 315 | 1 | 1 | 0 | 0 | 0 | banners 1 |
| [thanos-io/thanos](https://github.com/thanos-io/thanos) | 14240 | [777ac41](https://github.com/thanos-io/thanos/tree/777ac4173c8cddb009db8aed9e4215b45549f497) 2026-10-20 | 100 | 0 | 30 | 1 | 0 | 0 | 8 | 4 | obsidian 33, changelog 1, banners 1 |
| [crossplane/crossplane](https://github.com/crossplane/crossplane) | 12182 | [6dbabf1](https://github.com/crossplane/crossplane/tree/6dbabf1e17b5f5f2b9866742c0ee11ed6668f8c7) 2026-10-20 | 109 | 0 | 82 | 1 | 0 | 0 | 0 | 0 | banners 1 |
| **Deprecation notices in a changelog** | | | | | | | | | | | |
| [axios/axios](https://github.com/axios/axios) | 109303 | [fceeb10](https://github.com/axios/axios/tree/fceeb10997ea71778ad8bc9671ad53e9195a707c) 2026-10-20 | 155 | 0 | – | 0 | 0 | 0 | 0 | 0 | changelog 1 |
| [angular/angular](https://github.com/angular/angular) | 101107 | [ea43e6c](https://github.com/angular/angular/tree/ea43e6c3934a8cf6b9d420505611096db3bb435c) 2026-10-20 | 1487¹ | 0 | – | 2 | 0 | 0 | 3 | 0 | changelog 3, banners 2 |
| [tailwindlabs/tailwindcss](https://github.com/tailwindlabs/tailwindcss) | 97948 | [8cc0551](https://github.com/tailwindlabs/tailwindcss/tree/8cc0551b1217d36dc565840b90920964d37cb46c) 2026-10-19 | 31 | 0 | – | 0 | 0 | 0 | 1 | 1 | changelog 1 |
| [puppeteer/puppeteer](https://github.com/puppeteer/puppeteer) | 95727 | [4dd58bc](https://github.com/puppeteer/puppeteer/tree/4dd58bc1625e5c0a33b8f1f0419fb23975d5aac4) 2026-10-20 | 759 | 0 | – | 16 | 2 | 2 | 6 | 0 | banners 16, changelog 6 |
| [vitejs/vite](https://github.com/vitejs/vite) | 83418 | [2601eed](https://github.com/vitejs/vite/tree/2601eed4d764f21809652dbba745d0f38b47146c) 2026-10-20 | 89 | 0 | – | 0 | 0 | 0 | 15 | 0 | obsidian 12, changelog 3 |
| [prometheus/prometheus](https://github.com/prometheus/prometheus) | 66675 | [afa1fde](https://github.com/prometheus/prometheus/tree/afa1fdebab3d56eab4527a1a1d5bc9f31a6978d6) 2026-10-20 | 83 | 0 | – | 0 | 0 | 0 | 1 | 0 | changelog 2 |
| [traefik/traefik](https://github.com/traefik/traefik) | 65293 | [a804fea](https://github.com/traefik/traefik/tree/a804fea41db3f5ed12335114f470d959b37f6737) 2026-10-20 | 193 | 0 | – | 0 | 0 | 0 | 0 | 0 | – |
| [socketio/socket.io](https://github.com/socketio/socket.io) | 63226 | [1eaa582](https://github.com/socketio/socket.io/tree/1eaa582d3b453e3e6f522300ed05b10da0a0799b) 2026-09-29 | 77 | 0 | – | 2 | 2 | 0 | 12 | 0 | changelog 12, banners 2 |
| [vuejs/core](https://github.com/vuejs/core) | 54696 | [ef81ddc](https://github.com/vuejs/core/tree/ef81ddcfc94399c043b349a986a1b231b6bac7d6) 2026-10-20 | 27 | 0 | – | 0 | 0 | 0 | 1 | 0 | changelog 1 |
| [hashicorp/terraform](https://github.com/hashicorp/terraform) | 49985 | [79307e8](https://github.com/hashicorp/terraform/tree/79307e8a06d49af948cf28ef3c67212eb8574919) 2026-10-20 | 50 | 0 | – | 0 | 0 | 0 | 0 | 0 | changelog 1 |
| [babel/babel](https://github.com/babel/babel) | 44059 | [6cd3db7](https://github.com/babel/babel/tree/6cd3db7d9c125ec5100093f4ed7e6f6db570c409) 2026-10-20 | 402¹ | 0 | – | 0 | 0 | 0 | 2 | 0 | changelog 2 |
| [typeorm/typeorm](https://github.com/typeorm/typeorm) | 36662 | [fe92394](https://github.com/typeorm/typeorm/tree/fe92394287516feeada6e9c308ebe22deca2458e) 2026-10-11 | 88 | 0 | – | 0 | 0 | 0 | 2 | 0 | changelog 1, obsidian 1 |
| [date-fns/date-fns](https://github.com/date-fns/date-fns) | 36645 | [717ce0a](https://github.com/date-fns/date-fns/tree/717ce0a807ea4c6b540d015b5c408723175b2838) 2026-09-22 | 123 | 0 | – | 0 | 0 | 0 | 3 | 1 | changelog 3 |
| [laravel/framework](https://github.com/laravel/framework) | 34967 | [31dbc2b](https://github.com/laravel/framework/tree/31dbc2b9b0fc775ae3bbc87ae2387e88693ad2ff) 2026-10-20 | 44 | 0 | – | 0 | 0 | 0 | 1 | 0 | changelog 1 |
| [hashicorp/consul](https://github.com/hashicorp/consul) | 30088 | [75e6642](https://github.com/hashicorp/consul/tree/75e6642edbaf82074dab46c48c44a9258bb4d7a7) 2026-10-19 | 175¹ | 0 | – | 2 | 0 | 0 | 0 | 0 | banners 2, changelog 1 |
| [pydantic/pydantic](https://github.com/pydantic/pydantic) | 29108 | [8d975e6](https://github.com/pydantic/pydantic/tree/8d975e607ca3225699f81ce3c91ee689a71d3ea4) 2026-10-20 | 99 | 0 | – | 0 | 0 | 0 | 1 | 0 | changelog 1 |

¹ The repository holds more than 5,000 files the engine reads (code included); Genter reads the first 5,000 of a folder in name order, so on a whole clone it may not reach every document counted here.

## What the readers miss

28 repositories hold 5 or more records in the tree that the readers read less than half of: their records are in a place or a form no reader in readers/ takes yet (a reader is data: readers/<name>/reader.json, outside harden's Sources).

* **swiftlang/swift-evolution**: 559 Swift Evolution proposals (`^proposals/\d{4}-.+\.md$`), 0 read.
* **ethereum/EIPs**: 966 Ethereum Improvement Proposals (`^EIPS/eip-\d+\.md$`), 0 read.
* **dotnet/csharplang**: 216 C# language proposals (`^proposals/.+\.md$`), 0 read.
* **WebAssembly/design**: 25 WebAssembly design documents (`^[^/]+\.md$`), 0 read.
* **bitcoin/bips**: 213 Bitcoin Improvement Proposals (`^bip-\d+\.(mediawiki|md)$`), 0 read.
* **rust-lang/rfcs**: 652 Rust RFCs (`^text/\d{4}-.+\.md$`), 0 read.
* **reactjs/rfcs**: 19 React RFCs (`^text/\d{4}-.+\.md$`), 0 read.
* **vuejs/rfcs**: 43 Vue RFCs (`^active-rfcs/\d{4}-.+\.md$`), 0 read.
* **Kotlin/KEEP**: 121 Kotlin Evolution and Enhancement Process (`^proposals/.+\.md$`), 0 read.
* **golang/proposal**: 91 Go design documents (`^design/\d+-.+\.md$`), 0 read.
* **nostr-protocol/nips**: 99 Nostr Implementation Possibilities (`^[0-9A-F]{2}\.md$`), 0 read.
* **dart-lang/language**: 76 Dart language feature specifications (`^accepted/.+\.md$`), 0 read.
* **tensorflow/community**: 127 TensorFlow RFCs (`^rfcs/.+\.md$`), 0 read.
* **matrix-org/matrix-spec-proposals**: 272 Matrix spec change proposals (`^proposals/\d+-.+\.md$`), 0 read.
* **microsoft/terminal**: 58 specs (`^doc/specs/.+\.md$`), 0 read.
* **pingcap/tidb**: 120 design documents (`^docs/design/.+\.md$`), 0 read.
* **backstage/backstage**: 16 ADRs (`^docs/architecture-decisions/adr\d+.+\.md$`), 0 read.
* **carbon-language/carbon-lang**: 189 proposals (`^proposals/p\d{4,6}-.+\.md$`), 0 read.
* **numpy/numpy**: 56 NumPy Enhancement Proposals (`^doc/neps/nep-\d{4}.+\.rst$`), 0 read.
* **opentofu/opentofu**: 52 RFCs (`^rfc/.+\.md$`), 0 read.
* **grafana/loki**: 8 Loki improvement documents (`^docs/sources/community/lids/.+\.md$`), 0 read.
* **argoproj/argo-cd**: 36 proposals (`^docs/proposals/.+\.md$`), 0 read.
* **vectordotdev/vector**: 79 RFCs (`^rfcs/.+\.md$`), 0 read.
* **gravitational/teleport**: 228 requests for discussion (`^rfd/\d{4}-.+\.md$`), 0 read.
* **quarkusio/quarkus**: 11 ADRs (`^adr/.+\.(adoc|md)$`), 0 read.
* **apache/pulsar**: 315 Pulsar improvement proposals (`^pip/pip-\d+\.md$`), 0 read.
* **thanos-io/thanos**: 30 proposals (`^docs/proposals-[a-z]+/.+\.md$`), 0 read.
* **crossplane/crossplane**: 82 design documents (`^design/.+\.md$`), 0 read.

## Replaced documents whose mark names a replacing document there

10 in all; each links the replaced document at its commit, then the one its mark names.

* **dotnet/csharplang** (1): [proposals/rejected/static-delegates.md](https://github.com/dotnet/csharplang/blob/80f71ebeb01cb9d973611929834599fdaaf171ba/proposals/rejected/static-delegates.md) → [proposals/csharp-9.0/function-pointers.md](https://github.com/dotnet/csharplang/blob/80f71ebeb01cb9d973611929834599fdaaf171ba/proposals/csharp-9.0/function-pointers.md)
* **rust-lang/rfcs** (1): [text/2071-impl-trait-type-alias.md](https://github.com/rust-lang/rfcs/blob/f63a7efbb9d83ae0616cf752c000cd3df4ca5d3e/text/2071-impl-trait-type-alias.md) → [text/2071-impl-trait-existential-types.md](https://github.com/rust-lang/rfcs/blob/f63a7efbb9d83ae0616cf752c000cd3df4ca5d3e/text/2071-impl-trait-existential-types.md)
* **backstage/backstage** (1): [docs/architecture-decisions/adr013-use-node-fetch.md](https://github.com/backstage/backstage/blob/b29d944884849e0f108f4cc2463c5c23b0a34b6a/docs/architecture-decisions/adr013-use-node-fetch.md) → [docs/architecture-decisions/adr014-use-fetch.md](https://github.com/backstage/backstage/blob/b29d944884849e0f108f4cc2463c5c23b0a34b6a/docs/architecture-decisions/adr014-use-fetch.md)
* **opentofu/opentofu** (2): [rfc/20251105-use-cobra-instead-of-mitchellh.md](https://github.com/opentofu/opentofu/blob/42f15c9bfc27b5e59e0f324466824338d5abb2a2/rfc/20251105-use-cobra-instead-of-mitchellh.md) → [rfc/20260807-use-urfave-instead-of-cobra.md](https://github.com/opentofu/opentofu/blob/42f15c9bfc27b5e59e0f324466824338d5abb2a2/rfc/20260807-use-urfave-instead-of-cobra.md); [website/docs/cli/commands/env.mdx](https://github.com/opentofu/opentofu/blob/42f15c9bfc27b5e59e0f324466824338d5abb2a2/website/docs/cli/commands/env.mdx) → [website/docs/cli/commands/workspace/index.mdx](https://github.com/opentofu/opentofu/blob/42f15c9bfc27b5e59e0f324466824338d5abb2a2/website/docs/cli/commands/workspace/index.mdx)
* **argoproj/argo-cd** (1): [docs/user-guide/config-management-plugins.md](https://github.com/argoproj/argo-cd/blob/5f6569ec51bdb7c88a7402f9ea1395a21fe7f540/docs/user-guide/config-management-plugins.md) → [docs/operator-manual/config-management-plugins.md](https://github.com/argoproj/argo-cd/blob/5f6569ec51bdb7c88a7402f9ea1395a21fe7f540/docs/operator-manual/config-management-plugins.md)
* **jaegertracing/jaeger** (2): [docs/rfc/0002-ai-gateway-contextual-tools.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0002-ai-gateway-contextual-tools.md) → [docs/rfc/0008-ai-gateway-mcp-tool-routing.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0008-ai-gateway-mcp-tool-routing.md); [docs/rfc/0012-mcp-server-extension.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0012-mcp-server-extension.md) → [docs/rfc/0008-ai-gateway-mcp-tool-routing.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0008-ai-gateway-mcp-tool-routing.md)
* **puppeteer/puppeteer** (2): [docs/api/puppeteer.page.cookies.md](https://github.com/puppeteer/puppeteer/blob/4dd58bc1625e5c0a33b8f1f0419fb23975d5aac4/docs/api/puppeteer.page.cookies.md) → [docs/api/puppeteer.browser.cookies.md](https://github.com/puppeteer/puppeteer/blob/4dd58bc1625e5c0a33b8f1f0419fb23975d5aac4/docs/api/puppeteer.browser.cookies.md); [docs/api/puppeteer.page.setcookie.md](https://github.com/puppeteer/puppeteer/blob/4dd58bc1625e5c0a33b8f1f0419fb23975d5aac4/docs/api/puppeteer.page.setcookie.md) → [docs/api/puppeteer.browser.setcookie.md](https://github.com/puppeteer/puppeteer/blob/4dd58bc1625e5c0a33b8f1f0419fb23975d5aac4/docs/api/puppeteer.browser.setcookie.md)
