# The old-answer test: results

Written by `node bench/old-answer/run.mjs` on 2026-10-20 with genter-cli 0.3.1; the numbers are in [results/2026-10-20-chain.json](results/2026-10-20-chain.json). The method is in [README.md](README.md); the questions, 39 of them, in [questions.json](questions.json).

| arm | old answer first | old answer unmarked in the first five | current answer first | current answer in the first five |
| -- | --: | --: | --: | --: |
| plain ranking (BM25 over the same sections, no marks, no reordering) | 8 of 39 (21%) | 31 of 39 (79%) | 20 of 39 (51%) | 32 of 39 (82%) |
| **Genter** (the local engine as shipped, no key) | **0 of 39 (0%)** | **0 of 39 (0%)** | **28 of 39 (72%)** | **35 of 39 (90%)** |

## The current answer, as written and with its chain

A question's current answer is its written current document or any later document reached from it by the archive's own explicit replacement marks, the same kind of mark its pair quotes (a PEP's "Superseded-By: 345"); the old answer stays the replaced document alone. Those later documents are listed by hand from the archive, in order, under "later", each with the line of the document before it that names it, quoted; Genter's readers do not compute them. The rule was decided on 2026-10-20 by the lead of Genter's open-source plan, under the product's principle "current over history", for every question alike. It was set after a run (results/2026-10-20-by-id.json) showed one question affected, peps/0241. The counts above take the current answer with its chain; as written, the written current document alone:

| arm | current answer first, as written | with its chain | current answer in the first five, as written | with its chain |
| -- | --: | --: | --: | --: |
| plain ranking | 20 of 39 (51%) | 20 of 39 (51%) | 32 of 39 (82%) | 32 of 39 (82%) |
| **Genter** | **27 of 39 (69%)** | **28 of 39 (72%)** | **35 of 39 (90%)** | **35 of 39 (90%)** |

The questions whose current document is itself replaced, by a mark of the archive's own (2):

* **peps/0241**: [peps/pep-0314.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0314.rst), then [peps/pep-0345.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0345.rst) (peps/pep-0314.rst says "Superseded-By: 345"), then [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) (peps/pep-0345.rst says "Superseded-By: 566"). Here plain ranking puts peps/pep-0314.rst (the current answer as written) first, Genter peps/pep-0566.rst (later in its chain).
* **peps/0314**: [peps/pep-0345.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0345.rst), then [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) (peps/pep-0345.rst says "Superseded-By: 566"). Here plain ranking puts peps/pep-0808.rst first, Genter peps/pep-0808.rst.

Counted as written, Genter does worse than plain ranking on 1 question(s) that with the chain are no loss: **peps/0241**, where plain ranking puts peps/pep-0314.rst (the current answer as written) first, Genter peps/pep-0566.rst (later in its chain).

## The plan's decision rule

Plain ranking puts the current answer first on 51% of the questions, under 90%: by the plan's rule the local picture can lead. That is the plan's rule applied to the letter; what it rests on:

* What each arm puts first, of 39: plain ranking the old answer on 8, the current one on 20, another document (or nothing) on 11; Genter the old answer on 0, the current one on 28, another document (or nothing) on 11. Where plain ranking does not put the current answer first, the old answer is first on 8 and another document on 11. Another document ranks first in both arms on peps/0005, peps/0248, peps/0314, peps/0409, peps/0426, peps/0554, peps/0563, peps/0601, peps/0622, peps/0631, peps/3153: a review of the questions starts there (that document may state the current answer too).
* Genter's first result differs from plain ranking's on 10 of 39 questions (driftbench/q38, peps/0241, peps/0248, peps/0438, peps/0501, peps/0513, peps/0543, peps/0571, peps/0599, peps/0722), 9 of them among the 34 questions of the public archives.
* On the public archives: current answer first, plain ranking 16 and Genter 23; old answer unmarked in the first five, plain ranking 26 and Genter 0.

## Per source

| source | questions | sections (both arms) | plain: old first | plain: old unmarked in five | Genter: old first | Genter: old unmarked in five | plain: current first | Genter: current first |
| -- | --: | --: | --: | --: | --: | --: | --: | --: |
| [DriftBench, deprecated kind](https://github.com/Genterai/genter/tree/main/bench/drift) | 5 | 341 | 1 | 5 | 0 | 0 | 4 | 5 |
| [Python Enhancement Proposals](https://github.com/python/peps/tree/1317769c334c658db28aa5336d910f58443049eb) at 1317769 (2026-10-20) | 31 | 11228 | 7 | 24 | 0 | 0 | 13 | 20 |
| [Kubernetes Enhancement Proposals](https://github.com/kubernetes/enhancements/tree/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8) at 5b503a7 (2026-10-17) | 1 | 17666 | 0 | 1 | 0 | 0 | 1 | 1 |
| [Jaeger's RFCs and ADRs](https://github.com/jaegertracing/jaeger/tree/ca047c72f34cf413c16d1118e19c7419de04bbab) at ca047c7 (2026-10-19) | 2 | 1337 | 0 | 1 | 0 | 0 | 2 | 2 |

## Before and after

The same questions in the run of 2026-10-20 (genter-cli 0.3.1, [results/2026-10-20.json](results/2026-10-20.json)), the current answer counted as written in both: plain ranking 8 old first, 31 old unmarked in five, 20 current first, 32 current in five, then; now 8 old first, 31 old unmarked in five, 20 current first, 32 current in five. Genter 7 old first, 0 old unmarked in five, 21 current first, 32 current in five, then; now 0 old first, 0 old unmarked in five, 27 current first, 35 current in five. 9 of 39 questions changed what an arm puts first, or their current answer (in bold); the rest put first what they did. Old: the replaced document; current: the replacing one, or a later document of its chain, named; else the document an arm put first.

| question | plain first, then | plain first, now | Genter first, then | Genter first, now |
| -- | -- | -- | -- | -- |
| driftbench/q38 | old | old | current | current |
| driftbench/q39 | current | current | current | current |
| driftbench/q40 | current | current | current | current |
| driftbench/q41 | current | current | current | current |
| driftbench/q42 | current | current | current | current |
| peps/0005 | peps/pep-2026.rst | peps/pep-2026.rst | peps/pep-2026.rst | peps/pep-2026.rst |
| peps/0102 | current | current | current | current |
| peps/0215 | current | current | current | current |
| peps/0216 | current | current | current | current |
| **peps/0241** | current | current | current | current, later in its chain (peps/pep-0566.rst) |
| **peps/0248** | peps/pep-0426.rst | peps/pep-0426.rst | peps/pep-0426.rst | peps/pep-0566.rst |
| peps/0291 | current | current | current | current |
| peps/0314 | peps/pep-0808.rst | peps/pep-0808.rst | peps/pep-0808.rst | peps/pep-0808.rst |
| peps/0333 | current | current | current | current |
| peps/0345 | current | current | current | current |
| peps/0354 | current | current | current | current |
| peps/0386 | current | current | current | current |
| peps/0409 | peps/pep-0344.rst | peps/pep-0344.rst | peps/pep-0344.rst | peps/pep-0344.rst |
| peps/0426 | peps/pep-0819.rst | peps/pep-0819.rst | peps/pep-0819.rst | peps/pep-0819.rst |
| peps/0431 | current | current | current | current |
| peps/0433 | current | current | current | current |
| **peps/0438** | old | old | old | current |
| **peps/0501** | old | old | old | current |
| peps/0509 | current | current | current | current |
| **peps/0513** | old | old | old | current |
| **peps/0543** | old | old | old | current |
| peps/0554 | peps/pep-0413.rst | peps/pep-0413.rst | peps/pep-0413.rst | peps/pep-0413.rst |
| peps/0563 | peps/pep-0484.rst | peps/pep-0484.rst | peps/pep-0484.rst | peps/pep-0484.rst |
| **peps/0571** | old | old | old | current |
| **peps/0599** | old | old | old | current |
| peps/0601 | peps/pep-0346.rst | peps/pep-0346.rst | peps/pep-0346.rst | peps/pep-0346.rst |
| peps/0622 | peps/pep-0642.rst | peps/pep-0642.rst | peps/pep-0642.rst | peps/pep-0642.rst |
| peps/0631 | peps/pep-0735.rst | peps/pep-0735.rst | peps/pep-0735.rst | peps/pep-0735.rst |
| peps/0665 | current | current | current | current |
| **peps/0722** | old | old | old | current |
| peps/3153 | peps/pep-0492.rst | peps/pep-0492.rst | peps/pep-0492.rst | peps/pep-0492.rst |
| keps/2451 | current | current | current | current |
| jaeger/rfc-0002 | current | current | current | current |
| jaeger/rfc-0012 | current | current | current | current |

## Losses

None: Genter never puts the old answer first, never leaves it unmarked in the first five, and is nowhere worse than plain ranking.

## Every question

| question | replaced | current | plain first | Genter first | reviewed |
| -- | -- | -- | -- | -- | -- |
| driftbench/q38: Where do responders meet for the live call during a SEV1? | `ops/incident-response.md` | `ops/incident-management.md` | old | current | DriftBench's own question (bench/drift/questions.json) |
| driftbench/q39: How many business days after a SEV1 is closed is its written review due? | `ops/incident-response.md` | `ops/incident-management.md` | current | current | DriftBench's own question (bench/drift/questions.json) |
| driftbench/q40: Which system do our services evaluate feature flags against? | `engineering/feature-flags.md` | `engineering/feature-flags-openfeature.md` | current | current | DriftBench's own question (bench/drift/questions.json) |
| driftbench/q41: Which CI service runs the checks on every pull request? | `engineering/ci.md` | `engineering/ci-pipeline.md` | current | current | DriftBench's own question (bench/drift/questions.json) |
| driftbench/q42: When are customer-hosted private probe locations expected to become generally available? | `product/roadmap-2026.md` | `product/roadmap-2027.md` | current | current | DriftBench's own question (bench/drift/questions.json) |
| peps/0005: How long must a deprecated Python feature keep warning before it can be removed? | [peps/pep-0005.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0005.rst) | [peps/pep-0387.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0387.rst) | peps/pep-2026.rst | peps/pep-2026.rst | pending owner |
| peps/0102: What steps does the release manager follow to make a Python bugfix release? | [peps/pep-0102.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0102.rst) | [peps/pep-0101.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0101.rst) | current | current | pending owner |
| peps/0215: How do I substitute $name placeholders in a string with values from a mapping? | [peps/pep-0215.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0215.rst) | [peps/pep-0292.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0292.rst) | current | current | pending owner |
| peps/0216: Which markup should be used to write structured Python docstrings? | [peps/pep-0216.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0216.rst) | [peps/pep-0287.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0287.rst) | current | current | pending owner |
| peps/0241: Which metadata fields say what a package requires, provides and obsoletes? | [peps/pep-0241.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0241.rst) | [peps/pep-0314.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0314.rst), then [peps/pep-0345.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0345.rst), [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) (later in its chain) | current | current, later in its chain (peps/pep-0566.rst) | pending owner |
| peps/0248: What does the Python database API require a driver module to define at module level? | [peps/pep-0248.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0248.rst) | [peps/pep-0249.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0249.rst) | peps/pep-0426.rst | peps/pep-0566.rst | pending owner |
| peps/0291: Which backward compatibility rules apply when changing a standard library module? | [peps/pep-0291.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0291.rst) | [peps/pep-0387.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0387.rst) | current | current | pending owner |
| peps/0314: How does a package's metadata say which Python versions it supports? | [peps/pep-0314.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0314.rst) | [peps/pep-0345.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0345.rst), then [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) (later in its chain) | peps/pep-0808.rst | peps/pep-0808.rst | pending owner |
| peps/0333: How should a WSGI application handle bytes and strings for the response body on Python 3? | [peps/pep-0333.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0333.rst) | [peps/pep-3333.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-3333.rst) | current | current | pending owner |
| peps/0345: How does package metadata declare the markup format of the long description? | [peps/pep-0345.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0345.rst) | [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) | current | current | pending owner |
| peps/0354: How do I define an enumeration type with the standard library? | [peps/pep-0354.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0354.rst) | [peps/pep-0435.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0435.rst) | current | current | pending owner |
| peps/0386: How are pre-release and post-release versions of a Python package numbered and ordered? | [peps/pep-0386.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0386.rst) | [peps/pep-0440.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0440.rst) | current | current | pending owner |
| peps/0409: How does raise ... from None suppress the context of a chained exception, and where is that recorded? | [peps/pep-0409.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0409.rst) | [peps/pep-0415.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0415.rst) | peps/pep-0344.rst | peps/pep-0344.rst | pending owner |
| peps/0426: Which version of the core metadata format should packaging tools write, and can it be expressed as JSON? | [peps/pep-0426.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0426.rst) | [peps/pep-0566.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0566.rst) | peps/pep-0819.rst | peps/pep-0819.rst | pending owner |
| peps/0431: How can I get time zone information from the IANA database in the standard library? | [peps/pep-0431.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0431.rst) | [peps/pep-0615.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0615.rst) | current | current | pending owner |
| peps/0433: Are file descriptors that Python opens inherited by child processes? | [peps/pep-0433.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0433.rst) | [peps/pep-0446.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0446.rst) | current | current | pending owner |
| peps/0438: Can a project on PyPI host its release files on an external site? | [peps/pep-0438.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0438.rst) | [peps/pep-0470.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0470.rst) | old | current | pending owner |
| peps/0501: How can a string literal's interpolations be handed to my own function instead of being formatted right away? | [peps/pep-0501.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0501.rst) | [peps/pep-0750.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0750.rst) | old | current | pending owner |
| peps/0509: Can code rely on the private version tag that dictionaries carry? | [peps/pep-0509.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0509.rst) | [peps/pep-0699.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0699.rst) | current | current | pending owner |
| peps/0513: Which platform tag should a portable Linux wheel carry? | [peps/pep-0513.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0513.rst) | [peps/pep-0600.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0600.rst) | old | current | pending owner |
| peps/0543: How is a TLS client configured with the unified TLS API for Python? | [peps/pep-0543.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0543.rst) | [peps/pep-0748.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0748.rst) | old | current | pending owner |
| peps/0554: How do I create another interpreter and run code in it from the standard library? | [peps/pep-0554.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0554.rst) | [peps/pep-0734.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0734.rst) | peps/pep-0413.rst | peps/pep-0413.rst | pending owner |
| peps/0563: When are function annotations evaluated in Python, and are they kept as strings? | [peps/pep-0563.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0563.rst) | [peps/pep-0649.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0649.rst), [peps/pep-0749.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0749.rst) | peps/pep-0484.rst | peps/pep-0484.rst | pending owner |
| peps/0571: What does the manylinux2010 platform tag mean today? | [peps/pep-0571.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0571.rst) | [peps/pep-0600.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0600.rst) | old | current | pending owner |
| peps/0599: Which glibc version does the manylinux2014 platform tag stand for? | [peps/pep-0599.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0599.rst) | [peps/pep-0600.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0600.rst) | old | current | pending owner |
| peps/0601: Is a return statement that leaves a finally block allowed? | [peps/pep-0601.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0601.rst) | [peps/pep-0765.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0765.rst) | peps/pep-0346.rst | peps/pep-0346.rst | pending owner |
| peps/0622: What is the syntax and behaviour of the match statement? | [peps/pep-0622.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0622.rst) | [peps/pep-0634.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0634.rst) | peps/pep-0642.rst | peps/pep-0642.rst | pending owner |
| peps/0631: How do I list my project's dependencies in pyproject.toml? | [peps/pep-0631.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0631.rst) | [peps/pep-0621.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0621.rst) | peps/pep-0735.rst | peps/pep-0735.rst | pending owner |
| peps/0665: What file format records Python dependencies for reproducible installs? | [peps/pep-0665.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0665.rst) | [peps/pep-0751.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0751.rst) | current | current | pending owner |
| peps/0722: How does a single-file script declare the dependencies it needs, inside the script? | [peps/pep-0722.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0722.rst) | [peps/pep-0723.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-0723.rst) | old | current | pending owner |
| peps/3153: Which standard library module provides an event loop for asynchronous IO? | [peps/pep-3153.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-3153.rst) | [peps/pep-3156.rst](https://github.com/python/peps/blob/1317769c334c658db28aa5336d910f58443049eb/peps/pep-3156.rst) | peps/pep-0492.rst | peps/pep-0492.rst | pending owner |
| keps/2451: What file permissions does a projected service account token file get in a pod? | [keps/sig-storage/2451-service-account-token-volumes/README.md](https://github.com/kubernetes/enhancements/blob/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8/keps/sig-storage/2451-service-account-token-volumes/README.md) | [keps/sig-auth/1205-bound-service-account-tokens/README.md](https://github.com/kubernetes/enhancements/blob/5b503a75369bdfdd494a2c2c72107a41bf6dd1a8/keps/sig-auth/1205-bound-service-account-tokens/README.md) | current | current | pending owner |
| jaeger/rfc-0002: How are the browser's UI tools delivered to the agent sidecar and called by it in Jaeger's AI chat? | [docs/rfc/0002-ai-gateway-contextual-tools.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0002-ai-gateway-contextual-tools.md) | [docs/rfc/0008-ai-gateway-mcp-tool-routing.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0008-ai-gateway-mcp-tool-routing.md) | current | current | pending owner |
| jaeger/rfc-0012: Which address does an external MCP client such as Cursor use to reach Jaeger's MCP tools? | [docs/rfc/0012-mcp-server-extension.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0012-mcp-server-extension.md) | [docs/rfc/0008-ai-gateway-mcp-tool-routing.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/docs/rfc/0008-ai-gateway-mcp-tool-routing.md), [cmd/jaeger/internal/extension/jaegerquery/internal/mcptools/README.md](https://github.com/jaegertracing/jaeger/blob/ca047c72f34cf413c16d1118e19c7419de04bbab/cmd/jaeger/internal/extension/jaegerquery/internal/mcptools/README.md) | current | current | pending owner |

Out of scope here: memory layers (mem0 and others) and a real agent with its own grep are arms of step 3.5 of the plan, each in its own recommended configuration.
