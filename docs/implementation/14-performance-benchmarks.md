# Performance benchmarks

Measured numbers only. Each entry names the harness, so it can be re-run.

## Output highlighting transform

Harness: `npx vitest bench --run test/bench`
(`test/bench/output-highlighting.bench.ts`).

- **Machine:** AMD Ryzen 7 5700G, Linux x86_64.
- **Runtime:** Node 24.20.0 (V8), Vitest 4.1.11.
- **Input:** chunks of 4,000 characters, just under the burst threshold,
  like a busy PTY read.
- **Date:** 2026-10-22.

| Stream                                      | Before R23 | After R23 | Throughput after |
| ------------------------------------------- | ---------: | --------: | ---------------: |
| Highlighting off (mode tracking only)       |    0.16 ms |   0.13 ms |    ~30 M chars/s |
| Global rules, log lines                     |    0.47 ms |   0.43 ms |   ~9.4 M chars/s |
| Ping rules, ping lines                      |    0.44 ms |   0.40 ms |    ~10 M chars/s |
| Full-screen redraw (no colorable lines)     |    0.89 ms |   0.24 ms |    ~16 M chars/s |
| Long line without newline, highlighting off |    2.24 ms |   0.17 ms |    ~24 M chars/s |

Times are means per chunk.

**Reading the results:**

- **Default path.** Highlighting is off by default, but every pane still
  tokenizes output. Tracking modes, attributes and the command line costs
  about 0.13 ms per 4,000 characters. This is what lets highlighting turn on
  mid-stream without coloring inside a full-screen program.
- **R23.** The line model used to rebuild the line string on every printable
  character, which went quadratic on long lines. Appends are now linear, and
  long lines are trimmed in batches.
- **Bounds while highlighting is on:**
  - more than 8 consecutive chunks over 4,096 characters bypass the
    transform;
  - a chunk that takes over 12 ms bypasses it for 1 s;
  - lines over 2,048 characters are never colored.

## Not yet measured

- Application startup time and memory per window, before and after the port.
- Ghostty/Restty parse throughput, to put the transform cost in proportion.
- Split-pane resize and redraw cost with 16 panes.

These need an instrumented run of the packaged application and will be added
before release ([16-release-readiness.md](16-release-readiness.md)).
