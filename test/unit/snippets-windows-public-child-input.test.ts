import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { expect, it } from "vitest";

const flag = "--omxterm-public-child-stdin-diagnostic";
function withFixture(run: (evidence: string, probe: string) => void) {
  const evidence = mkdtempSync(path.join(os.tmpdir(), "run-"));
  try {
    const fixture = path.join(evidence, "fixture");
    mkdirSync(fixture);
    for (const name of [
      "snippets-windows-probe.cjs",
      "snippets-child-input-diagnostic.cjs",
    ])
      copyFileSync(path.join("test/fixtures", name), path.join(fixture, name));
    run(evidence, path.join(fixture, "snippets-windows-probe.cjs"));
  } finally {
    rmSync(evidence, { recursive: true, force: true });
  }
}
type Event = {
  kind: string;
  data?: string;
  error?: string;
  reason?: string;
  code?: number;
  classification?: string;
  publicInputDiagnostic?: boolean;
};
function events(evidence: string): Event[] {
  return readFileSync(
    path.join(evidence, "child-input-diagnostic.jsonl"),
    "utf8",
  )
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Event);
}
function launch(probe: string, input: Buffer, diagnostic: boolean) {
  return spawnSync(process.execPath, [probe, ...(diagnostic ? [flag] : [])], {
    input,
    encoding: "utf8",
    timeout: 5000,
    env: {},
  });
}

it("retains actual rejected child stdin and exit metadata in the run evidence", () => {
  withFixture((evidence, probe) => {
    const input = Buffer.from("\u001b[ISNIPPETS_RUN\r");
    const result = launch(probe, input, true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected controlled probe input");
    const rows = events(evidence);
    expect(rows[0]).toMatchObject({
      kind: "start",
      publicInputDiagnostic: true,
      classification: "synthetic-child-input-diagnostic-not-qualification",
    });
    expect(
      Buffer.concat(
        rows
          .filter((event) => event.kind === "stdin")
          .map((event) => Buffer.from(event.data!, "base64")),
      ),
    ).toEqual(input);
    expect(rows.find((event) => event.kind === "probe-error")?.error).toBe(
      "Unexpected controlled probe input",
    );
    expect(rows.find((event) => event.kind === "process-exit")?.code).toBe(1);
  });
});

it.each([
  "SNIPPETS_RUN\rSNIPPETS_PING\r",
  "  SNIPPETS_INSERT  \rSNIPPETS_RUN\r\rSNIPPETS_RUN\u0003  SNIPPETS_INSERT  \rSNIPPETS_PING\r",
])(
  "keeps public diagnostic output and exit identical to default for %j",
  (text) => {
    withFixture((evidence, probe) => {
      const input = Buffer.from(text);
      const ordinary = launch(probe, input, false);
      expect(
        existsSync(path.join(evidence, "child-input-diagnostic.jsonl")),
      ).toBe(false);
      const diagnostic = launch(probe, input, true);
      expect({
        status: diagnostic.status,
        stdout: diagnostic.stdout,
        stderr: diagnostic.stderr,
      }).toEqual({
        status: ordinary.status,
        stdout: ordinary.stdout,
        stderr: ordinary.stderr,
      });
      expect(diagnostic.status).toBe(0);
      expect(
        Buffer.concat(
          events(evidence)
            .filter((event) => event.kind === "stdin")
            .map((event) => Buffer.from(event.data!, "base64")),
        ),
      ).toEqual(input);
    });
  },
);

it("retains distinct actual stdin callbacks without joining or altering them", () => {
  withFixture((evidence, probe) => {
    const stdin = Object.assign(new EventEmitter(), {
      isTTY: false,
      pause() {},
    });
    const fake = Object.assign(new EventEmitter(), {
      argv: [process.execPath, probe, flag],
      env: {},
      stdin,
      stdout: { write() {} },
      stderr: { write() {} },
      pid: 123,
      ppid: 122,
      version: "test",
      platform: "win32",
      arch: "arm64",
    });
    runInNewContext(readFileSync(probe, "utf8"), {
      Buffer,
      process: fake,
      __dirname: path.dirname(probe),
      require: createRequire(probe),
      setTimeout: () => 1,
      clearTimeout() {},
    });
    const chunks = [
      Buffer.from("SNIP"),
      Buffer.from("PETS_RUN"),
      Buffer.from("\r"),
    ];
    for (const chunk of chunks) stdin.emit("data", chunk);
    fake.emit("exit", 0);
    expect(
      events(evidence)
        .filter((event) => event.kind === "stdin")
        .map((event) => Buffer.from(event.data!, "base64")),
    ).toEqual(chunks);
  });
});

it("explicitly truncates an oversized actual stdin callback before the probe rejects it", () => {
  withFixture((evidence, probe) => {
    const stdin = Object.assign(new EventEmitter(), {
      isTTY: false,
      pause() {},
    });
    let exitCode: number | undefined;
    const fake = Object.assign(new EventEmitter(), {
      argv: [process.execPath, probe, flag],
      env: {},
      stdin,
      stdout: { write() {} },
      stderr: {
        write(_text: string, callback: () => void) {
          callback();
        },
      },
      pid: 123,
      ppid: 122,
      version: "test",
      platform: "win32",
      arch: "arm64",
      exit(code: number) {
        exitCode = code;
      },
    });
    runInNewContext(readFileSync(probe, "utf8"), {
      Buffer,
      process: fake,
      __dirname: path.dirname(probe),
      require: createRequire(probe),
      setTimeout: () => 1,
      clearTimeout() {},
    });
    stdin.emit("data", Buffer.alloc(65537, 0x78));
    expect(exitCode).toBe(1);
    const rows = events(evidence);
    expect(rows.at(-1)).toMatchObject({
      kind: "capture-truncated",
      reason: "input-byte-bound",
    });
    expect(rows.some((row) => row.kind === "stdin")).toBe(false);
  });
});

it("refuses a pre-existing journal without changing the probe rejection", () => {
  withFixture((evidence, probe) => {
    const journal = path.join(evidence, "child-input-diagnostic.jsonl");
    writeFileSync(journal, "prior");
    const result = launch(probe, Buffer.from("unknown\r"), true);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected controlled probe input");
    expect(readFileSync(journal, "utf8")).toBe("prior");
    expect(
      JSON.parse(
        readFileSync(
          path.join(evidence, "child-input-capture-error.json"),
          "utf8",
        ),
      ),
    ).toMatchObject({ stage: "open" });
  });
});

it("refuses diagnostic capture from the source fixture outside a generated run", () => {
  const source = path.resolve("test/fixtures/snippets-windows-probe.cjs");
  const result = spawnSync(process.execPath, [source, flag], {
    input: "",
    encoding: "utf8",
    timeout: 5000,
    env: {},
  });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain(
    "Invalid generated public diagnostic fixture location",
  );
});

it("refuses inherited Snippets options instead of redirecting or mixing diagnostics", () => {
  withFixture((evidence, probe) => {
    const result = spawnSync(process.execPath, [probe, flag], {
      input: "SNIPPETS_RUN\r",
      encoding: "utf8",
      timeout: 5000,
      env: {
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: path.join(evidence, "elsewhere"),
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Conflicting Snippets diagnostic environment",
    );
    expect(
      existsSync(path.join(evidence, "child-input-diagnostic.jsonl")),
    ).toBe(false);
  });
});
