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
| one   |          1 | 103.5 MiB | 231.8 MiB | 54.6 MiB |         414.7 MiB |
| three |          1 | 105.7 MiB | 258.0 MiB | 55.4 MiB |         443.9 MiB |
| six   |          1 | 102.0 MiB | 282.0 MiB | 57.6 MiB |         466.3 MiB |
| one   |          2 | 103.7 MiB | 226.3 MiB | 54.6 MiB |         409.4 MiB |
| three |          2 | 106.2 MiB | 253.6 MiB | 55.6 MiB |         440.3 MiB |
| six   |          2 | 102.2 MiB | 286.1 MiB | 57.4 MiB |         470.5 MiB |
| one   |          3 | 104.2 MiB | 226.8 MiB | 54.3 MiB |         410.1 MiB |
| three |          3 | 106.2 MiB | 251.8 MiB | 55.6 MiB |         438.5 MiB |
| six   |          3 | 102.1 MiB | 285.4 MiB | 57.2 MiB |         469.5 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.6 MiB | 232.1 MiB | 54.7 MiB |
| three |          1 | 105.8 MiB | 258.2 MiB | 55.4 MiB |
| six   |          1 | 102.0 MiB | 283.6 MiB | 57.6 MiB |
| one   |          2 | 103.7 MiB | 230.3 MiB | 54.7 MiB |
| three |          2 | 106.4 MiB | 253.9 MiB | 55.6 MiB |
| six   |          2 | 102.2 MiB | 286.4 MiB | 57.4 MiB |
| one   |          3 | 104.3 MiB | 230.2 MiB | 54.3 MiB |
| three |          3 | 106.4 MiB | 252.0 MiB | 55.6 MiB |
| six   |          3 | 102.2 MiB | 285.7 MiB | 57.2 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |    total |
| -------- | ---------: | -------: | -------: | ------: | -------: |
| tabs 1-3 |          1 |  1.1 MiB | 13.1 MiB | 0.4 MiB | 14.6 MiB |
| tabs 3-6 |          1 | -1.3 MiB |  8.0 MiB | 0.7 MiB |  7.5 MiB |
| tabs 1-3 |          2 |  1.3 MiB | 13.7 MiB | 0.5 MiB | 15.5 MiB |
| tabs 3-6 |          2 | -1.3 MiB | 10.8 MiB | 0.6 MiB | 10.1 MiB |
| tabs 1-3 |          3 |  1.0 MiB | 12.5 MiB | 0.6 MiB | 14.2 MiB |
| tabs 3-6 |          3 | -1.4 MiB | 11.2 MiB | 0.5 MiB | 10.3 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12154 ms |         0.2 MiB |    -2.7 MiB |    0.0 MiB |     -2.5 MiB |       7.88 % |   1.23 % |  2.59 % |    90 |
|          2 | 12153 ms |        -3.4 MiB |    -2.9 MiB |    0.0 MiB |     -6.3 MiB |       7.87 % |   1.11 % |  2.47 % |    90 |
|          3 | 12162 ms |         0.0 MiB |    -2.8 MiB |    0.0 MiB |     -2.7 MiB |       8.73 % |   1.35 % |  3.07 % |    93 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | renderer peak | renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ----------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  9428.5 KiB/s |     288.1 MiB |          -0.8 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 11463.5 KiB/s |     288.1 MiB |          -0.8 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 10376.0 KiB/s |     288.1 MiB |          -0.8 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2455.4 KiB/s |     304.0 MiB |          34.2 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  9708.5 KiB/s |     304.0 MiB |          34.2 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  9042.1 KiB/s |     304.0 MiB |          34.2 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11103.2 KiB/s |     328.2 MiB |           6.0 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 15641.9 KiB/s |     328.2 MiB |           6.0 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B |  6197.7 KiB/s |     328.2 MiB |           6.0 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  8258.3 KiB/s |     289.8 MiB |          -0.7 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 10703.9 KiB/s |     289.8 MiB |          -0.7 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 10340.3 KiB/s |     289.8 MiB |          -0.7 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2439.4 KiB/s |     304.1 MiB |          28.3 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 10204.3 KiB/s |     304.1 MiB |          28.3 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  9372.4 KiB/s |     304.1 MiB |          28.3 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 10855.4 KiB/s |     323.8 MiB |          11.1 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B |  9111.4 KiB/s |     323.8 MiB |          11.1 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 13892.1 KiB/s |     323.8 MiB |          11.1 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  9451.1 KiB/s |     284.9 MiB |          -2.6 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 15797.3 KiB/s |     284.9 MiB |          -2.6 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B |  9761.4 KiB/s |     284.9 MiB |          -2.6 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2341.5 KiB/s |     315.8 MiB |          37.0 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  8431.8 KiB/s |     315.8 MiB |          37.0 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  7852.8 KiB/s |     315.8 MiB |          37.0 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B |  5833.6 KiB/s |     324.3 MiB |           4.9 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 11675.6 KiB/s |     324.3 MiB |           4.9 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10747.8 KiB/s |     324.3 MiB |           4.9 MiB |

Synthetic keydown to observed grid change (main-process parse, not presentation):

| repetition | raw median | observer-corrected median |         min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ----------------: | -------: | -------------------------------: |
|          1 |    27.5 ms |                   17.6 ms | 10.4 ms / 31.3 ms |        0 |                         498.9 ms |
|          2 |    22.5 ms |                   17.0 ms | 13.3 ms / 31.6 ms |        0 |                         491.1 ms |
|          3 |    27.3 ms |                   15.4 ms | 10.1 ms / 33.8 ms |        0 |                         478.8 ms |

## 0 lines retained

Settings hash 367ed2cb3373; applied scrollback 0; 3 repetitions.

Resident memory, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 103.9 MiB | 216.0 MiB | 54.4 MiB |         398.9 MiB |
| three |          1 | 105.1 MiB | 226.4 MiB | 55.9 MiB |         412.1 MiB |
| six   |          1 | 102.4 MiB | 228.4 MiB | 57.3 MiB |         412.8 MiB |
| one   |          2 | 103.6 MiB | 206.6 MiB | 54.6 MiB |         389.6 MiB |
| three |          2 | 105.8 MiB | 214.8 MiB | 55.6 MiB |         401.1 MiB |
| six   |          2 | 101.8 MiB | 216.7 MiB | 57.2 MiB |         400.6 MiB |
| one   |          3 | 103.8 MiB | 214.9 MiB | 54.4 MiB |         397.9 MiB |
| three |          3 | 105.7 MiB | 218.7 MiB | 55.6 MiB |         404.7 MiB |
| six   |          3 | 102.2 MiB | 224.4 MiB | 57.3 MiB |         408.7 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.9 MiB | 217.3 MiB | 54.4 MiB |
| three |          1 | 105.2 MiB | 227.0 MiB | 55.9 MiB |
| six   |          1 | 102.4 MiB | 229.0 MiB | 57.4 MiB |
| one   |          2 | 103.6 MiB | 206.8 MiB | 54.7 MiB |
| three |          2 | 105.9 MiB | 215.6 MiB | 55.6 MiB |
| six   |          2 | 101.9 MiB | 217.5 MiB | 57.2 MiB |
| one   |          3 | 103.9 MiB | 216.4 MiB | 54.4 MiB |
| three |          3 | 105.8 MiB | 223.9 MiB | 55.7 MiB |
| six   |          3 | 102.2 MiB | 226.3 MiB | 57.3 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |    total |
| -------- | ---------: | -------: | -------: | ------: | -------: |
| tabs 1-3 |          1 |  0.6 MiB |  5.2 MiB | 0.8 MiB |  6.6 MiB |
| tabs 3-6 |          1 | -0.9 MiB |  0.7 MiB | 0.5 MiB |  0.2 MiB |
| tabs 1-3 |          2 |  1.1 MiB |  4.1 MiB | 0.5 MiB |  5.8 MiB |
| tabs 3-6 |          2 | -1.3 MiB |  0.6 MiB | 0.5 MiB | -0.2 MiB |
| tabs 1-3 |          3 |  0.9 MiB |  1.9 MiB | 0.6 MiB |  3.4 MiB |
| tabs 3-6 |          3 | -1.1 MiB |  1.9 MiB | 0.6 MiB |  1.3 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12190 ms |        -1.6 MiB |    -2.7 MiB |    0.0 MiB |     -4.2 MiB |       9.12 % |   1.23 % |  2.84 % |    93 |
|          2 | 12181 ms |         1.9 MiB |    -2.3 MiB |    0.0 MiB |     -0.3 MiB |       7.03 % |   1.23 % |  2.58 % |    93 |
|          3 | 12194 ms |         1.3 MiB |    -2.3 MiB |    0.0 MiB |     -0.9 MiB |       9.14 % |   1.23 % |  3.19 % |    93 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | renderer peak | renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ----------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 10680.7 KiB/s |     227.7 MiB |           1.4 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B |  9435.5 KiB/s |     227.7 MiB |           1.4 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 14456.9 KiB/s |     227.7 MiB |           1.4 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2368.0 KiB/s |     251.3 MiB |          35.9 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 10964.7 KiB/s |     251.3 MiB |          35.9 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 11524.8 KiB/s |     251.3 MiB |          35.9 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11243.4 KiB/s |     272.8 MiB |          11.9 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 16712.8 KiB/s |     272.8 MiB |          11.9 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10108.4 KiB/s |     272.8 MiB |          11.9 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 11909.9 KiB/s |     223.3 MiB |           7.5 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 17252.7 KiB/s |     223.3 MiB |           7.5 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 11200.0 KiB/s |     223.3 MiB |           7.5 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2590.4 KiB/s |     279.3 MiB |          29.6 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 10004.9 KiB/s |     279.3 MiB |          29.6 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  8949.7 KiB/s |     279.3 MiB |          29.6 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 10514.4 KiB/s |     266.3 MiB |          17.8 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 11403.5 KiB/s |     266.3 MiB |          17.8 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 10971.2 KiB/s |     266.3 MiB |          17.8 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 10085.2 KiB/s |     228.4 MiB |          -1.2 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 17332.0 KiB/s |     228.4 MiB |          -1.2 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 11089.2 KiB/s |     228.4 MiB |          -1.2 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2228.8 KiB/s |     246.1 MiB |          37.8 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 10882.6 KiB/s |     246.1 MiB |          37.8 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 11093.2 KiB/s |     246.1 MiB |          37.8 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 11588.4 KiB/s |     267.9 MiB |           2.2 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B |  9587.3 KiB/s |     267.9 MiB |           2.2 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 14688.9 KiB/s |     267.9 MiB |           2.2 MiB |

Synthetic keydown to observed grid change (main-process parse, not presentation):

| repetition | raw median | observer-corrected median |         min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ----------------: | -------: | -------------------------------: |
|          1 |    17.3 ms |                   17.3 ms | 10.0 ms / 22.7 ms |        0 |                         519.2 ms |
|          2 |    13.2 ms |                   13.1 ms |  8.1 ms / 26.5 ms |        0 |                         512.4 ms |
|          3 |    17.8 ms |                   17.8 ms |  7.5 ms / 28.2 ms |        0 |                         494.7 ms |

## Scrollback pair

Six tabs with 0 lines against 10000 lines, per repetition, per role:

| repetition |     main | renderer |      GPU |
| ---------: | -------: | -------: | -------: |
|          1 | -0.5 MiB | 53.6 MiB |  0.2 MiB |
|          2 |  0.4 MiB | 69.4 MiB |  0.2 MiB |
|          3 | -0.1 MiB | 61.0 MiB | -0.2 MiB |

## Extension runtime

Single observation of the application-owned extension runtime:

|  window | processes |   steady |   growth |    CPU | settled |
| ------: | --------: | -------: | -------: | -----: | ------- |
| 5578 ms |         1 | 46.7 MiB | -0.0 MiB | 0.00 % | yes     |

## Comparison with the recorded baseline

Baseline recorded 2026-11-09T10:20:36.244Z from 7612bedfb663. Medians are taken across each side's repetitions. Candidate observations are in report.json; reference observations are in the recorded baseline file, retained separately. The delta is descriptive: no limit is applied and no verdict follows.

| family                           | scenario                              |       candidate median |        baseline median |    delta |
| -------------------------------- | ------------------------------------- | ---------------------: | ---------------------: | -------: |
| step steady                      | 10000 lines / one / main              |     103.7 MiB (3 reps) |     103.9 MiB (3 reps) |   -0.2 % |
| step peak                        | 10000 lines / one / main              |     103.7 MiB (3 reps) |     103.9 MiB (3 reps) |   -0.2 % |
| step steady                      | 10000 lines / one / renderer          |     226.8 MiB (3 reps) |     225.4 MiB (3 reps) |   +0.6 % |
| step peak                        | 10000 lines / one / renderer          |     230.3 MiB (3 reps) |     229.5 MiB (3 reps) |   +0.4 % |
| step steady                      | 10000 lines / one / gpu               |      54.6 MiB (3 reps) |      54.4 MiB (3 reps) |   +0.5 % |
| step peak                        | 10000 lines / one / gpu               |      54.7 MiB (3 reps) |      54.4 MiB (3 reps) |   +0.5 % |
| step total                       | 10000 lines / one                     |     410.1 MiB (3 reps) |     408.7 MiB (3 reps) |   +0.3 % |
| step steady                      | 10000 lines / three / main            |     106.2 MiB (3 reps) |     106.0 MiB (3 reps) |   +0.2 % |
| step peak                        | 10000 lines / three / main            |     106.4 MiB (3 reps) |     106.1 MiB (3 reps) |   +0.3 % |
| step steady                      | 10000 lines / three / renderer        |     253.6 MiB (3 reps) |     253.4 MiB (3 reps) |   +0.1 % |
| step peak                        | 10000 lines / three / renderer        |     253.9 MiB (3 reps) |     253.7 MiB (3 reps) |   +0.1 % |
| step steady                      | 10000 lines / three / gpu             |      55.6 MiB (3 reps) |      55.8 MiB (3 reps) |   -0.4 % |
| step peak                        | 10000 lines / three / gpu             |      55.6 MiB (3 reps) |      55.9 MiB (3 reps) |   -0.6 % |
| step total                       | 10000 lines / three                   |     440.3 MiB (3 reps) |     439.4 MiB (3 reps) |   +0.2 % |
| step steady                      | 10000 lines / six / main              |     102.1 MiB (3 reps) |     102.2 MiB (3 reps) |   -0.1 % |
| step peak                        | 10000 lines / six / main              |     102.2 MiB (3 reps) |     102.2 MiB (3 reps) |   -0.0 % |
| step steady                      | 10000 lines / six / renderer          |     285.4 MiB (3 reps) |     284.7 MiB (3 reps) |   +0.2 % |
| step peak                        | 10000 lines / six / renderer          |     285.7 MiB (3 reps) |     285.4 MiB (3 reps) |   +0.1 % |
| step steady                      | 10000 lines / six / gpu               |      57.4 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.1 % |
| step peak                        | 10000 lines / six / gpu               |      57.4 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.1 % |
| step total                       | 10000 lines / six                     |     469.5 MiB (3 reps) |     469.2 MiB (3 reps) |   +0.1 % |
| per-tab marginal                 | 10000 lines / oneToThree / main       |       1.1 MiB (3 reps) |       1.1 MiB (3 reps) |   +6.3 % |
| per-tab marginal                 | 10000 lines / oneToThree / renderer   |      13.1 MiB (3 reps) |      13.4 MiB (3 reps) |   -2.2 % |
| per-tab marginal                 | 10000 lines / oneToThree / gpu        |       0.5 MiB (3 reps) |       0.7 MiB (3 reps) |  -29.4 % |
| per-tab marginal total           | 10000 lines / oneToThree              |      14.6 MiB (3 reps) |      15.3 MiB (3 reps) |   -4.4 % |
| per-tab marginal                 | 10000 lines / threeToSix / main       |      -1.3 MiB (3 reps) |      -1.3 MiB (3 reps) |   +4.1 % |
| per-tab marginal                 | 10000 lines / threeToSix / renderer   |      10.8 MiB (3 reps) |      10.4 MiB (3 reps) |   +3.9 % |
| per-tab marginal                 | 10000 lines / threeToSix / gpu        |       0.6 MiB (3 reps) |       0.5 MiB (3 reps) |  +12.4 % |
| per-tab marginal total           | 10000 lines / threeToSix              |      10.1 MiB (3 reps) |       9.9 MiB (3 reps) |   +1.2 % |
| idle growth                      | 10000 lines / main                    |      -2.8 MiB (3 reps) |      -2.5 MiB (3 reps) |  +12.4 % |
| idle growth                      | 10000 lines / renderer                |       0.0 MiB (3 reps) |      -0.4 MiB (3 reps) | -109.4 % |
| idle growth                      | 10000 lines / gpu                     |       0.0 MiB (3 reps) |       0.0 MiB (3 reps) |   +0.0 % |
| idle growth total                | 10000 lines                           |      -2.7 MiB (3 reps) |      -3.0 MiB (3 reps) |  -11.2 % |
| idle CPU                         | 10000 lines / main                    |        1.23 % (3 reps) |        1.23 % (3 reps) |   -0.4 % |
| idle CPU                         | 10000 lines / renderer                |        7.88 % (3 reps) |        7.79 % (3 reps) |   +1.1 % |
| idle CPU                         | 10000 lines / gpu                     |        2.59 % (3 reps) |        2.84 % (3 reps) |   -8.9 % |
| idle CPU total                   | 10000 lines                           |       11.69 % (3 reps) |       12.29 % (3 reps) |   -4.9 % |
| stream rate                      | 10000 lines / ascii                   | 10340.3 KiB/s (3 reps) | 10874.1 KiB/s (3 reps) |   -4.9 % |
| stream peak                      | 10000 lines / ascii / main            |     101.7 MiB (3 reps) |     101.8 MiB (3 reps) |   -0.2 % |
| stream retained                  | 10000 lines / ascii / main            |      -0.1 MiB (3 reps) |      -0.4 MiB (3 reps) |  -74.0 % |
| stream peak                      | 10000 lines / ascii / renderer        |     288.1 MiB (3 reps) |     285.7 MiB (3 reps) |   +0.8 % |
| stream retained                  | 10000 lines / ascii / renderer        |      -0.8 MiB (3 reps) |       9.8 MiB (3 reps) | -108.0 % |
| stream peak                      | 10000 lines / ascii / gpu             |      57.6 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.3 % |
| stream retained                  | 10000 lines / ascii / gpu             |      -0.9 MiB (3 reps) |      -0.5 MiB (3 reps) |  +59.9 % |
| stream rate                      | 10000 lines / variety                 |  9042.1 KiB/s (3 reps) |  8898.2 KiB/s (3 reps) |   +1.6 % |
| stream peak                      | 10000 lines / variety / main          |     111.0 MiB (3 reps) |     111.0 MiB (3 reps) |   -0.1 % |
| stream retained                  | 10000 lines / variety / main          |       8.3 MiB (3 reps) |       8.9 MiB (3 reps) |   -6.4 % |
| stream peak                      | 10000 lines / variety / renderer      |     304.1 MiB (3 reps) |     307.5 MiB (3 reps) |   -1.1 % |
| stream retained                  | 10000 lines / variety / renderer      |      34.2 MiB (3 reps) |      32.5 MiB (3 reps) |   +5.1 % |
| stream peak                      | 10000 lines / variety / gpu           |      56.7 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.3 % |
| stream retained                  | 10000 lines / variety / gpu           |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |  -35.3 % |
| stream rate                      | 10000 lines / deep-history            | 10855.4 KiB/s (3 reps) | 11010.4 KiB/s (3 reps) |   -1.4 % |
| stream peak                      | 10000 lines / deep-history / main     |     110.7 MiB (3 reps) |     110.8 MiB (3 reps) |   -0.0 % |
| stream retained                  | 10000 lines / deep-history / main     |      -0.4 MiB (3 reps) |      -0.5 MiB (3 reps) |  -22.6 % |
| stream peak                      | 10000 lines / deep-history / renderer |     324.3 MiB (3 reps) |     332.3 MiB (3 reps) |   -2.4 % |
| stream retained                  | 10000 lines / deep-history / renderer |       6.0 MiB (3 reps) |       3.0 MiB (3 reps) |  +98.6 % |
| stream peak                      | 10000 lines / deep-history / gpu      |      56.7 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.3 % |
| stream retained                  | 10000 lines / deep-history / gpu      |       0.0 MiB (3 reps) |      -0.0 MiB (3 reps) | -140.0 % |
| input latency raw                | 10000 lines                           |       27.3 ms (3 reps) |       22.8 ms (3 reps) |  +19.7 % |
| input latency corrected          | 10000 lines                           |       17.0 ms (3 reps) |       14.2 ms (3 reps) |  +19.7 % |
| grid change to next counted draw | 10000 lines                           |      491.1 ms (3 reps) |      491.4 ms (3 reps) |   -0.1 % |
| step steady                      | 0 lines / one / main                  |     103.8 MiB (3 reps) |     103.6 MiB (3 reps) |   +0.2 % |
| step peak                        | 0 lines / one / main                  |     103.9 MiB (3 reps) |     103.6 MiB (3 reps) |   +0.3 % |
| step steady                      | 0 lines / one / renderer              |     214.9 MiB (3 reps) |     208.0 MiB (3 reps) |   +3.3 % |
| step peak                        | 0 lines / one / renderer              |     216.4 MiB (3 reps) |     208.4 MiB (3 reps) |   +3.9 % |
| step steady                      | 0 lines / one / gpu                   |      54.4 MiB (3 reps) |      54.6 MiB (3 reps) |   -0.4 % |
| step peak                        | 0 lines / one / gpu                   |      54.4 MiB (3 reps) |      54.7 MiB (3 reps) |   -0.4 % |
| step total                       | 0 lines / one                         |     397.9 MiB (3 reps) |     390.9 MiB (3 reps) |   +1.8 % |
| step steady                      | 0 lines / three / main                |     105.7 MiB (3 reps) |     105.6 MiB (3 reps) |   +0.0 % |
| step peak                        | 0 lines / three / main                |     105.8 MiB (3 reps) |     105.8 MiB (3 reps) |   +0.0 % |
| step steady                      | 0 lines / three / renderer            |     218.7 MiB (3 reps) |     213.8 MiB (3 reps) |   +2.3 % |
| step peak                        | 0 lines / three / renderer            |     223.9 MiB (3 reps) |     214.0 MiB (3 reps) |   +4.6 % |
| step steady                      | 0 lines / three / gpu                 |      55.6 MiB (3 reps) |      55.6 MiB (3 reps) |   +0.2 % |
| step peak                        | 0 lines / three / gpu                 |      55.7 MiB (3 reps) |      55.6 MiB (3 reps) |   +0.1 % |
| step total                       | 0 lines / three                       |     404.7 MiB (3 reps) |     400.0 MiB (3 reps) |   +1.2 % |
| step steady                      | 0 lines / six / main                  |     102.2 MiB (3 reps) |     101.9 MiB (3 reps) |   +0.4 % |
| step peak                        | 0 lines / six / main                  |     102.2 MiB (3 reps) |     102.0 MiB (3 reps) |   +0.3 % |
| step steady                      | 0 lines / six / renderer              |     224.4 MiB (3 reps) |     218.3 MiB (3 reps) |   +2.8 % |
| step peak                        | 0 lines / six / renderer              |     226.3 MiB (3 reps) |     219.5 MiB (3 reps) |   +3.1 % |
| step steady                      | 0 lines / six / gpu                   |      57.3 MiB (3 reps) |      57.2 MiB (3 reps) |   +0.2 % |
| step peak                        | 0 lines / six / gpu                   |      57.3 MiB (3 reps) |      57.3 MiB (3 reps) |   -0.0 % |
| step total                       | 0 lines / six                         |     408.7 MiB (3 reps) |     402.2 MiB (3 reps) |   +1.6 % |
| per-tab marginal                 | 0 lines / oneToThree / main           |       0.9 MiB (3 reps) |       1.1 MiB (3 reps) |  -14.6 % |
| per-tab marginal                 | 0 lines / oneToThree / renderer       |       4.1 MiB (3 reps) |       2.9 MiB (3 reps) |  +43.2 % |
| per-tab marginal                 | 0 lines / oneToThree / gpu            |       0.6 MiB (3 reps) |       0.6 MiB (3 reps) |   +8.5 % |
| per-tab marginal total           | 0 lines / oneToThree                  |       5.8 MiB (3 reps) |       4.5 MiB (3 reps) |  +27.6 % |
| per-tab marginal                 | 0 lines / threeToSix / main           |      -1.1 MiB (3 reps) |      -1.3 MiB (3 reps) |  -10.7 % |
| per-tab marginal                 | 0 lines / threeToSix / renderer       |       0.7 MiB (3 reps) |       2.0 MiB (3 reps) |  -66.5 % |
| per-tab marginal                 | 0 lines / threeToSix / gpu            |       0.5 MiB (3 reps) |       0.5 MiB (3 reps) |   +6.8 % |
| per-tab marginal total           | 0 lines / threeToSix                  |       0.2 MiB (3 reps) |       1.6 MiB (3 reps) |  -84.9 % |
| idle growth                      | 0 lines / main                        |      -2.3 MiB (3 reps) |      -2.4 MiB (3 reps) |   -6.3 % |
| idle growth                      | 0 lines / renderer                    |       1.3 MiB (3 reps) |       1.1 MiB (3 reps) |  +13.3 % |
| idle growth                      | 0 lines / gpu                         |       0.0 MiB (3 reps) |       0.0 MiB (3 reps) | +133.3 % |
| idle growth total                | 0 lines                               |      -0.9 MiB (3 reps) |      -1.3 MiB (3 reps) |  -26.0 % |
| idle CPU                         | 0 lines / main                        |        1.23 % (3 reps) |        1.23 % (3 reps) |   -0.1 % |
| idle CPU                         | 0 lines / renderer                    |        9.12 % (3 reps) |        7.74 % (3 reps) |  +17.9 % |
| idle CPU                         | 0 lines / gpu                         |        2.84 % (3 reps) |        2.83 % (3 reps) |   +0.1 % |
| idle CPU total                   | 0 lines                               |       13.18 % (3 reps) |       11.68 % (3 reps) |  +12.9 % |
| stream rate                      | 0 lines / ascii                       | 11089.2 KiB/s (3 reps) | 11052.4 KiB/s (3 reps) |   +0.3 % |
| stream peak                      | 0 lines / ascii / main                |     102.1 MiB (3 reps) |     101.8 MiB (3 reps) |   +0.3 % |
| stream retained                  | 0 lines / ascii / main                |      -1.5 MiB (3 reps) |      -1.3 MiB (3 reps) |  +21.5 % |
| stream peak                      | 0 lines / ascii / renderer            |     227.7 MiB (3 reps) |     224.8 MiB (3 reps) |   +1.3 % |
| stream retained                  | 0 lines / ascii / renderer            |       1.4 MiB (3 reps) |       0.1 MiB (3 reps) | +834.2 % |
| stream peak                      | 0 lines / ascii / gpu                 |      57.5 MiB (3 reps) |      57.4 MiB (3 reps) |   +0.2 % |
| stream retained                  | 0 lines / ascii / gpu                 |      -0.6 MiB (3 reps) |      -0.5 MiB (3 reps) |  +32.7 % |
| stream rate                      | 0 lines / variety                     | 10882.6 KiB/s (3 reps) |  9823.1 KiB/s (3 reps) |  +10.8 % |
| stream peak                      | 0 lines / variety / main              |     110.7 MiB (3 reps) |     110.5 MiB (3 reps) |   +0.2 % |
| stream retained                  | 0 lines / variety / main              |       9.2 MiB (3 reps) |       9.1 MiB (3 reps) |   +1.7 % |
| stream peak                      | 0 lines / variety / renderer          |     251.3 MiB (3 reps) |     246.2 MiB (3 reps) |   +2.1 % |
| stream retained                  | 0 lines / variety / renderer          |      35.9 MiB (3 reps) |      35.4 MiB (3 reps) |   +1.6 % |
| stream peak                      | 0 lines / variety / gpu               |      56.9 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.0 % |
| stream retained                  | 0 lines / variety / gpu               |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |  -38.5 % |
| stream rate                      | 0 lines / deep-history                | 11243.4 KiB/s (3 reps) | 12306.9 KiB/s (3 reps) |   -8.6 % |
| stream peak                      | 0 lines / deep-history / main         |     110.8 MiB (3 reps) |     110.7 MiB (3 reps) |   +0.1 % |
| stream retained                  | 0 lines / deep-history / main         |      -0.3 MiB (3 reps) |      -0.5 MiB (3 reps) |  -27.6 % |
| stream peak                      | 0 lines / deep-history / renderer     |     267.9 MiB (3 reps) |     269.9 MiB (3 reps) |   -0.8 % |
| stream retained                  | 0 lines / deep-history / renderer     |      11.9 MiB (3 reps) |       5.0 MiB (3 reps) | +135.8 % |
| stream peak                      | 0 lines / deep-history / gpu          |      56.9 MiB (3 reps) |      56.9 MiB (3 reps) |   -0.0 % |
| stream retained                  | 0 lines / deep-history / gpu          |      -0.0 MiB (3 reps) |      -0.0 MiB (3 reps) |  +75.0 % |
| input latency raw                | 0 lines                               |       17.3 ms (3 reps) |       16.6 ms (3 reps) |   +4.2 % |
| input latency corrected          | 0 lines                               |       17.3 ms (3 reps) |       16.6 ms (3 reps) |   +4.2 % |
| grid change to next counted draw | 0 lines                               |      512.4 ms (3 reps) |      514.6 ms (3 reps) |   -0.4 % |
| scrollback pair delta            | 0 vs 10000 lines / main               |      -0.1 MiB (3 reps) |       0.4 MiB (3 reps) | -131.9 % |
| scrollback pair delta            | 0 vs 10000 lines / renderer           |      61.0 MiB (3 reps) |      66.5 MiB (3 reps) |   -8.3 % |
| scrollback pair delta            | 0 vs 10000 lines / gpu                |       0.2 MiB (3 reps) |       0.2 MiB (3 reps) |  -13.2 % |
| extension runtime steady         | bootstrap                             |      46.7 MiB (1 reps) |      46.8 MiB (1 reps) |   -0.1 % |
| extension runtime growth         | bootstrap                             |      -0.0 MiB (1 reps) |      -0.0 MiB (1 reps) |  +31.3 % |
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
