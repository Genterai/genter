| Arm | Success, hidden (n) | Success, changed-direct | Success, control | Points met, hidden | Stale-fact errors | Relevant item shown, hidden | Used when shown, hidden | Added items / run | Of them relevant | Added chars / run | Tool calls / run | $ / run |
|--|--|--|--|--|--|--|--|--|--|--|--|--|
| base | 15% (20) | 75% | 83% | 15% | 38% | 60% | 25% | 0.0 | — | 0 | 2.7 | 0.0007 |
| diligent | 30% (20) | 50% | 83% | 30% | 38% | 50% | 60% | 0.0 | — | 0 | 2.9 | 0.0008 |
| search | 15% (20) | 75% | 100% | 20% | 38% | 60% | 25% | 0.0 | — | 0 | 2.1 | 0.0007 |
| inject-query | 50% (20) | 100% | 100% | 50% | 13% | 85% | 59% | 2.9 | 10% | 566 | 1.9 | 0.0007 |
| inject-task | 30% (20) | 75% | 83% | 40% | 38% | 80% | 38% | 2.7 | 10% | 567 | 1.7 | 0.0007 |
| inject-global | — (0) | 100% | — | — | 0% | — | — | 4.0 | 0% | 611 | 1.0 | 0.0003 |

Success by kind of missing context:

| Arm | changed-direct | changed-constraint | entity-state | static-policy | new-situation | control |
|--|--|--|--|--|--|--|
| base | 75% | 0% | 20% | 0% | 50% | 83% |
| diligent | 50% | 20% | 60% | 0% | 50% | 83% |
| search | 75% | 20% | 20% | 17% | 0% | 100% |
| inject-query | 100% | 60% | 40% | 50% | 50% | 100% |
| inject-task | 75% | 0% | 40% | 50% | 25% | 83% |
| inject-global | 100% | — | — | — | — | — |

Where hidden-context tasks fail (share of failed runs):

| Arm | Failed runs | Never shown the item | Shown, not used | Stale fact stated |
|--|--|--|--|--|
| base | 17 | 47% | 47% | 18% |
| diligent | 14 | 71% | 21% | 14% |
| search | 17 | 47% | 47% | 12% |
| inject-query | 10 | 30% | 70% | 10% |
| inject-task | 14 | 29% | 64% | 14% |
| inject-global | 0 | — | — | — |

Per task, successes out of runs:

| Task | Kind | base | diligent | search | inject-query | inject-task | inject-global |
|--|--|--|--|--|--|--|--|
| T01 | changed-direct | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| T02 | changed-direct | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| T03 | changed-direct | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 1/1 |
| T04 | changed-direct | 1/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T05 | changed-constraint | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T06 | changed-constraint | 0/1 | 1/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T07 | changed-constraint | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/0 |
| T08 | changed-constraint | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T09 | changed-constraint | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T10 | entity-state | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T11 | entity-state | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T12 | entity-state | 0/1 | 1/1 | 0/1 | 0/1 | 1/1 | 0/0 |
| T13 | entity-state | 0/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T14 | entity-state | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T15 | static-policy | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T16 | static-policy | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T17 | static-policy | 0/1 | 0/1 | 0/1 | 1/1 | 1/1 | 0/0 |
| T18 | static-policy | 0/1 | 0/1 | 0/1 | 0/1 | 1/1 | 0/0 |
| T19 | static-policy | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T20 | static-policy | 0/1 | 0/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T21 | new-situation | 0/1 | 0/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T22 | new-situation | 0/1 | 0/1 | 0/1 | 1/1 | 0/1 | 0/0 |
| T23 | new-situation | 1/1 | 1/1 | 0/1 | 1/1 | 1/1 | 0/0 |
| T24 | new-situation | 1/1 | 1/1 | 0/1 | 0/1 | 0/1 | 0/0 |
| T25 | control | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T26 | control | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T27 | control | 0/1 | 0/1 | 1/1 | 1/1 | 0/1 | 0/0 |
| T28 | control | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T29 | control | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |
| T30 | control | 1/1 | 1/1 | 1/1 | 1/1 | 1/1 | 0/0 |

Harm: runs that failed where the same task succeeded in every run of `search`:

- base: 4 of 12
- diligent: 4 of 12
- search: 0 of 12
- inject-query: 0 of 12
- inject-task: 2 of 12
- inject-global: 0 of 3

Use of Genter by the agent:

- search: genter_search in 97% of runs; 30 calls, 97% with a goal
- inject-query: genter_search in 100% of runs; 31 calls, 100% with a goal
- inject-task: genter_search in 100% of runs; 30 calls, 100% with a goal
- inject-global: genter_search in 100% of runs; 3 calls, 100% with a goal

Against `search`, paired by task (hidden-context tasks): difference in success, 95% bootstrap interval over tasks

- base: +0 points [-20, 20] over 20 tasks
- diligent: +15 points [-10, 40] over 20 tasks
- inject-query: +35 points [15, 55] over 20 tasks
- inject-task: +15 points [-5, 35] over 20 tasks
