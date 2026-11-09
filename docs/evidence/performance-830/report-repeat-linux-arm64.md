# Performance benchmark report

> Historical schema-4 observation from source
> `7612bedfb663e1802cb1286b665c1ffdb3522948`. The measurement numbers are
> unchanged; the limitations below have been corrected. Stream timing and CPU
> scope predate schema 5 and are not evidence of the corrected measurements.

> This run measures. It carries no threshold and no verdict: nothing here says a
> number is acceptable, and a smaller number is not a pass.

Protocol `application-tabs-scrollback-idle-input-attribution:33193b6b65e8`; metric pss (linux /proc/<pid>/smaps_rollup Pss); machine class `linux-arm64-4cpu-virtualized`; identity `9d4c154fdc0caa15`; PSS is measured on Linux ARM64 by this lane and is the metric this report compares.

Electron 43.8.1, Chromium 150.0.7871.250, Node 24.22.0. Build: main 353be67b3c66, preload 13897f4da936, renderer b3ffdf028faa.

Content 960x640; requested 960x640; pixel ratio 1. Grids: tab-0 118x37@8x16, tab-1 118x35@8x16.011484098939928, tab-2 118x35@8x16.011484098939928, tab-3 118x35@8x16.011484098939928, tab-4 118x35@8x16.011484098939928, tab-5 118x35@8x16.011484098939928.

Repetitions requested 3; renderer garbage collection before sampling: available.

## Data integrity

No integrity issue was found.

## 10000 lines retained

Settings hash da58202e19b3; applied scrollback 10000; 3 repetitions.

Resident memory, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 103.5 MiB | 228.1 MiB | 54.8 MiB |         411.1 MiB |
| three |          1 | 105.7 MiB | 257.8 MiB | 55.7 MiB |         443.9 MiB |
| six   |          1 | 101.6 MiB | 315.4 MiB | 57.4 MiB |         499.1 MiB |
| one   |          2 | 103.6 MiB | 228.9 MiB | 54.5 MiB |         411.7 MiB |
| three |          2 | 105.5 MiB | 252.9 MiB | 55.9 MiB |         439.1 MiB |
| six   |          2 | 101.6 MiB | 283.7 MiB | 57.6 MiB |         467.6 MiB |
| one   |          3 | 103.7 MiB | 223.3 MiB | 54.5 MiB |         406.2 MiB |
| three |          3 | 105.6 MiB | 244.6 MiB | 55.7 MiB |         430.7 MiB |
| six   |          3 | 101.6 MiB | 282.0 MiB | 57.5 MiB |         465.8 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.5 MiB | 230.0 MiB | 54.8 MiB |
| three |          1 | 105.8 MiB | 258.3 MiB | 55.7 MiB |
| six   |          1 | 101.6 MiB | 316.2 MiB | 57.4 MiB |
| one   |          2 | 103.7 MiB | 229.4 MiB | 54.5 MiB |
| three |          2 | 105.7 MiB | 253.4 MiB | 56.0 MiB |
| six   |          2 | 101.6 MiB | 284.3 MiB | 57.6 MiB |
| one   |          3 | 103.8 MiB | 223.6 MiB | 54.5 MiB |
| three |          3 | 105.7 MiB | 246.3 MiB | 55.8 MiB |
| six   |          3 | 101.6 MiB | 284.1 MiB | 57.5 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |    total |
| -------- | ---------: | -------: | -------: | ------: | -------: |
| tabs 1-3 |          1 |  1.1 MiB | 14.8 MiB | 0.5 MiB | 16.4 MiB |
| tabs 3-6 |          1 | -1.4 MiB | 19.2 MiB | 0.6 MiB | 18.4 MiB |
| tabs 1-3 |          2 |  1.0 MiB | 12.0 MiB | 0.7 MiB | 13.7 MiB |
| tabs 3-6 |          2 | -1.3 MiB | 10.3 MiB | 0.6 MiB |  9.5 MiB |
| tabs 1-3 |          3 |  1.0 MiB | 10.7 MiB | 0.6 MiB | 12.2 MiB |
| tabs 3-6 |          3 | -1.3 MiB | 12.5 MiB | 0.6 MiB | 11.7 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12178 ms |        -1.5 MiB |    -2.0 MiB |    0.0 MiB |     -3.5 MiB |       8.84 % |   1.35 % |  2.82 % |    96 |
|          2 | 12128 ms |         4.4 MiB |    -2.2 MiB |    0.0 MiB |      2.2 MiB |       9.23 % |   1.47 % |  3.08 % |    90 |
|          3 | 12185 ms |        -4.2 MiB |    -2.2 MiB |    0.0 MiB |     -6.4 MiB |       7.52 % |   1.23 % |  2.47 % |    96 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | renderer peak | renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ----------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  6031.0 KiB/s |     320.9 MiB |          -0.3 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 15020.3 KiB/s |     320.9 MiB |          -0.3 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B |  9795.0 KiB/s |     320.9 MiB |          -0.3 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2344.9 KiB/s |     334.1 MiB |          24.3 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  7972.9 KiB/s |     334.1 MiB |          24.3 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 11175.0 KiB/s |     334.1 MiB |          24.3 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11595.9 KiB/s |     345.9 MiB |          -3.8 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 14333.4 KiB/s |     345.9 MiB |          -3.8 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B |  9436.4 KiB/s |     345.9 MiB |          -3.8 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 10817.2 KiB/s |     314.0 MiB |           1.1 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 16368.3 KiB/s |     314.0 MiB |           1.1 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 10582.9 KiB/s |     314.0 MiB |           1.1 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2201.4 KiB/s |     341.7 MiB |          14.0 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  8286.5 KiB/s |     341.7 MiB |          14.0 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  7339.2 KiB/s |     341.7 MiB |          14.0 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 10138.0 KiB/s |     346.9 MiB |          28.9 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 16484.6 KiB/s |     346.9 MiB |          28.9 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10034.2 KiB/s |     346.9 MiB |          28.9 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  9181.3 KiB/s |     283.7 MiB |           9.0 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B |  9030.7 KiB/s |     283.7 MiB |           9.0 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B |  8617.1 KiB/s |     283.7 MiB |           9.0 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2108.2 KiB/s |     315.2 MiB |          33.7 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  7578.6 KiB/s |     315.2 MiB |          33.7 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 10730.5 KiB/s |     315.2 MiB |          33.7 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11463.1 KiB/s |     332.0 MiB |           1.8 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 15613.9 KiB/s |     332.0 MiB |           1.8 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B |  9918.7 KiB/s |     332.0 MiB |           1.8 MiB |

Synthetic keydown to observed grid change (main-process parse, not presentation):

| repetition | raw median | observer-corrected median |         min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ----------------: | -------: | -------------------------------: |
|          1 |    22.0 ms |                   14.4 ms |  8.5 ms / 32.5 ms |        0 |                         494.0 ms |
|          2 |    17.7 ms |                    8.1 ms |  9.1 ms / 32.8 ms |        0 |                         470.7 ms |
|          3 |    28.9 ms |                   18.2 ms | 15.7 ms / 32.8 ms |        0 |                         490.6 ms |

## 0 lines retained

Settings hash 367ed2cb3373; applied scrollback 0; 3 repetitions.

Resident memory, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 103.7 MiB | 212.5 MiB | 54.7 MiB |         395.9 MiB |
| three |          1 | 105.3 MiB | 222.9 MiB | 55.5 MiB |         408.5 MiB |
| six   |          1 | 102.1 MiB | 225.2 MiB | 57.1 MiB |         409.2 MiB |
| one   |          2 | 104.1 MiB | 214.5 MiB | 54.6 MiB |         398.1 MiB |
| three |          2 | 105.7 MiB | 221.9 MiB | 55.4 MiB |         407.9 MiB |
| six   |          2 | 102.6 MiB | 226.0 MiB | 57.2 MiB |         410.5 MiB |
| one   |          3 | 103.8 MiB | 207.1 MiB | 54.7 MiB |         390.3 MiB |
| three |          3 | 105.1 MiB | 211.7 MiB | 56.0 MiB |         397.6 MiB |
| six   |          3 | 102.0 MiB | 217.5 MiB | 57.6 MiB |         401.8 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.9 MiB | 215.8 MiB | 54.8 MiB |
| three |          1 | 105.3 MiB | 223.2 MiB | 55.6 MiB |
| six   |          1 | 102.2 MiB | 227.6 MiB | 57.1 MiB |
| one   |          2 | 104.2 MiB | 216.8 MiB | 54.7 MiB |
| three |          2 | 105.8 MiB | 222.4 MiB | 55.4 MiB |
| six   |          2 | 102.7 MiB | 227.7 MiB | 57.2 MiB |
| one   |          3 | 103.8 MiB | 207.4 MiB | 54.7 MiB |
| three |          3 | 105.2 MiB | 212.2 MiB | 56.0 MiB |
| six   |          3 | 102.0 MiB | 218.3 MiB | 57.6 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |   total |
| -------- | ---------: | -------: | -------: | ------: | ------: |
| tabs 1-3 |          1 |  0.8 MiB |  5.2 MiB | 0.4 MiB | 6.3 MiB |
| tabs 3-6 |          1 | -1.1 MiB |  0.8 MiB | 0.5 MiB | 0.2 MiB |
| tabs 1-3 |          2 |  0.8 MiB |  3.7 MiB | 0.4 MiB | 4.9 MiB |
| tabs 3-6 |          2 | -1.0 MiB |  1.3 MiB | 0.6 MiB | 0.9 MiB |
| tabs 1-3 |          3 |  0.7 MiB |  2.3 MiB | 0.6 MiB | 3.7 MiB |
| tabs 3-6 |          3 | -1.1 MiB |  1.9 MiB | 0.5 MiB | 1.4 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12173 ms |         0.3 MiB |    -2.6 MiB |    0.0 MiB |     -2.3 MiB |       7.87 % |   1.11 % |  2.83 % |    93 |
|          2 | 12216 ms |        -3.3 MiB |    -3.4 MiB |    0.0 MiB |     -6.6 MiB |       8.96 % |   1.11 % |  2.70 % |    93 |
|          3 | 12172 ms |         1.2 MiB |    -2.4 MiB |    0.0 MiB |     -1.1 MiB |       7.27 % |   1.23 % |  2.71 % |    93 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | renderer peak | renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ----------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 10820.1 KiB/s |     229.0 MiB |          -2.1 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 18369.9 KiB/s |     229.0 MiB |          -2.1 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 10917.5 KiB/s |     229.0 MiB |          -2.1 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2602.7 KiB/s |     245.5 MiB |          40.7 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 12198.4 KiB/s |     245.5 MiB |          40.7 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  9766.1 KiB/s |     245.5 MiB |          40.7 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11061.1 KiB/s |     271.0 MiB |           8.8 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 11823.8 KiB/s |     271.0 MiB |           8.8 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10792.3 KiB/s |     271.0 MiB |           8.8 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 12366.7 KiB/s |     228.4 MiB |           0.6 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 12529.3 KiB/s |     228.4 MiB |           0.6 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B |  5899.2 KiB/s |     228.4 MiB |           0.6 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2174.8 KiB/s |     252.3 MiB |          38.4 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  7970.0 KiB/s |     252.3 MiB |          38.4 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 10688.5 KiB/s |     252.3 MiB |          38.4 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 14844.5 KiB/s |     275.8 MiB |          12.7 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 10937.5 KiB/s |     275.8 MiB |          12.7 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10517.6 KiB/s |     275.8 MiB |          12.7 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 11250.9 KiB/s |     224.4 MiB |           7.6 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 11607.3 KiB/s |     224.4 MiB |           7.6 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 11646.3 KiB/s |     224.4 MiB |           7.6 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2225.8 KiB/s |     254.0 MiB |          32.1 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  8882.3 KiB/s |     254.0 MiB |          32.1 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 11313.0 KiB/s |     254.0 MiB |          32.1 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11933.5 KiB/s |     271.8 MiB |           3.9 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 11584.6 KiB/s |     271.8 MiB |           3.9 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 11260.2 KiB/s |     271.8 MiB |           3.9 MiB |

Synthetic keydown to observed grid change (main-process parse, not presentation):

| repetition | raw median | observer-corrected median |        min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ---------------: | -------: | -------------------------------: |
|          1 |    15.1 ms |                   15.0 ms | 6.5 ms / 26.3 ms |        0 |                         512.5 ms |
|          2 |    12.9 ms |                   12.9 ms | 9.9 ms / 20.6 ms |        0 |                         518.2 ms |
|          3 |    22.2 ms |                   22.0 ms | 7.1 ms / 25.2 ms |        0 |                         499.0 ms |

## Scrollback pair

Six tabs with 0 lines against 10000 lines, per repetition, per role:

| repetition |     main | renderer |      GPU |
| ---------: | -------: | -------: | -------: |
|          1 | -0.5 MiB | 90.2 MiB |  0.3 MiB |
|          2 | -1.0 MiB | 57.7 MiB |  0.4 MiB |
|          3 | -0.4 MiB | 64.5 MiB | -0.1 MiB |

## Extension runtime

Single observation of the application-owned extension runtime:

|  window | processes |   steady |   growth |    CPU | settled |
| ------: | --------: | -------: | -------: | -----: | ------- |
| 5589 ms |         1 | 46.7 MiB | -0.0 MiB | 0.00 % | yes     |

## Comparison with the recorded baseline

Baseline recorded 2026-11-09T10:20:36.244Z from 7612bedfb663. Medians are taken across each side's repetitions. Candidate observations are in report.json; reference observations are in the recorded baseline file, retained separately. The delta is descriptive: no limit is applied and no verdict follows.

| family                           | scenario                              |       candidate median |        baseline median |    delta |
| -------------------------------- | ------------------------------------- | ---------------------: | ---------------------: | -------: |
| step steady                      | 10000 lines / one / main              |     103.6 MiB (3 reps) |     103.9 MiB (3 reps) |   -0.3 % |
| step peak                        | 10000 lines / one / main              |     103.7 MiB (3 reps) |     103.9 MiB (3 reps) |   -0.3 % |
| step steady                      | 10000 lines / one / renderer          |     228.1 MiB (3 reps) |     225.4 MiB (3 reps) |   +1.2 % |
| step peak                        | 10000 lines / one / renderer          |     229.4 MiB (3 reps) |     229.5 MiB (3 reps) |   -0.0 % |
| step steady                      | 10000 lines / one / gpu               |      54.5 MiB (3 reps) |      54.4 MiB (3 reps) |   +0.3 % |
| step peak                        | 10000 lines / one / gpu               |      54.5 MiB (3 reps) |      54.4 MiB (3 reps) |   +0.3 % |
| step total                       | 10000 lines / one                     |     411.1 MiB (3 reps) |     408.7 MiB (3 reps) |   +0.6 % |
| step steady                      | 10000 lines / three / main            |     105.6 MiB (3 reps) |     106.0 MiB (3 reps) |   -0.4 % |
| step peak                        | 10000 lines / three / main            |     105.7 MiB (3 reps) |     106.1 MiB (3 reps) |   -0.4 % |
| step steady                      | 10000 lines / three / renderer        |     252.9 MiB (3 reps) |     253.4 MiB (3 reps) |   -0.2 % |
| step peak                        | 10000 lines / three / renderer        |     253.4 MiB (3 reps) |     253.7 MiB (3 reps) |   -0.1 % |
| step steady                      | 10000 lines / three / gpu             |      55.7 MiB (3 reps) |      55.8 MiB (3 reps) |   -0.1 % |
| step peak                        | 10000 lines / three / gpu             |      55.8 MiB (3 reps) |      55.9 MiB (3 reps) |   -0.3 % |
| step total                       | 10000 lines / three                   |     439.1 MiB (3 reps) |     439.4 MiB (3 reps) |   -0.1 % |
| step steady                      | 10000 lines / six / main              |     101.6 MiB (3 reps) |     102.2 MiB (3 reps) |   -0.6 % |
| step peak                        | 10000 lines / six / main              |     101.6 MiB (3 reps) |     102.2 MiB (3 reps) |   -0.5 % |
| step steady                      | 10000 lines / six / renderer          |     283.7 MiB (3 reps) |     284.7 MiB (3 reps) |   -0.4 % |
| step peak                        | 10000 lines / six / renderer          |     284.3 MiB (3 reps) |     285.4 MiB (3 reps) |   -0.4 % |
| step steady                      | 10000 lines / six / gpu               |      57.5 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.2 % |
| step peak                        | 10000 lines / six / gpu               |      57.5 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.3 % |
| step total                       | 10000 lines / six                     |     467.6 MiB (3 reps) |     469.2 MiB (3 reps) |   -0.3 % |
| per-tab marginal                 | 10000 lines / oneToThree / main       |       1.0 MiB (3 reps) |       1.1 MiB (3 reps) |   -6.7 % |
| per-tab marginal                 | 10000 lines / oneToThree / renderer   |      12.0 MiB (3 reps) |      13.4 MiB (3 reps) |  -10.2 % |
| per-tab marginal                 | 10000 lines / oneToThree / gpu        |       0.6 MiB (3 reps) |       0.7 MiB (3 reps) |  -11.3 % |
| per-tab marginal total           | 10000 lines / oneToThree              |      13.7 MiB (3 reps) |      15.3 MiB (3 reps) |  -10.2 % |
| per-tab marginal                 | 10000 lines / threeToSix / main       |      -1.3 MiB (3 reps) |      -1.3 MiB (3 reps) |   +4.2 % |
| per-tab marginal                 | 10000 lines / threeToSix / renderer   |      12.5 MiB (3 reps) |      10.4 MiB (3 reps) |  +19.5 % |
| per-tab marginal                 | 10000 lines / threeToSix / gpu        |       0.6 MiB (3 reps) |       0.5 MiB (3 reps) |   +7.2 % |
| per-tab marginal total           | 10000 lines / threeToSix              |      11.7 MiB (3 reps) |       9.9 MiB (3 reps) |  +17.8 % |
| idle growth                      | 10000 lines / main                    |      -2.2 MiB (3 reps) |      -2.5 MiB (3 reps) |  -11.2 % |
| idle growth                      | 10000 lines / renderer                |      -1.5 MiB (3 reps) |      -0.4 MiB (3 reps) | +259.4 % |
| idle growth                      | 10000 lines / gpu                     |       0.0 MiB (3 reps) |       0.0 MiB (3 reps) |  +25.0 % |
| idle growth total                | 10000 lines                           |      -3.5 MiB (3 reps) |      -3.0 MiB (3 reps) |  +13.5 % |
| idle CPU                         | 10000 lines / main                    |        1.35 % (3 reps) |        1.23 % (3 reps) |   +9.5 % |
| idle CPU                         | 10000 lines / renderer                |        8.84 % (3 reps) |        7.79 % (3 reps) |  +13.4 % |
| idle CPU                         | 10000 lines / gpu                     |        2.82 % (3 reps) |        2.84 % (3 reps) |   -0.5 % |
| idle CPU total                   | 10000 lines                           |       13.01 % (3 reps) |       12.29 % (3 reps) |   +5.8 % |
| stream rate                      | 10000 lines / ascii                   |  9795.0 KiB/s (3 reps) | 10874.1 KiB/s (3 reps) |   -9.9 % |
| stream peak                      | 10000 lines / ascii / main            |     101.7 MiB (3 reps) |     101.8 MiB (3 reps) |   -0.1 % |
| stream retained                  | 10000 lines / ascii / main            |      -1.2 MiB (3 reps) |      -0.4 MiB (3 reps) | +193.5 % |
| stream peak                      | 10000 lines / ascii / renderer        |     314.0 MiB (3 reps) |     285.7 MiB (3 reps) |   +9.9 % |
| stream retained                  | 10000 lines / ascii / renderer        |       1.1 MiB (3 reps) |       9.8 MiB (3 reps) |  -88.3 % |
| stream peak                      | 10000 lines / ascii / gpu             |      57.7 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.5 % |
| stream retained                  | 10000 lines / ascii / gpu             |      -0.8 MiB (3 reps) |      -0.5 MiB (3 reps) |  +54.1 % |
| stream rate                      | 10000 lines / variety                 |  7578.6 KiB/s (3 reps) |  8898.2 KiB/s (3 reps) |  -14.8 % |
| stream peak                      | 10000 lines / variety / main          |     110.5 MiB (3 reps) |     111.0 MiB (3 reps) |   -0.4 % |
| stream retained                  | 10000 lines / variety / main          |       8.9 MiB (3 reps) |       8.9 MiB (3 reps) |   -0.4 % |
| stream peak                      | 10000 lines / variety / renderer      |     334.1 MiB (3 reps) |     307.5 MiB (3 reps) |   +8.6 % |
| stream retained                  | 10000 lines / variety / renderer      |      24.3 MiB (3 reps) |      32.5 MiB (3 reps) |  -25.4 % |
| stream peak                      | 10000 lines / variety / gpu           |      56.9 MiB (3 reps) |      56.9 MiB (3 reps) |   +0.0 % |
| stream retained                  | 10000 lines / variety / gpu           |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |  -52.9 % |
| stream rate                      | 10000 lines / deep-history            | 11463.1 KiB/s (3 reps) | 11010.4 KiB/s (3 reps) |   +4.1 % |
| stream peak                      | 10000 lines / deep-history / main     |     110.3 MiB (3 reps) |     110.8 MiB (3 reps) |   -0.4 % |
| stream retained                  | 10000 lines / deep-history / main     |      -0.5 MiB (3 reps) |      -0.5 MiB (3 reps) |   +2.4 % |
| stream peak                      | 10000 lines / deep-history / renderer |     345.9 MiB (3 reps) |     332.3 MiB (3 reps) |   +4.1 % |
| stream retained                  | 10000 lines / deep-history / renderer |       1.8 MiB (3 reps) |       3.0 MiB (3 reps) |  -41.2 % |
| stream peak                      | 10000 lines / deep-history / gpu      |      56.9 MiB (3 reps) |      56.9 MiB (3 reps) |   +0.1 % |
| stream retained                  | 10000 lines / deep-history / gpu      |       0.0 MiB (3 reps) |      -0.0 MiB (3 reps) | -140.0 % |
| input latency raw                | 10000 lines                           |       22.0 ms (3 reps) |       22.8 ms (3 reps) |   -3.5 % |
| input latency corrected          | 10000 lines                           |       14.4 ms (3 reps) |       14.2 ms (3 reps) |   +1.4 % |
| grid change to next counted draw | 10000 lines                           |      490.6 ms (3 reps) |      491.4 ms (3 reps) |   -0.2 % |
| step steady                      | 0 lines / one / main                  |     103.8 MiB (3 reps) |     103.6 MiB (3 reps) |   +0.2 % |
| step peak                        | 0 lines / one / main                  |     103.9 MiB (3 reps) |     103.6 MiB (3 reps) |   +0.2 % |
| step steady                      | 0 lines / one / renderer              |     212.5 MiB (3 reps) |     208.0 MiB (3 reps) |   +2.2 % |
| step peak                        | 0 lines / one / renderer              |     215.8 MiB (3 reps) |     208.4 MiB (3 reps) |   +3.6 % |
| step steady                      | 0 lines / one / gpu                   |      54.7 MiB (3 reps) |      54.6 MiB (3 reps) |   +0.1 % |
| step peak                        | 0 lines / one / gpu                   |      54.7 MiB (3 reps) |      54.7 MiB (3 reps) |   +0.2 % |
| step total                       | 0 lines / one                         |     395.9 MiB (3 reps) |     390.9 MiB (3 reps) |   +1.3 % |
| step steady                      | 0 lines / three / main                |     105.3 MiB (3 reps) |     105.6 MiB (3 reps) |   -0.3 % |
| step peak                        | 0 lines / three / main                |     105.3 MiB (3 reps) |     105.8 MiB (3 reps) |   -0.4 % |
| step steady                      | 0 lines / three / renderer            |     221.9 MiB (3 reps) |     213.8 MiB (3 reps) |   +3.8 % |
| step peak                        | 0 lines / three / renderer            |     222.4 MiB (3 reps) |     214.0 MiB (3 reps) |   +3.9 % |
| step steady                      | 0 lines / three / gpu                 |      55.5 MiB (3 reps) |      55.6 MiB (3 reps) |   -0.1 % |
| step peak                        | 0 lines / three / gpu                 |      55.6 MiB (3 reps) |      55.6 MiB (3 reps) |   +0.1 % |
| step total                       | 0 lines / three                       |     407.9 MiB (3 reps) |     400.0 MiB (3 reps) |   +2.0 % |
| step steady                      | 0 lines / six / main                  |     102.1 MiB (3 reps) |     101.9 MiB (3 reps) |   +0.2 % |
| step peak                        | 0 lines / six / main                  |     102.2 MiB (3 reps) |     102.0 MiB (3 reps) |   +0.2 % |
| step steady                      | 0 lines / six / renderer              |     225.2 MiB (3 reps) |     218.3 MiB (3 reps) |   +3.2 % |
| step peak                        | 0 lines / six / renderer              |     227.6 MiB (3 reps) |     219.5 MiB (3 reps) |   +3.7 % |
| step steady                      | 0 lines / six / gpu                   |      57.2 MiB (3 reps) |      57.2 MiB (3 reps) |   -0.0 % |
| step peak                        | 0 lines / six / gpu                   |      57.2 MiB (3 reps) |      57.3 MiB (3 reps) |   -0.2 % |
| step total                       | 0 lines / six                         |     409.2 MiB (3 reps) |     402.2 MiB (3 reps) |   +1.7 % |
| per-tab marginal                 | 0 lines / oneToThree / main           |       0.8 MiB (3 reps) |       1.1 MiB (3 reps) |  -28.3 % |
| per-tab marginal                 | 0 lines / oneToThree / renderer       |       3.7 MiB (3 reps) |       2.9 MiB (3 reps) |  +29.2 % |
| per-tab marginal                 | 0 lines / oneToThree / gpu            |       0.4 MiB (3 reps) |       0.6 MiB (3 reps) |  -32.6 % |
| per-tab marginal total           | 0 lines / oneToThree                  |       4.9 MiB (3 reps) |       4.5 MiB (3 reps) |   +9.0 % |
| per-tab marginal                 | 0 lines / threeToSix / main           |      -1.1 MiB (3 reps) |      -1.3 MiB (3 reps) |  -17.7 % |
| per-tab marginal                 | 0 lines / threeToSix / renderer       |       1.3 MiB (3 reps) |       2.0 MiB (3 reps) |  -32.6 % |
| per-tab marginal                 | 0 lines / threeToSix / gpu            |       0.5 MiB (3 reps) |       0.5 MiB (3 reps) |   +7.2 % |
| per-tab marginal total           | 0 lines / threeToSix                  |       0.9 MiB (3 reps) |       1.6 MiB (3 reps) |  -45.4 % |
| idle growth                      | 0 lines / main                        |      -2.6 MiB (3 reps) |      -2.4 MiB (3 reps) |   +6.1 % |
| idle growth                      | 0 lines / renderer                    |       0.3 MiB (3 reps) |       1.1 MiB (3 reps) |  -75.0 % |
| idle growth                      | 0 lines / gpu                         |       0.0 MiB (3 reps) |       0.0 MiB (3 reps) |  +66.7 % |
| idle growth total                | 0 lines                               |      -2.3 MiB (3 reps) |      -1.3 MiB (3 reps) |  +79.8 % |
| idle CPU                         | 0 lines / main                        |        1.11 % (3 reps) |        1.23 % (3 reps) |   -9.8 % |
| idle CPU                         | 0 lines / renderer                    |        7.87 % (3 reps) |        7.74 % (3 reps) |   +1.8 % |
| idle CPU                         | 0 lines / gpu                         |        2.71 % (3 reps) |        2.83 % (3 reps) |   -4.4 % |
| idle CPU total                   | 0 lines                               |       11.81 % (3 reps) |       11.68 % (3 reps) |   +1.2 % |
| stream rate                      | 0 lines / ascii                       | 11607.3 KiB/s (3 reps) | 11052.4 KiB/s (3 reps) |   +5.0 % |
| stream peak                      | 0 lines / ascii / main                |     102.0 MiB (3 reps) |     101.8 MiB (3 reps) |   +0.1 % |
| stream retained                  | 0 lines / ascii / main                |      -0.1 MiB (3 reps) |      -1.3 MiB (3 reps) |  -89.0 % |
| stream peak                      | 0 lines / ascii / renderer            |     228.4 MiB (3 reps) |     224.8 MiB (3 reps) |   +1.6 % |
| stream retained                  | 0 lines / ascii / renderer            |       0.6 MiB (3 reps) |       0.1 MiB (3 reps) | +305.3 % |
| stream peak                      | 0 lines / ascii / gpu                 |      57.5 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.2 % |
| stream retained                  | 0 lines / ascii / gpu                 |      -0.7 MiB (3 reps) |      -0.5 MiB (3 reps) |  +41.3 % |
| stream rate                      | 0 lines / variety                     |  8882.3 KiB/s (3 reps) |  9823.1 KiB/s (3 reps) |   -9.6 % |
| stream peak                      | 0 lines / variety / main              |     110.7 MiB (3 reps) |     110.5 MiB (3 reps) |   +0.2 % |
| stream retained                  | 0 lines / variety / main              |       8.7 MiB (3 reps) |       9.1 MiB (3 reps) |   -4.7 % |
| stream peak                      | 0 lines / variety / renderer          |     252.3 MiB (3 reps) |     246.2 MiB (3 reps) |   +2.5 % |
| stream retained                  | 0 lines / variety / renderer          |      38.4 MiB (3 reps) |      35.4 MiB (3 reps) |   +8.7 % |
| stream peak                      | 0 lines / variety / gpu               |      56.8 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.1 % |
| stream retained                  | 0 lines / variety / gpu               |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |   +0.0 % |
| stream rate                      | 0 lines / deep-history                | 11061.1 KiB/s (3 reps) | 12306.9 KiB/s (3 reps) |  -10.1 % |
| stream peak                      | 0 lines / deep-history / main         |     110.8 MiB (3 reps) |     110.7 MiB (3 reps) |   +0.1 % |
| stream retained                  | 0 lines / deep-history / main         |      -0.2 MiB (3 reps) |      -0.5 MiB (3 reps) |  -48.9 % |
| stream peak                      | 0 lines / deep-history / renderer     |     271.8 MiB (3 reps) |     269.9 MiB (3 reps) |   +0.7 % |
| stream retained                  | 0 lines / deep-history / renderer     |       8.8 MiB (3 reps) |       5.0 MiB (3 reps) |  +74.7 % |
| stream peak                      | 0 lines / deep-history / gpu          |      56.8 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.1 % |
| stream retained                  | 0 lines / deep-history / gpu          |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |  -37.5 % |
| input latency raw                | 0 lines                               |       15.1 ms (3 reps) |       16.6 ms (3 reps) |   -9.0 % |
| input latency corrected          | 0 lines                               |       15.0 ms (3 reps) |       16.6 ms (3 reps) |   -9.6 % |
| grid change to next counted draw | 0 lines                               |      512.5 ms (3 reps) |      514.6 ms (3 reps) |   -0.4 % |
| scrollback pair delta            | 0 vs 10000 lines / main               |      -0.5 MiB (3 reps) |       0.4 MiB (3 reps) | -232.2 % |
| scrollback pair delta            | 0 vs 10000 lines / renderer           |      64.5 MiB (3 reps) |      66.5 MiB (3 reps) |   -3.0 % |
| scrollback pair delta            | 0 vs 10000 lines / gpu                |       0.3 MiB (3 reps) |       0.2 MiB (3 reps) |  +25.0 % |
| extension runtime steady         | bootstrap                             |      46.7 MiB (1 reps) |      46.8 MiB (1 reps) |   -0.1 % |
| extension runtime growth         | bootstrap                             |      -0.0 MiB (1 reps) |      -0.0 MiB (1 reps) |   +0.0 % |
| extension runtime CPU            | bootstrap                             |        0.00 % (1 reps) |        0.00 % (1 reps) |        - |

## What this does not prove

- This report measures; it does not decide whether a number is acceptable. There is no threshold, no pass and no fail.
- Run-to-run variation and cold versus warm streams limit interpretation; printed repetitions are descriptive, not an uncertainty bound.
- A uniform per-tab leak is not identified as a leak by this report; no allocation-shape verdict is computed.
- The idle window is about 12 s; slower growth may not be observable in that interval.
- Input latency is synthetic keydown to observed renderer grid change. Presentation latency is not measured; the grid-change-to-next-draw figure is a repaint counter, not latency.
- Process memory is the platform metric named at the top: PSS on Linux, phys_footprint on macOS, private bytes on Windows. Those quantities are not interchangeable and only a baseline recorded with the same metric is printed beside the candidate.
- The extension-runtime window is a single observation, not a repeated measurement.
- Only linux-arm64 has a recorded baseline in this repository. Every other profile reports and has nothing to compare against.
- The workload is a fixed script: ten thousand retained lines per tab, three tab steps, three streams of 328,000 bytes, a 12 s idle window and seven keystrokes. Regressions outside those exercises are invisible.
- This historical comparison checked machine class but not the recorded machine-identity digest. Schema 5 additionally requires matching identity.
