# Performance benchmark report

> Baseline recording from clean source `573eb96de4a620b2106ad1eb00d98aa163682b6e`;
> the replaced schema-4 baseline was deliberately incompatible. The recording
> command exited 0 with seven naturally settled supervised processes. Raw samples
> and process receipts are retained privately, not included in this summary.

> This run measures. It carries no threshold and no verdict: nothing here says a
> number is acceptable, and a smaller number is not a pass.

> Later review found that the quiescence snapshot reads visible Surface geometry
> before `observerCostMs` starts and can trigger Restty resize/refit activity even
> when geometry is unchanged. The snapshot/refit is outside that timer, while
> later observer work (`textHash`) is timed. The `draws` values count instrumented
> WebGL `draw*`/`clear` calls, not complete frames. The contribution of this
> observer-induced resize/refit work to these observations is unknown; the
> historical values are retained and not automatically invalidated.

Protocol `application-tabs-scrollback-idle-input-attribution:6359733f8ead`; metric pss (linux /proc/<pid>/smaps_rollup Pss); machine class `linux-arm64-4cpu-virtualized`; identity `9d4c154fdc0caa15`; PSS is measured on Linux ARM64 by this lane and is the metric this report compares.

Electron 43.8.1, Chromium 150.0.7871.250, Node 24.22.0. Build: main 353be67b3c66, preload 13897f4da936, renderer df7c7ddc1640.

Content 960x640; requested 960x640; pixel ratio 1. Grids: tab-0 118x37@8x16, tab-1 118x35@8x16.011484098939928, tab-2 118x35@8x16.011484098939928, tab-3 118x35@8x16.011484098939928, tab-4 118x35@8x16.011484098939928, tab-5 118x35@8x16.011484098939928.

Repetitions requested 3; renderer garbage collection before sampling: available.

## Data integrity

No integrity issue was found.

## 10000 lines retained

Settings hash da58202e19b3; applied scrollback 10000; 3 repetitions.

Platform memory metric, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 103.7 MiB | 228.2 MiB | 54.8 MiB |         411.5 MiB |
| three |          1 | 105.5 MiB | 251.0 MiB | 56.0 MiB |         437.3 MiB |
| six   |          1 | 102.2 MiB | 282.4 MiB | 57.5 MiB |         466.8 MiB |
| one   |          2 | 103.8 MiB | 230.5 MiB | 54.7 MiB |         413.9 MiB |
| three |          2 | 106.0 MiB | 254.0 MiB | 55.4 MiB |         440.3 MiB |
| six   |          2 | 102.1 MiB | 285.2 MiB | 57.2 MiB |         469.5 MiB |
| one   |          3 | 103.9 MiB | 231.7 MiB | 54.4 MiB |         414.7 MiB |
| three |          3 | 105.9 MiB | 254.5 MiB | 56.0 MiB |         441.2 MiB |
| six   |          3 | 102.1 MiB | 284.4 MiB | 57.2 MiB |         468.5 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.8 MiB | 229.1 MiB | 54.9 MiB |
| three |          1 | 105.6 MiB | 253.0 MiB | 56.0 MiB |
| six   |          1 | 102.2 MiB | 283.2 MiB | 57.5 MiB |
| one   |          2 | 103.9 MiB | 232.4 MiB | 54.7 MiB |
| three |          2 | 106.0 MiB | 254.2 MiB | 55.6 MiB |
| six   |          2 | 102.3 MiB | 287.3 MiB | 57.2 MiB |
| one   |          3 | 104.0 MiB | 232.0 MiB | 54.4 MiB |
| three |          3 | 106.0 MiB | 254.7 MiB | 56.0 MiB |
| six   |          3 | 102.1 MiB | 285.9 MiB | 57.2 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |    total |
| -------- | ---------: | -------: | -------: | ------: | -------: |
| tabs 1-3 |          1 |  0.9 MiB | 11.4 MiB | 0.6 MiB | 12.9 MiB |
| tabs 3-6 |          1 | -1.1 MiB | 10.5 MiB | 0.5 MiB |  9.8 MiB |
| tabs 1-3 |          2 |  1.1 MiB | 11.7 MiB | 0.4 MiB | 13.2 MiB |
| tabs 3-6 |          2 | -1.3 MiB | 10.4 MiB | 0.6 MiB |  9.7 MiB |
| tabs 1-3 |          3 |  1.0 MiB | 11.4 MiB | 0.8 MiB | 13.2 MiB |
| tabs 3-6 |          3 | -1.3 MiB | 10.0 MiB | 0.4 MiB |  9.1 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12164 ms |         1.5 MiB |    -2.8 MiB |    0.0 MiB |     -1.3 MiB |       6.64 % |   1.23 % |  2.09 % |    93 |
|          2 | 12144 ms |         0.3 MiB |    -2.7 MiB |    0.0 MiB |     -2.4 MiB |       6.37 % |   1.47 % |  2.09 % |    90 |
|          3 | 12159 ms |        -0.6 MiB |    -2.9 MiB |    0.0 MiB |     -3.5 MiB |       6.68 % |   1.11 % |  2.22 % |    93 |

Named idle CPU and post-history windows (application total excludes fixture workloads):

| repetition | window                      |  duration | renderer CPU | main CPU | GPU CPU | application CPU | renderer growth | draws |
| ---------: | --------------------------- | --------: | -----------: | -------: | ------: | --------------: | --------------: | ----: |
|          1 | blink-off-focused           | 4071.8 ms |       6.63 % |   1.47 % |  2.21 % |         10.31 % |         0.8 MiB |    51 |
|          1 | blink-off-unfocused         | 4056.6 ms |       6.41 % |   1.23 % |  1.97 % |          9.61 % |        -0.0 MiB |    51 |
|          1 | blink-on-focused            | 4057.1 ms |       6.65 % |   0.99 % |  1.97 % |          9.61 % |         0.3 MiB |    38 |
|          1 | blink-on-unfocused          | 4064.2 ms |       7.63 % |   1.23 % |  2.21 % |         11.07 % |        -0.2 MiB |    50 |
|          1 | sitting-still-after-history | 4070.9 ms |       7.12 % |   1.47 % |  2.21 % |         10.81 % |        -0.6 MiB |    51 |
|          2 | blink-off-focused           | 4079.2 ms |       6.62 % |   1.47 % |  2.21 % |         10.30 % |         0.5 MiB |    51 |
|          2 | blink-off-unfocused         | 4044.4 ms |       5.44 % |   0.74 % |  1.98 % |          8.16 % |        -0.1 MiB |    51 |
|          2 | blink-on-focused            | 4078.2 ms |       6.13 % |   1.47 % |  1.96 % |          9.56 % |         0.5 MiB |    40 |
|          2 | blink-on-unfocused          | 4068.8 ms |       7.37 % |   1.47 % |  2.21 % |         11.06 % |        -0.0 MiB |    50 |
|          2 | sitting-still-after-history | 4053.6 ms |       8.14 % |   0.99 % |  1.97 % |         11.10 % |        -0.8 MiB |    54 |
|          3 | blink-off-focused           | 4049.0 ms |       6.67 % |   0.99 % |  2.22 % |          9.88 % |         0.2 MiB |    48 |
|          3 | blink-off-unfocused         | 4037.2 ms |       6.69 % |   0.99 % |  2.23 % |          9.91 % |         0.5 MiB |    51 |
|          3 | blink-on-focused            | 4082.1 ms |       7.35 % |   1.47 % |  2.20 % |         11.02 % |         0.4 MiB |    38 |
|          3 | blink-on-unfocused          | 4066.4 ms |       6.64 % |   1.23 % |  2.21 % |         10.08 % |         0.2 MiB |    50 |
|          3 | sitting-still-after-history | 4065.7 ms |       8.36 % |   1.23 % |  2.21 % |         11.81 % |        -4.6 MiB |    48 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | observer cost | group renderer peak | group renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ------------------: | ----------------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  6772.8 KiB/s |        3.7 ms |           292.5 MiB |                -1.1 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 12763.1 KiB/s |        3.6 ms |           292.5 MiB |                -1.1 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 17601.8 KiB/s |        3.4 ms |           292.5 MiB |                -1.1 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2623.7 KiB/s |        4.3 ms |           305.3 MiB |                34.1 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  9826.9 KiB/s |        3.3 ms |           305.3 MiB |                34.1 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  9394.6 KiB/s |        3.6 ms |           305.3 MiB |                34.1 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 10537.9 KiB/s |        3.7 ms |           328.2 MiB |                 8.7 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 21942.0 KiB/s |        3.9 ms |           328.2 MiB |                 8.7 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 16344.6 KiB/s |        3.5 ms |           328.2 MiB |                 8.7 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 12274.1 KiB/s |        4.1 ms |           289.9 MiB |                -2.1 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 13183.3 KiB/s |        3.4 ms |           289.9 MiB |                -2.1 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 13183.3 KiB/s |        3.5 ms |           289.9 MiB |                -2.1 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2585.6 KiB/s |        3.9 ms |           311.0 MiB |                36.2 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 10750.2 KiB/s |        3.5 ms |           311.0 MiB |                36.2 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 10822.9 KiB/s |        3.3 ms |           311.0 MiB |                36.2 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 18099.1 KiB/s |        4.0 ms |           330.7 MiB |                 6.1 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 17316.4 KiB/s |        4.2 ms |           330.7 MiB |                 6.1 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 20535.5 KiB/s |        3.5 ms |           330.7 MiB |                 6.1 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B |  9948.9 KiB/s |        3.7 ms |           286.0 MiB |                -1.2 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 20802.2 KiB/s |        3.2 ms |           286.0 MiB |                -1.2 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 18517.5 KiB/s |        3.4 ms |           286.0 MiB |                -1.2 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  3077.4 KiB/s |        4.0 ms |           298.0 MiB |                37.2 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 15328.1 KiB/s |        3.3 ms |           298.0 MiB |                37.2 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 17316.6 KiB/s |        3.4 ms |           298.0 MiB |                37.2 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B |  9918.1 KiB/s |        3.7 ms |           334.2 MiB |                 6.9 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 10786.3 KiB/s |        3.9 ms |           334.2 MiB |                 6.9 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B |  7364.4 KiB/s |        3.5 ms |           334.2 MiB |                 6.9 MiB |

Synthetic keydown to observed renderer grid change (not presentation):

| repetition | raw median | observer-corrected median |         min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ----------------: | -------: | -------------------------------: |
|          1 |    26.4 ms |                   16.0 ms | 12.7 ms / 36.1 ms |        0 |                         485.6 ms |
|          2 |    29.9 ms |                   17.8 ms |  9.4 ms / 38.9 ms |        0 |                         481.4 ms |
|          3 |    20.8 ms |                   14.1 ms |  9.2 ms / 34.7 ms |        0 |                         491.6 ms |

## 0 lines retained

Settings hash 367ed2cb3373; applied scrollback 0; 3 repetitions.

Platform memory metric, retained floor of the settled samples:

| step  | repetition |      main |  renderer |      GPU | application total |
| ----- | ---------: | --------: | --------: | -------: | ----------------: |
| one   |          1 | 103.7 MiB | 211.9 MiB | 54.8 MiB |         395.2 MiB |
| three |          1 | 104.9 MiB | 223.2 MiB | 55.6 MiB |         408.4 MiB |
| six   |          1 | 102.0 MiB | 226.7 MiB | 57.1 MiB |         410.5 MiB |
| one   |          2 | 103.9 MiB | 207.0 MiB | 54.4 MiB |         390.1 MiB |
| three |          2 | 105.3 MiB | 213.5 MiB | 55.7 MiB |         399.5 MiB |
| six   |          2 | 102.2 MiB | 217.4 MiB | 57.4 MiB |         401.8 MiB |
| one   |          3 | 103.6 MiB | 215.7 MiB | 54.7 MiB |         398.8 MiB |
| three |          3 | 105.8 MiB | 222.2 MiB | 55.5 MiB |         408.2 MiB |
| six   |          3 | 102.2 MiB | 232.3 MiB | 57.3 MiB |         416.6 MiB |

Peak memory over the same samples:

| step  | repetition |      main |  renderer |      GPU |
| ----- | ---------: | --------: | --------: | -------: |
| one   |          1 | 103.7 MiB | 217.9 MiB | 54.8 MiB |
| three |          1 | 105.0 MiB | 225.0 MiB | 55.6 MiB |
| six   |          1 | 102.0 MiB | 227.6 MiB | 57.1 MiB |
| one   |          2 | 103.9 MiB | 207.2 MiB | 54.4 MiB |
| three |          2 | 105.5 MiB | 214.2 MiB | 55.8 MiB |
| six   |          2 | 102.2 MiB | 217.9 MiB | 57.4 MiB |
| one   |          3 | 103.8 MiB | 216.8 MiB | 54.7 MiB |
| three |          3 | 105.8 MiB | 222.5 MiB | 55.5 MiB |
| six   |          3 | 102.2 MiB | 232.6 MiB | 57.4 MiB |

Per-tab marginal cost between tab steps:

| window   | repetition |     main | renderer |     GPU |   total |
| -------- | ---------: | -------: | -------: | ------: | ------: |
| tabs 1-3 |          1 |  0.6 MiB |  5.6 MiB | 0.4 MiB | 6.6 MiB |
| tabs 3-6 |          1 | -0.9 MiB |  1.2 MiB | 0.5 MiB | 0.7 MiB |
| tabs 1-3 |          2 |  0.7 MiB |  3.3 MiB | 0.7 MiB | 4.7 MiB |
| tabs 3-6 |          2 | -1.0 MiB |  1.3 MiB | 0.5 MiB | 0.8 MiB |
| tabs 1-3 |          3 |  1.1 MiB |  3.3 MiB | 0.4 MiB | 4.7 MiB |
| tabs 3-6 |          3 | -1.2 MiB |  3.4 MiB | 0.6 MiB | 2.8 MiB |

Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):

| repetition |   window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |
| ---------: | -------: | --------------: | ----------: | ---------: | -----------: | -----------: | -------: | ------: | ----: |
|          1 | 12209 ms |         0.4 MiB |    -2.6 MiB |    0.0 MiB |     -2.2 MiB |       6.88 % |   1.60 % |  2.22 % |    93 |
|          2 | 12124 ms |         1.8 MiB |    -2.5 MiB |    0.0 MiB |     -0.8 MiB |       8.00 % |   1.35 % |  3.30 % |    93 |
|          3 | 12231 ms |        -3.8 MiB |    -2.4 MiB |   -0.0 MiB |     -6.2 MiB |      10.86 % |   0.99 % |  4.16 % |    93 |

Named idle CPU and post-history windows (application total excludes fixture workloads):

| repetition | window                      |  duration | renderer CPU | main CPU | GPU CPU | application CPU | renderer growth | draws |
| ---------: | --------------------------- | --------: | -----------: | -------: | ------: | --------------: | --------------: | ----: |
|          1 | blink-off-focused           | 4050.5 ms |       7.41 % |   0.74 % |  2.22 % |         10.37 % |        -0.1 MiB |    54 |
|          1 | blink-off-unfocused         | 4074.8 ms |       7.36 % |   1.72 % |  2.45 % |         11.53 % |         0.4 MiB |    54 |
|          1 | blink-on-focused            | 4068.3 ms |       6.39 % |   1.72 % |  2.21 % |         10.32 % |         0.4 MiB |    37 |
|          1 | blink-on-unfocused          | 4063.7 ms |       6.40 % |   1.48 % |  2.21 % |         10.09 % |         1.1 MiB |    48 |
|          1 | sitting-still-after-history | 4091.2 ms |       8.55 % |   1.96 % |  2.69 % |         13.20 % |         3.0 MiB |    51 |
|          2 | blink-off-focused           | 4071.0 ms |       7.61 % |   1.47 % |  3.19 % |         12.28 % |         0.7 MiB |    54 |
|          2 | blink-off-unfocused         | 4050.2 ms |       8.39 % |   0.99 % |  3.95 % |         13.33 % |        -0.0 MiB |    51 |
|          2 | blink-on-focused            | 4114.5 ms |       9.24 % |   2.19 % |  3.40 % |         14.83 % |         0.4 MiB |    42 |
|          2 | blink-on-unfocused          | 4053.1 ms |       6.91 % |   1.23 % |  2.47 % |         10.61 % |         0.2 MiB |    38 |
|          2 | sitting-still-after-history | 4025.5 ms |       7.45 % |   0.75 % |  2.73 % |         10.93 % |         1.5 MiB |    51 |
|          3 | blink-off-focused           | 4120.5 ms |       8.98 % |   1.46 % |  4.13 % |         14.56 % |         0.7 MiB |    54 |
|          3 | blink-off-unfocused         | 4034.3 ms |      15.12 % |   0.50 % |  5.45 % |         21.07 % |         0.3 MiB |    51 |
|          3 | blink-on-focused            | 4052.5 ms |      11.84 % |   1.23 % |  4.19 % |         17.27 % |         0.2 MiB |    37 |
|          3 | blink-on-unfocused          | 4051.4 ms |       9.87 % |   0.74 % |  2.47 % |         13.08 % |        -1.2 MiB |    48 |
|          3 | sitting-still-after-history | 4080.9 ms |       8.09 % |   1.96 % |  3.19 % |         13.23 % |        -0.6 MiB |    51 |

Streams (arrival bytes include the command echo and end marker; the allowance is printed):

| repetition | stream       | repetition of 3 | completed |  arrived |  payload | overhead |          rate | observer cost | group renderer peak | group renderer retained |
| ---------: | ------------ | --------------: | --------- | -------: | -------: | -------: | ------------: | ------------: | ------------------: | ----------------------: |
|          1 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 11360.1 KiB/s |        0.0 ms |           231.2 MiB |                -0.0 MiB |
|          1 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 12465.1 KiB/s |        0.1 ms |           231.2 MiB |                -0.0 MiB |
|          1 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 11909.1 KiB/s |        0.0 ms |           231.2 MiB |                -0.0 MiB |
|          1 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2510.6 KiB/s |        0.1 ms |           247.4 MiB |                34.5 MiB |
|          1 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 20938.4 KiB/s |        0.0 ms |           247.4 MiB |                34.5 MiB |
|          1 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 13868.3 KiB/s |        0.0 ms |           247.4 MiB |                34.5 MiB |
|          1 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 26258.5 KiB/s |        0.0 ms |           269.2 MiB |                 1.8 MiB |
|          1 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 17505.7 KiB/s |        0.0 ms |           269.2 MiB |                 1.8 MiB |
|          1 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 20022.1 KiB/s |        0.0 ms |           269.2 MiB |                 1.8 MiB |
|          2 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 11734.6 KiB/s |        0.0 ms |           224.6 MiB |                 7.6 MiB |
|          2 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 15040.1 KiB/s |        0.0 ms |           224.6 MiB |                 7.6 MiB |
|          2 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 21500.2 KiB/s |        0.1 ms |           224.6 MiB |                 7.6 MiB |
|          2 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2548.6 KiB/s |        0.1 ms |           250.7 MiB |                34.6 MiB |
|          2 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B |  9949.0 KiB/s |        0.0 ms |           250.7 MiB |                34.6 MiB |
|          2 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B |  9857.2 KiB/s |        0.1 ms |           250.7 MiB |                34.6 MiB |
|          2 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 20938.1 KiB/s |        0.0 ms |           271.7 MiB |                20.0 MiB |
|          2 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 15040.1 KiB/s |        0.0 ms |           271.7 MiB |                20.0 MiB |
|          2 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 15938.0 KiB/s |        0.0 ms |           271.7 MiB |                20.0 MiB |
|          3 | ascii        |               1 | yes       | 328042 B | 328000 B |     42 B | 14112.5 KiB/s |        0.0 ms |           229.1 MiB |                 0.7 MiB |
|          3 | ascii        |               2 | yes       | 328042 B | 328000 B |     42 B | 17997.4 KiB/s |        0.0 ms |           229.1 MiB |                 0.7 MiB |
|          3 | ascii        |               3 | yes       | 328042 B | 328000 B |     42 B | 19182.8 KiB/s |        0.1 ms |           229.1 MiB |                 0.7 MiB |
|          3 | variety      |               1 | yes       | 328046 B | 328000 B |     46 B |  2357.3 KiB/s |        0.0 ms |           246.4 MiB |                36.3 MiB |
|          3 | variety      |               2 | yes       | 328046 B | 328000 B |     46 B | 18411.3 KiB/s |        0.0 ms |           246.4 MiB |                36.3 MiB |
|          3 | variety      |               3 | yes       | 328046 B | 328000 B |     46 B | 10170.1 KiB/s |        0.1 ms |           246.4 MiB |                36.3 MiB |
|          3 | deep-history |               1 | yes       | 328042 B | 328000 B |     42 B | 13292.7 KiB/s |        0.0 ms |           268.1 MiB |                 4.0 MiB |
|          3 | deep-history |               2 | yes       | 328042 B | 328000 B |     42 B | 13517.0 KiB/s |        0.0 ms |           268.1 MiB |                 4.0 MiB |
|          3 | deep-history |               3 | yes       | 328042 B | 328000 B |     42 B | 12662.2 KiB/s |        0.0 ms |           268.1 MiB |                 4.0 MiB |

Synthetic keydown to observed renderer grid change (not presentation):

| repetition | raw median | observer-corrected median |        min / max | failures | grid change to next counted draw |
| ---------: | ---------: | ------------------------: | ---------------: | -------: | -------------------------------: |
|          1 |    13.2 ms |                   13.2 ms | 7.4 ms / 25.1 ms |        0 |                         506.0 ms |
|          2 |    13.7 ms |                   13.7 ms | 5.5 ms / 36.9 ms |        0 |                         512.6 ms |
|          3 |    22.1 ms |                   22.0 ms | 7.8 ms / 90.4 ms |        0 |                         482.3 ms |

## Scrollback pair

Six tabs with 0 lines against 10000 lines, per repetition, per role:

| repetition |     main | renderer |      GPU |
| ---------: | -------: | -------: | -------: |
|          1 |  0.2 MiB | 55.7 MiB |  0.4 MiB |
|          2 | -0.0 MiB | 67.8 MiB | -0.1 MiB |
|          3 | -0.1 MiB | 52.1 MiB | -0.0 MiB |

## Extension runtime

Single observation of the application-owned extension runtime:

|  window | processes |   steady |   growth |    CPU | settled |
| ------: | --------: | -------: | -------: | -----: | ------- |
| 5783 ms |         1 | 46.7 MiB | -0.0 MiB | 0.00 % | yes     |

## Comparison with the recorded baseline

Not comparable, so no numbers are printed side by side:

- baseline schema 4 is not 5; re-record with --replace

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
