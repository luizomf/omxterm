# Performance benchmark report

> Native truncated-stream integration test using measurement source
> `573eb96de4a620b2106ad1eb00d98aa163682b6e`, with one repetition per variant
> in the test caller. The test exited 0 after asserting 18 `stream-incomplete`
> issues; no `--fail-on-invalid` CLI exit was exercised in this run. All three
> supervised processes exited naturally. Raw observations and receipts are
> retained privately.

> This run measures. It carries no threshold and no verdict: nothing here says a
> number is acceptable, and a smaller number is not a pass.

Protocol `application-tabs-scrollback-idle-input-attribution:6359733f8ead`; metric pss (linux /proc/<pid>/smaps_rollup Pss); machine class `linux-arm64-4cpu-virtualized`; identity `9d4c154fdc0caa15`; PSS is measured on Linux ARM64 by this lane and is the metric this report compares.

Electron 43.8.1, Chromium 150.0.7871.250, Node 24.22.0. Build: main 353be67b3c66, preload 13897f4da936, renderer df7c7ddc1640.

Content 960x640; requested 960x640; pixel ratio 1. Grids: tab-0 118x37@8x16, tab-1 118x35@8x16.011484098939928, tab-2 118x35@8x16.011484098939928, tab-3 118x35@8x16.011484098939928, tab-4 118x35@8x16.011484098939928, tab-5 118x35@8x16.011484098939928.

Repetitions requested 1; renderer garbage collection before sampling: available.

## Data integrity

- invalid run `stream-incomplete`: 10000 lines / repetition 1 / ascii / stream 1: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / ascii / stream 2: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / ascii / stream 3: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / variety / stream 1: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / variety / stream 2: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / variety / stream 3: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / deep-history / stream 1: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / deep-history / stream 2: the payload never completed
- invalid run `stream-incomplete`: 10000 lines / repetition 1 / deep-history / stream 3: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / ascii / stream 1: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / ascii / stream 2: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / ascii / stream 3: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / variety / stream 1: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / variety / stream 2: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / variety / stream 3: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / deep-history / stream 1: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / deep-history / stream 2: the payload never completed
- invalid run `stream-incomplete`: 0 lines / repetition 1 / deep-history / stream 3: the payload never completed

## 10000 lines retained

Settings hash da58202e19b3; applied scrollback 10000; 1 repetitions.

Platform memory metric, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 104.3 MiB | 228.0 MiB | 55.0 MiB |         412.1 MiB |
| three |          1 | 105.8 MiB | 255.5 MiB | 55.8 MiB |         442.0 MiB |
| six   |          1 | 101.8 MiB | 285.2 MiB | 57.5 MiB |         469.3 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 104.4 MiB | 231.2 MiB | 55.1 MiB |
| three |          1 | 105.9 MiB | 255.8 MiB | 55.8 MiB |
| six   |          1 | 101.9 MiB | 285.7 MiB | 57.5 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |    total |
| -------- | ---------: | -------: | -------: | ------: | -------: |
| tabs 1-3 |          1 |  0.7 MiB | 13.8 MiB | 0.4 MiB | 15.0 MiB |
| tabs 3-6 |          1 | -1.3 MiB |  9.9 MiB | 0.6 MiB |  9.1 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12163 ms |         0.4 MiB |    -2.3 MiB |    0.0 MiB |     -1.9 MiB |       8.76 % |   1.35 % |  2.83 % |    90 |

Named idle CPU and post-history windows (application total excludes fixture workloads):

| repetition | window                      |  duration | renderer CPU | main CPU | GPU CPU | application CPU | renderer growth | draws |
| ---------: | --------------------------- | --------: | -----------: | -------: | ------: | --------------: | --------------: | ----: |
|          1 | blink-off-focused           | 4034.7 ms |       8.67 % |   0.74 % |  2.73 % |         12.14 % |        -0.2 MiB |    51 |
|          1 | blink-off-unfocused         | 4071.1 ms |       8.84 % |   1.47 % |  2.70 % |         13.02 % |         0.2 MiB |    51 |
|          1 | blink-on-focused            | 4079.9 ms |       8.58 % |   1.72 % |  2.94 % |         13.24 % |         0.6 MiB |    47 |
|          1 | blink-on-unfocused          | 4060.2 ms |      10.10 % |   1.23 % |  3.45 % |         14.78 % |         0.5 MiB |    40 |
|          1 | sitting-still-after-history | 4042.0 ms |       9.40 % |   1.24 % |  3.22 % |         13.85 % |        -1.9 MiB |    51 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed | arrived |  payload |  overhead | rate | observer cost | group renderer peak | group renderer retained |
| ---------: | ------------ | --------------: | --------- | ------: | -------: | --------: | ---: | ------------: | ------------------: | ----------------------: |
|          1 | ascii        |               1 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           297.1 MiB |                12.1 MiB |
|          1 | ascii        |               2 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           297.1 MiB |                12.1 MiB |
|          1 | ascii        |               3 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           297.1 MiB |                12.1 MiB |
|          1 | variety      |               1 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           332.5 MiB |               -19.9 MiB |
|          1 | variety      |               2 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           332.5 MiB |               -19.9 MiB |
|          1 | variety      |               3 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           332.5 MiB |               -19.9 MiB |
|          1 | deep-history |               1 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           287.1 MiB |                 5.1 MiB |
|          1 | deep-history |               2 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           287.1 MiB |                 5.1 MiB |
|          1 | deep-history |               3 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           287.1 MiB |                 5.1 MiB |

Synthetic keydown to observed renderer grid change (not presentation):

| repetition | raw median | observer-corrected median |         min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ----------------: | -------: | -------------------------------: |
|          1 |    24.7 ms |                   15.4 ms | 11.9 ms / 31.4 ms |        0 |                         502.3 ms |

## 0 lines retained

Settings hash 367ed2cb3373; applied scrollback 0; 1 repetitions.

Platform memory metric, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 104.0 MiB | 218.6 MiB | 54.9 MiB |         402.4 MiB |
| three |          1 | 105.6 MiB | 223.1 MiB | 56.5 MiB |         409.9 MiB |
| six   |          1 | 102.2 MiB | 229.7 MiB | 57.8 MiB |         414.5 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 104.1 MiB | 218.9 MiB | 55.0 MiB |
| three |          1 | 105.7 MiB | 225.1 MiB | 56.5 MiB |
| six   |          1 | 102.3 MiB | 230.2 MiB | 57.8 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |   total |
| -------- | ---------: | -------: | -------: | ------: | ------: |
| tabs 1-3 |          1 |  0.8 MiB |  2.2 MiB | 0.8 MiB | 3.8 MiB |
| tabs 3-6 |          1 | -1.1 MiB |  2.2 MiB | 0.4 MiB | 1.5 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12150 ms |        -5.7 MiB |    -2.6 MiB |    0.0 MiB |     -8.3 MiB |       7.77 % |   1.11 % |  3.10 % |    93 |

Named idle CPU and post-history windows (application total excludes fixture workloads):

| repetition | window                      |  duration | renderer CPU | main CPU | GPU CPU | application CPU | renderer growth | draws |
| ---------: | --------------------------- | --------: | -----------: | -------: | ------: | --------------: | --------------: | ----: |
|          1 | blink-off-focused           | 4067.5 ms |       9.34 % |   1.23 % |  3.93 % |         14.51 % |         1.4 MiB |    54 |
|          1 | blink-off-unfocused         | 4041.2 ms |       7.92 % |   0.99 % |  3.22 % |         12.12 % |         0.4 MiB |    54 |
|          1 | blink-on-focused            | 4065.8 ms |       7.62 % |   1.48 % |  2.71 % |         11.81 % |         0.1 MiB |    40 |
|          1 | blink-on-unfocused          | 4035.6 ms |       7.19 % |   0.74 % |  2.97 % |         10.90 % |        -1.6 MiB |    38 |
|          1 | sitting-still-after-history | 4124.7 ms |      11.88 % |   1.70 % |  3.15 % |         16.73 % |         0.0 MiB |    54 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed | arrived |  payload |  overhead | rate | observer cost | group renderer peak | group renderer retained |
| ---------: | ------------ | --------------: | --------- | ------: | -------: | --------: | ---: | ------------: | ------------------: | ----------------------: |
|          1 | ascii        |               1 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           229.6 MiB |                -2.9 MiB |
|          1 | ascii        |               2 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           229.6 MiB |                -2.9 MiB |
|          1 | ascii        |               3 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           229.6 MiB |                -2.9 MiB |
|          1 | variety      |               1 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           241.4 MiB |                -3.3 MiB |
|          1 | variety      |               2 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           241.4 MiB |                -3.3 MiB |
|          1 | variety      |               3 | NO        | 82046 B | 328000 B | -245954 B |    - |        0.0 ms |           241.4 MiB |                -3.3 MiB |
|          1 | deep-history |               1 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           231.6 MiB |                 3.8 MiB |
|          1 | deep-history |               2 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           231.6 MiB |                 3.8 MiB |
|          1 | deep-history |               3 | NO        | 82042 B | 328000 B | -245958 B |    - |        0.0 ms |           231.6 MiB |                 3.8 MiB |

Synthetic keydown to observed renderer grid change (not presentation):

| repetition | raw median | observer-corrected median |        min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ---------------: | -------: | -------------------------------: |
|          1 |    15.8 ms |                   15.7 ms | 7.0 ms / 23.2 ms |        0 |                         503.0 ms |

## Scrollback pair

Six tabs with 0 lines against 10000 lines, per repetition, per role:

| repetition |     main | renderer |      GPU |
| ---------: | -------: | -------: | -------: |
|          1 | -0.5 MiB | 55.5 MiB | -0.3 MiB |

## Extension runtime

Single observation of the application-owned extension runtime:

|  window | processes |   steady |   growth |    CPU | settled |
| ------: | --------: | -------: | -------: | -----: | ------- |
| 5589 ms |         1 | 46.8 MiB | -0.0 MiB | 0.00 % | yes     |

## Comparison with the recorded baseline

Baseline recorded 2026-11-09T12:19:38.128Z from 573eb96de4a6. Medians are taken across each side's repetitions. Candidate observations are in report.json; reference observations are in the recorded baseline file, retained separately. The delta is descriptive: no limit is applied and no verdict follows.

| family                           | scenario                              |        candidate median |                               baseline median |     delta |
| -------------------------------- | ------------------------------------- | ----------------------: | --------------------------------------------: | --------: |
| step steady                      | 10000 lines / one / main              |      104.3 MiB (1 reps) |                            103.8 MiB (3 reps) |    +0.5 % |
| step peak                        | 10000 lines / one / main              |      104.4 MiB (1 reps) |                            103.9 MiB (3 reps) |    +0.4 % |
| step steady                      | 10000 lines / one / renderer          |      228.0 MiB (1 reps) |                            230.5 MiB (3 reps) |    -1.1 % |
| step peak                        | 10000 lines / one / renderer          |      231.2 MiB (1 reps) |                            232.0 MiB (3 reps) |    -0.3 % |
| step steady                      | 10000 lines / one / gpu               |       55.0 MiB (1 reps) |                             54.7 MiB (3 reps) |    +0.7 % |
| step peak                        | 10000 lines / one / gpu               |       55.1 MiB (1 reps) |                             54.7 MiB (3 reps) |    +0.6 % |
| step total                       | 10000 lines / one                     |      412.1 MiB (1 reps) |                            413.9 MiB (3 reps) |    -0.5 % |
| step steady                      | 10000 lines / three / main            |      105.8 MiB (1 reps) |                            105.9 MiB (3 reps) |    -0.1 % |
| step peak                        | 10000 lines / three / main            |      105.9 MiB (1 reps) |                            106.0 MiB (3 reps) |    -0.1 % |
| step steady                      | 10000 lines / three / renderer        |      255.5 MiB (1 reps) |                            254.0 MiB (3 reps) |    +0.6 % |
| step peak                        | 10000 lines / three / renderer        |      255.8 MiB (1 reps) |                            254.2 MiB (3 reps) |    +0.6 % |
| step steady                      | 10000 lines / three / gpu             |       55.8 MiB (1 reps) |                             56.0 MiB (3 reps) |    -0.3 % |
| step peak                        | 10000 lines / three / gpu             |       55.8 MiB (1 reps) |                             56.0 MiB (3 reps) |    -0.3 % |
| step total                       | 10000 lines / three                   |      442.0 MiB (1 reps) |                            440.3 MiB (3 reps) |    +0.4 % |
| step steady                      | 10000 lines / six / main              |      101.8 MiB (1 reps) |                            102.1 MiB (3 reps) |    -0.4 % |
| step peak                        | 10000 lines / six / main              |      101.9 MiB (1 reps) |                            102.2 MiB (3 reps) |    -0.3 % |
| step steady                      | 10000 lines / six / renderer          |      285.2 MiB (1 reps) |                            284.4 MiB (3 reps) |    +0.3 % |
| step peak                        | 10000 lines / six / renderer          |      285.7 MiB (1 reps) |                            285.9 MiB (3 reps) |    -0.1 % |
| step steady                      | 10000 lines / six / gpu               |       57.5 MiB (1 reps) |                             57.2 MiB (3 reps) |    +0.5 % |
| step peak                        | 10000 lines / six / gpu               |       57.5 MiB (1 reps) |                             57.2 MiB (3 reps) |    +0.5 % |
| step total                       | 10000 lines / six                     |      469.3 MiB (1 reps) |                            468.5 MiB (3 reps) |    +0.2 % |
| per-tab marginal                 | 10000 lines / oneToThree / main       |        0.7 MiB (1 reps) |                              1.0 MiB (3 reps) |   -27.8 % |
| per-tab marginal                 | 10000 lines / oneToThree / renderer   |       13.8 MiB (1 reps) |                             11.4 MiB (3 reps) |   +20.8 % |
| per-tab marginal                 | 10000 lines / oneToThree / gpu        |        0.4 MiB (1 reps) |                              0.6 MiB (3 reps) |   -31.2 % |
| per-tab marginal total           | 10000 lines / oneToThree              |       15.0 MiB (1 reps) |                             13.2 MiB (3 reps) |   +13.3 % |
| per-tab marginal                 | 10000 lines / threeToSix / main       |       -1.3 MiB (1 reps) |                             -1.3 MiB (3 reps) |    +4.1 % |
| per-tab marginal                 | 10000 lines / threeToSix / renderer   |        9.9 MiB (1 reps) |                             10.4 MiB (3 reps) |    -4.8 % |
| per-tab marginal                 | 10000 lines / threeToSix / gpu        |        0.6 MiB (1 reps) |                              0.5 MiB (3 reps) |   +15.4 % |
| per-tab marginal total           | 10000 lines / threeToSix              |        9.1 MiB (1 reps) |                              9.7 MiB (3 reps) |    -6.2 % |
| idle growth                      | 10000 lines / main                    |       -2.3 MiB (1 reps) |                             -2.8 MiB (3 reps) |   -18.0 % |
| idle growth                      | 10000 lines / renderer                |        0.4 MiB (1 reps) |                              0.3 MiB (3 reps) |   +56.3 % |
| idle growth                      | 10000 lines / gpu                     |        0.0 MiB (1 reps) |                              0.0 MiB (3 reps) |    +0.0 % |
| idle growth total                | 10000 lines                           |       -1.9 MiB (1 reps) |                             -2.4 MiB (3 reps) |   -20.1 % |
| idle CPU                         | 10000 lines / main                    |         1.35 % (1 reps) |                               1.23 % (3 reps) |    +9.8 % |
| idle CPU                         | 10000 lines / renderer                |         8.76 % (1 reps) |                               6.64 % (3 reps) |   +31.9 % |
| idle CPU                         | 10000 lines / gpu                     |         2.83 % (1 reps) |                               2.09 % (3 reps) |   +35.4 % |
| idle CPU total                   | 10000 lines                           |        13.13 % (1 reps) |                               9.96 % (3 reps) |   +31.7 % |
| stream rate                      | 10000 lines / ascii                   | - (1 reps; 0/3 streams) | 13183.3 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 10000 lines / ascii / main            |      115.5 MiB (1 reps) |                            101.9 MiB (3 reps) |   +13.4 % |
| stream retained                  | 10000 lines / ascii / main            |       14.2 MiB (1 reps) |                             -0.1 MiB (3 reps) | -9885.9 % |
| stream peak                      | 10000 lines / ascii / renderer        |      297.1 MiB (1 reps) |                            289.9 MiB (3 reps) |    +2.5 % |
| stream retained                  | 10000 lines / ascii / renderer        |       12.1 MiB (1 reps) |                             -1.2 MiB (3 reps) | -1133.3 % |
| stream peak                      | 10000 lines / ascii / gpu             |       57.7 MiB (1 reps) |                             57.4 MiB (3 reps) |    +0.6 % |
| stream retained                  | 10000 lines / ascii / gpu             |       -0.5 MiB (1 reps) |                             -0.6 MiB (3 reps) |   -10.6 % |
| stream rate                      | 10000 lines / variety                 | - (1 reps; 0/3 streams) | 10750.2 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 10000 lines / variety / main          |      125.5 MiB (1 reps) |                            110.9 MiB (3 reps) |   +13.2 % |
| stream retained                  | 10000 lines / variety / main          |        9.5 MiB (1 reps) |                              8.6 MiB (3 reps) |    +9.8 % |
| stream peak                      | 10000 lines / variety / renderer      |      332.5 MiB (1 reps) |                            305.3 MiB (3 reps) |    +8.9 % |
| stream retained                  | 10000 lines / variety / renderer      |      -19.9 MiB (1 reps) |                             36.2 MiB (3 reps) |  -155.0 % |
| stream peak                      | 10000 lines / variety / gpu           |       57.3 MiB (1 reps) |                             56.7 MiB (3 reps) |    +1.0 % |
| stream retained                  | 10000 lines / variety / gpu           |       -0.1 MiB (1 reps) |                             -0.0 MiB (3 reps) |  +566.7 % |
| stream rate                      | 10000 lines / deep-history            | - (1 reps; 0/3 streams) | 16344.6 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 10000 lines / deep-history / main     |      128.1 MiB (1 reps) |                            110.9 MiB (3 reps) |   +15.5 % |
| stream retained                  | 10000 lines / deep-history / main     |        0.4 MiB (1 reps) |                             -0.8 MiB (3 reps) |  -147.9 % |
| stream peak                      | 10000 lines / deep-history / renderer |      287.1 MiB (1 reps) |                            330.7 MiB (3 reps) |   -13.2 % |
| stream retained                  | 10000 lines / deep-history / renderer |        5.1 MiB (1 reps) |                              6.9 MiB (3 reps) |   -26.1 % |
| stream peak                      | 10000 lines / deep-history / gpu      |       57.3 MiB (1 reps) |                             56.8 MiB (3 reps) |    +0.9 % |
| stream retained                  | 10000 lines / deep-history / gpu      |        0.1 MiB (1 reps) |                              0.0 MiB (3 reps) | +6650.0 % |
| input latency raw                | 10000 lines                           |        24.7 ms (1 reps) |                              26.4 ms (3 reps) |    -6.4 % |
| input latency corrected          | 10000 lines                           |        15.4 ms (1 reps) |                              16.0 ms (3 reps) |    -3.8 % |
| grid change to next counted draw | 10000 lines                           |       502.3 ms (1 reps) |                             485.6 ms (3 reps) |    +3.4 % |
| step steady                      | 0 lines / one / main                  |      104.0 MiB (1 reps) |                            103.7 MiB (3 reps) |    +0.3 % |
| step peak                        | 0 lines / one / main                  |      104.1 MiB (1 reps) |                            103.8 MiB (3 reps) |    +0.3 % |
| step steady                      | 0 lines / one / renderer              |      218.6 MiB (1 reps) |                            211.9 MiB (3 reps) |    +3.2 % |
| step peak                        | 0 lines / one / renderer              |      218.9 MiB (1 reps) |                            216.8 MiB (3 reps) |    +1.0 % |
| step steady                      | 0 lines / one / gpu                   |       54.9 MiB (1 reps) |                             54.7 MiB (3 reps) |    +0.5 % |
| step peak                        | 0 lines / one / gpu                   |       55.0 MiB (1 reps) |                             54.7 MiB (3 reps) |    +0.4 % |
| step total                       | 0 lines / one                         |      402.4 MiB (1 reps) |                            395.2 MiB (3 reps) |    +1.8 % |
| step steady                      | 0 lines / three / main                |      105.6 MiB (1 reps) |                            105.3 MiB (3 reps) |    +0.3 % |
| step peak                        | 0 lines / three / main                |      105.7 MiB (1 reps) |                            105.5 MiB (3 reps) |    +0.2 % |
| step steady                      | 0 lines / three / renderer            |      223.1 MiB (1 reps) |                            222.2 MiB (3 reps) |    +0.4 % |
| step peak                        | 0 lines / three / renderer            |      225.1 MiB (1 reps) |                            222.5 MiB (3 reps) |    +1.2 % |
| step steady                      | 0 lines / three / gpu                 |       56.5 MiB (1 reps) |                             55.6 MiB (3 reps) |    +1.6 % |
| step peak                        | 0 lines / three / gpu                 |       56.5 MiB (1 reps) |                             55.6 MiB (3 reps) |    +1.6 % |
| step total                       | 0 lines / three                       |      409.9 MiB (1 reps) |                            408.2 MiB (3 reps) |    +0.4 % |
| step steady                      | 0 lines / six / main                  |      102.2 MiB (1 reps) |                            102.2 MiB (3 reps) |    +0.1 % |
| step peak                        | 0 lines / six / main                  |      102.3 MiB (1 reps) |                            102.2 MiB (3 reps) |    +0.2 % |
| step steady                      | 0 lines / six / renderer              |      229.7 MiB (1 reps) |                            226.7 MiB (3 reps) |    +1.3 % |
| step peak                        | 0 lines / six / renderer              |      230.2 MiB (1 reps) |                            227.6 MiB (3 reps) |    +1.2 % |
| step steady                      | 0 lines / six / gpu                   |       57.8 MiB (1 reps) |                             57.3 MiB (3 reps) |    +0.9 % |
| step peak                        | 0 lines / six / gpu                   |       57.8 MiB (1 reps) |                             57.4 MiB (3 reps) |    +0.7 % |
| step total                       | 0 lines / six                         |      414.5 MiB (1 reps) |                            410.5 MiB (3 reps) |    +1.0 % |
| per-tab marginal                 | 0 lines / oneToThree / main           |        0.8 MiB (1 reps) |                              0.7 MiB (3 reps) |   +12.4 % |
| per-tab marginal                 | 0 lines / oneToThree / renderer       |        2.2 MiB (1 reps) |                              3.3 MiB (3 reps) |   -32.3 % |
| per-tab marginal                 | 0 lines / oneToThree / gpu            |        0.8 MiB (1 reps) |                              0.4 MiB (3 reps) |   +92.7 % |
| per-tab marginal total           | 0 lines / oneToThree                  |        3.8 MiB (1 reps) |                              4.7 MiB (3 reps) |   -19.8 % |
| per-tab marginal                 | 0 lines / threeToSix / main           |       -1.1 MiB (1 reps) |                             -1.0 MiB (3 reps) |    +6.5 % |
| per-tab marginal                 | 0 lines / threeToSix / renderer       |        2.2 MiB (1 reps) |                              1.3 MiB (3 reps) |   +71.9 % |
| per-tab marginal                 | 0 lines / threeToSix / gpu            |        0.4 MiB (1 reps) |                              0.5 MiB (3 reps) |   -19.2 % |
| per-tab marginal total           | 0 lines / threeToSix                  |        1.5 MiB (1 reps) |                              0.8 MiB (3 reps) |  +102.4 % |
| idle growth                      | 0 lines / main                        |       -2.6 MiB (1 reps) |                             -2.5 MiB (3 reps) |    +2.2 % |
| idle growth                      | 0 lines / renderer                    |       -5.7 MiB (1 reps) |                              0.4 MiB (3 reps) | -1542.6 % |
| idle growth                      | 0 lines / gpu                         |        0.0 MiB (1 reps) |                              0.0 MiB (3 reps) |    +0.0 % |
| idle growth total                | 0 lines                               |       -8.3 MiB (1 reps) |                             -2.2 MiB (3 reps) |  +276.2 % |
| idle CPU                         | 0 lines / main                        |         1.11 % (1 reps) |                               1.35 % (3 reps) |   -18.0 % |
| idle CPU                         | 0 lines / renderer                    |         7.77 % (1 reps) |                               8.00 % (3 reps) |    -2.9 % |
| idle CPU                         | 0 lines / gpu                         |         3.10 % (1 reps) |                               3.30 % (3 reps) |    -6.1 % |
| idle CPU total                   | 0 lines                               |        11.97 % (1 reps) |                              12.81 % (3 reps) |    -6.6 % |
| stream rate                      | 0 lines / ascii                       | - (1 reps; 0/3 streams) | 15040.1 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 0 lines / ascii / main                |      114.3 MiB (1 reps) |                            102.0 MiB (3 reps) |   +12.1 % |
| stream retained                  | 0 lines / ascii / main                |       13.1 MiB (1 reps) |                              0.1 MiB (3 reps) | +9248.3 % |
| stream peak                      | 0 lines / ascii / renderer            |      229.6 MiB (1 reps) |                            229.1 MiB (3 reps) |    +0.2 % |
| stream retained                  | 0 lines / ascii / renderer            |       -2.9 MiB (1 reps) |                              0.7 MiB (3 reps) |  -512.0 % |
| stream peak                      | 0 lines / ascii / gpu                 |       58.0 MiB (1 reps) |                             57.5 MiB (3 reps) |    +1.0 % |
| stream retained                  | 0 lines / ascii / gpu                 |       -0.4 MiB (1 reps) |                             -0.6 MiB (3 reps) |   -20.6 % |
| stream rate                      | 0 lines / variety                     | - (1 reps; 0/3 streams) | 10170.1 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 0 lines / variety / main              |      125.5 MiB (1 reps) |                            111.2 MiB (3 reps) |   +12.9 % |
| stream retained                  | 0 lines / variety / main              |        9.8 MiB (1 reps) |                              8.0 MiB (3 reps) |   +22.3 % |
| stream peak                      | 0 lines / variety / renderer          |      241.4 MiB (1 reps) |                            247.4 MiB (3 reps) |    -2.4 % |
| stream retained                  | 0 lines / variety / renderer          |       -3.3 MiB (1 reps) |                             34.6 MiB (3 reps) |  -109.5 % |
| stream peak                      | 0 lines / variety / gpu               |       57.6 MiB (1 reps) |                             56.9 MiB (3 reps) |    +1.3 % |
| stream retained                  | 0 lines / variety / gpu               |       -0.1 MiB (1 reps) |                             -0.0 MiB (3 reps) | +1160.0 % |
| stream rate                      | 0 lines / deep-history                | - (1 reps; 0/3 streams) | 15938.0 KiB/s (3 reps; 3/3, 3/3, 3/3 streams) |         - |
| stream peak                      | 0 lines / deep-history / main         |      128.4 MiB (1 reps) |                            110.9 MiB (3 reps) |   +15.8 % |
| stream retained                  | 0 lines / deep-history / main         |       -1.7 MiB (1 reps) |                             -0.7 MiB (3 reps) |  +150.9 % |
| stream peak                      | 0 lines / deep-history / renderer     |      231.6 MiB (1 reps) |                            269.2 MiB (3 reps) |   -14.0 % |
| stream retained                  | 0 lines / deep-history / renderer     |        3.8 MiB (1 reps) |                              4.0 MiB (3 reps) |    -5.6 % |
| stream peak                      | 0 lines / deep-history / gpu          |       57.6 MiB (1 reps) |                             56.9 MiB (3 reps) |    +1.2 % |
| stream retained                  | 0 lines / deep-history / gpu          |        0.1 MiB (1 reps) |                             -0.0 MiB (3 reps) | -1245.5 % |
| input latency raw                | 0 lines                               |        15.8 ms (1 reps) |                              13.7 ms (3 reps) |   +15.3 % |
| input latency corrected          | 0 lines                               |        15.7 ms (1 reps) |                              13.7 ms (3 reps) |   +14.6 % |
| grid change to next counted draw | 0 lines                               |       503.0 ms (1 reps) |                             506.0 ms (3 reps) |    -0.6 % |
| scrollback pair delta            | 0 vs 10000 lines / main               |       -0.5 MiB (1 reps) |                             -0.0 MiB (3 reps) | +1593.3 % |
| scrollback pair delta            | 0 vs 10000 lines / renderer           |       55.5 MiB (1 reps) |                             55.7 MiB (3 reps) |    -0.4 % |
| scrollback pair delta            | 0 vs 10000 lines / gpu                |       -0.3 MiB (1 reps) |                             -0.0 MiB (3 reps) |  +502.3 % |
| extension runtime steady         | bootstrap                             |       46.8 MiB (1 reps) |                             46.7 MiB (1 reps) |    +0.1 % |
| extension runtime growth         | bootstrap                             |       -0.0 MiB (1 reps) |                             -0.0 MiB (1 reps) |   +31.3 % |
| extension runtime CPU            | bootstrap                             |         0.00 % (1 reps) |                               0.00 % (1 reps) |         - |

## What this does not prove

- This report measures; it does not decide whether a number is acceptable. There is no threshold, no pass and no fail.
- Run-to-run variation and cold versus warm stream behavior limit interpretation; the printed repetitions are descriptive, not an uncertainty bound.
- A uniform per-tab leak is not identified as a leak by this report; no allocation-shape verdict is computed.
- The idle window is about 12 s; slower growth may not be observable in that interval.
- Input latency is synthetic keydown to observed renderer grid change. Presentation latency (what a person sees) is not measured; the grid-change-to-next-draw figure is a repaint counter and is not latency.
- Process memory is the platform metric named at the top: PSS on Linux, phys_footprint on macOS, private bytes on Windows. Those quantities are not interchangeable and only a baseline recorded with the same metric is printed beside the candidate.
- The extension-runtime window is a single observation, not a repeated measurement.
- Only linux-arm64 has a recorded baseline in this repository. Every other profile reports and has nothing to compare against.
- The workload is a fixed script: ten thousand retained lines per tab, three tab steps, three streams of 328,000 bytes, a 12 s idle window and seven keystrokes. Regressions outside those exercises are invisible.
- A comparison is printed only when the protocol, metric, machine class and identity, grid, content size, pixel ratio, settings and renderer GC availability all match the recorded baseline; otherwise the reasons are printed and no table is shown.
