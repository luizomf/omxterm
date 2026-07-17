import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  CURRENT_OPERATIONAL_LOG_FILE,
  MAX_OPERATIONAL_LOG_BYTES,
  PREVIOUS_OPERATIONAL_LOG_FILE,
  createOperationalEventLog,
  resolveOperationalLogDirectory,
} from "../../src/main/operational-events";

async function temporaryRoots() {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-events-test-"));
  return {
    root,
    xdg: path.join(root, "xdg-state"),
    home: path.join(root, "home"),
  };
}

async function readRecords(file: string): Promise<unknown[]> {
  const text = await readFile(file, "utf8");
  expect(text.endsWith("\n")).toBe(true);
  return text
    .slice(0, -1)
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

describe("local Operational Events", () => {
  it("uses a non-empty XDG state root and otherwise the documented home fallback", async () => {
    expect(
      resolveOperationalLogDirectory(
        { XDG_STATE_HOME: "/xdg/state" },
        "/Users/tester",
      ),
    ).toBe("/xdg/state/omxterm/logs");
    for (const environment of [{}, { XDG_STATE_HOME: "" }]) {
      expect(resolveOperationalLogDirectory(environment, "/Users/tester")).toBe(
        "/Users/tester/.local/state/omxterm/logs",
      );
    }

    const { home } = await temporaryRoots();
    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: "" },
      homeDirectory: home,
    });
    expect(log.write({ name: "application.started" })).toBe(true);
    expect(
      await readRecords(
        path.join(
          home,
          ".local",
          "state",
          "omxterm",
          "logs",
          CURRENT_OPERATIONAL_LOG_FILE,
        ),
      ),
    ).toHaveLength(1);
  });

  it("defaults to info, enforces each validated level, and writes valid JSONL", async () => {
    const { xdg, home } = await temporaryRoots();
    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: xdg },
      homeDirectory: home,
      now: () => new Date("2026-07-17T12:00:00.000Z"),
    });
    expect(() => log.setLevel("warn" as never)).toThrow(TypeError);

    expect(
      log.write({ name: "pty.resize", windowId: 1, cols: 80, rows: 24 }),
    ).toBe(false);
    expect(log.write({ name: "application.started" })).toBe(true);
    expect(log.write({ name: "application.failure", stage: "startup" })).toBe(
      true,
    );
    log.setLevel("error");
    expect(log.write({ name: "application.started" })).toBe(false);
    expect(
      log.write({ name: "application.failure", stage: "new-window" }),
    ).toBe(true);
    log.setLevel("debug");
    expect(
      log.write({ name: "pty.resize", windowId: 1, cols: 90, rows: 30 }),
    ).toBe(true);
    log.flush();

    const records = await readRecords(
      path.join(xdg, "omxterm", "logs", CURRENT_OPERATIONAL_LOG_FILE),
    );
    expect(records).toEqual([
      {
        version: 1,
        timestamp: "2026-07-17T12:00:00.000Z",
        level: "info",
        name: "application.started",
      },
      {
        version: 1,
        timestamp: "2026-07-17T12:00:00.000Z",
        level: "error",
        name: "application.failure",
        stage: "startup",
      },
      {
        version: 1,
        timestamp: "2026-07-17T12:00:00.000Z",
        level: "error",
        name: "application.failure",
        stage: "new-window",
      },
      {
        version: 1,
        timestamp: "2026-07-17T12:00:00.000Z",
        level: "debug",
        name: "pty.resize",
        windowId: 1,
        cols: 90,
        rows: 30,
      },
    ]);
  });

  it("rejects malformed and oversized input instead of persisting or truncating it", async () => {
    const { xdg, home } = await temporaryRoots();
    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: xdg },
      homeDirectory: home,
    });
    log.setLevel("debug");
    const canaries = {
      terminalPayload: "TERMINAL_PAYLOAD_CANARY".repeat(300_000),
      clipboard: "CLIPBOARD_CANARY",
      environment: "ENVIRONMENT_SECRET_CANARY",
      configuration: "CONFIGURATION_SECRET_CANARY",
      command: "COMMAND_CANARY",
      title: "TITLE_CANARY",
      url: "https://URL-CANARY.invalid/private",
    };

    expect(
      log.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "invalid-payload",
        ...canaries,
      } as never),
    ).toBe(false);
    expect(log.write({ name: "unknown", ...canaries } as never)).toBe(false);
    expect(
      log.write({
        name: "application.failure",
        stage: "startup",
        unexpected: canaries.terminalPayload,
      } as never),
    ).toBe(false);
    expect(
      log.write({
        name: "boundary.rejected",
        boundary: "title",
        reason: "too-long",
      }),
    ).toBe(true);
    log.flush();

    const file = path.join(
      xdg,
      "omxterm",
      "logs",
      CURRENT_OPERATIONAL_LOG_FILE,
    );
    const text = await readFile(file, "utf8");
    for (const canary of Object.values(canaries))
      expect(text).not.toContain(canary);
    expect(await readRecords(file)).toHaveLength(1);
    expect((await stat(file)).size).toBeLessThanOrEqual(
      MAX_OPERATIONAL_LOG_BYTES,
    );
  });

  it("measures complete UTF-8 records including delimiters and retains only current and previous", async () => {
    const { xdg, home } = await temporaryRoots();
    const directory = path.join(xdg, "omxterm", "logs");
    await mkdir(directory, { recursive: true });
    const current = path.join(directory, CURRENT_OPERATIONAL_LOG_FILE);
    const previous = path.join(directory, PREVIOUS_OPERATIONAL_LOG_FILE);
    const stale = path.join(directory, "omxterm.older.jsonl");
    const seed = JSON.stringify({
      version: 1,
      timestamp: "2026-07-17T12:00:00.000Z",
      level: "info",
      name: "application.started",
    });
    await writeFile(
      current,
      `${seed}${" ".repeat(MAX_OPERATIONAL_LOG_BYTES - Buffer.byteLength(seed) - 1)}\n`,
    );
    await writeFile(previous, `${seed}\n`);
    await writeFile(stale, `${seed}\n`);

    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: xdg },
      homeDirectory: home,
      now: () => new Date("2026-07-17T12:00:01.000Z"),
    });
    expect(log.write({ name: "application.started" })).toBe(true);
    expect((await stat(previous)).size).toBe(MAX_OPERATIONAL_LOG_BYTES);
    expect((await stat(current)).size).toBeLessThanOrEqual(
      MAX_OPERATIONAL_LOG_BYTES,
    );
    log.flush();
    expect((await stat(previous)).size).toBe(MAX_OPERATIONAL_LOG_BYTES);
    expect((await stat(current)).size).toBeLessThanOrEqual(
      MAX_OPERATIONAL_LOG_BYTES,
    );
    expect(await readdir(directory)).toEqual([
      CURRENT_OPERATIONAL_LOG_FILE,
      PREVIOUS_OPERATIONAL_LOG_FILE,
    ]);
    expect(await readRecords(previous)).toHaveLength(1);
    expect(await readRecords(current)).toHaveLength(1);
  });

  it("discards pre-existing oversized or partial files before a completed operation", async () => {
    const { xdg, home } = await temporaryRoots();
    const directory = path.join(xdg, "omxterm", "logs");
    await mkdir(directory, { recursive: true });
    const current = path.join(directory, CURRENT_OPERATIONAL_LOG_FILE);
    const previous = path.join(directory, PREVIOUS_OPERATIONAL_LOG_FILE);
    await writeFile(current, Buffer.alloc(MAX_OPERATIONAL_LOG_BYTES + 1, 0x78));
    await writeFile(previous, '{"partial":true}');

    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: xdg },
      homeDirectory: home,
    });
    expect(
      log.write({ name: "application.failure", stage: "renderer-load" }),
    ).toBe(true);
    log.flush();

    expect(await readdir(directory)).toEqual([CURRENT_OPERATIONAL_LOG_FILE]);
    expect((await stat(current)).size).toBeLessThanOrEqual(
      MAX_OPERATIONAL_LOG_BYTES,
    );
    expect(await readRecords(current)).toHaveLength(1);
  });

  it.each([
    [MAX_OPERATIONAL_LOG_BYTES - 1, true],
    [MAX_OPERATIONAL_LOG_BYTES, true],
    [MAX_OPERATIONAL_LOG_BYTES + 1, false],
  ])(
    "enforces the exact %s-byte UTF-8 JSONL boundary including the delimiter",
    async (bytes, preserved) => {
      const { xdg, home } = await temporaryRoots();
      const directory = path.join(xdg, "omxterm", "logs");
      const current = path.join(directory, CURRENT_OPERATIONAL_LOG_FILE);
      await mkdir(directory, { recursive: true });
      const seed = JSON.stringify({
        version: 1,
        timestamp: "2026-07-17T12:00:00.000Z",
        level: "info",
        name: "application.started",
      });
      await writeFile(
        current,
        `${seed}${" ".repeat(bytes - Buffer.byteLength(seed) - 1)}\n`,
      );

      const log = createOperationalEventLog({
        environment: { XDG_STATE_HOME: xdg },
        homeDirectory: home,
      });
      log.flush();

      if (preserved) {
        expect((await stat(current)).size).toBe(bytes);
        expect(await readRecords(current)).toHaveLength(1);
      } else {
        await expect(stat(current)).rejects.toMatchObject({ code: "ENOENT" });
      }
    },
  );

  it("removes invalid UTF-8 rather than leaving a partial JSONL record", async () => {
    const { xdg, home } = await temporaryRoots();
    const directory = path.join(xdg, "omxterm", "logs");
    const current = path.join(directory, CURRENT_OPERATIONAL_LOG_FILE);
    await mkdir(directory, { recursive: true });
    await writeFile(current, Uint8Array.from([0xff, 0x0a]));

    const log = createOperationalEventLog({
      environment: { XDG_STATE_HOME: xdg },
      homeDirectory: home,
    });
    log.flush();

    await expect(stat(current)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
