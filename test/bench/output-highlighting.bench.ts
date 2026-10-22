// Throughput of the output highlighting transform on representative streams.
// Run with `npx vitest bench --run test/bench`; results are recorded in
// docs/implementation/14-performance-benchmarks.md.
import { bench, describe } from "vitest";
import {
  BUILTIN_HIGHLIGHT_CONTEXTS,
  DEFAULT_HIGHLIGHT_SETTINGS,
} from "../../src/shared/highlight-settings";
import { compileRuleSet } from "../../src/renderer/highlighting/highlight-rules";
import { createOutputHighlighter } from "../../src/renderer/highlighting/output-highlighter";

const rules = compileRuleSet(BUILTIN_HIGHLIGHT_CONTEXTS, {
  ...DEFAULT_HIGHLIGHT_SETTINGS,
  enabled: true,
});
const CHUNK = 4_000; // just under LARGE_CHUNK_LENGTH, like a busy PTY read

function repeatTo(line: string, size: number): string {
  return line.repeat(Math.ceil(size / line.length)).slice(0, size);
}

const logLines = repeatTo(
  "2026-10-22 12:00:01 INFO connected to 10.0.0.12 port 443: ok\r\n" +
    "2026-10-22 12:00:02 ERROR request failed: timeout after 30s\r\n" +
    'warning: deprecated option "--fast" ignored\r\n',
  CHUNK,
);
const pingLines = repeatTo(
  "64 bytes from 93.184.216.34: icmp_seq=12 ttl=56 time=11.2 ms\r\n",
  CHUNK,
);
// Minified output: one long line without a newline in the chunk.
const longLine = repeatTo('{"id":42,"name":"value","ok":true},', CHUNK);
// A full-screen program redraw: cursor moves and colors, no plain lines.
const tuiRedraw = repeatTo(
  "\u001b[12;4H\u001b[38;5;81m42.0%\u001b[0m \u001b[1;32mrunning\u001b[0m\u001b[K",
  CHUNK,
);

const run = (data: string, command?: string) => {
  const highlighter = createOutputHighlighter({
    rules: () => rules,
    now: () => 0,
  });
  if (command) {
    highlighter.transform("$ ");
    highlighter.injected(command, true);
  }
  return () => {
    highlighter.transform(data);
  };
};
const off = (data: string) => {
  const highlighter = createOutputHighlighter({ rules: () => undefined });
  return () => {
    highlighter.transform(data);
  };
};

describe(`4000-character chunks`, () => {
  bench("highlighting off (mode tracking only)", off(logLines));
  bench("global rules, log lines", run(logLines));
  bench("ping rules, ping lines", run(pingLines, "ping example.com"));
  bench("full-screen redraw (no colorable lines)", run(tuiRedraw));
  bench("long line without newline, highlighting off", off(longLine));
});
