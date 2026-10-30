import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

interface Input {
  down(): Promise<void>;
  repeat(): Promise<void>;
  up(): Promise<void>;
  close(): Promise<void>;
}
interface Row {
  kind: string;
  type?: string;
  repeat?: number;
  token?: number;
  targetPID?: number;
  failed?: boolean;
  state?: { sessionDown: boolean; hidDown: boolean };
}
class Observer extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
}
interface Runtime {
  spawn(exe: string, args: string[]): Observer;
  execFileSync(exe: string, args: string[]): string;
}
const { openQuartzInput, verifyQuartzTool } = createRequire(import.meta.url)(
  "../fixtures/snippets-quartz.cjs",
) as {
  openQuartzInput(
    options: { manifest: string; root: string },
    runtime: Runtime,
  ): Promise<Input>;
  verifyQuartzTool(manifest: string): unknown;
};
const roots: string[] = [];
afterEach(() => {
  vi.useRealTimers();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function harness() {
  vi.useFakeTimers();
  const root = mkdtempSync(path.join(tmpdir(), "quartz-unit-"));
  roots.push(root);
  const executable = path.join(root, "tool");
  writeFileSync(executable, "fake process boundary; never execute", {
    mode: 0o700,
  });
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const manifest = path.join(root, "tool.json");
  writeFileSync(
    manifest,
    JSON.stringify({
      executable,
      sourceSha256: hash(readFileSync("test/fixtures/snippets-quartz.swift")),
      binarySha256: hash(readFileSync(executable)),
    }),
  );
  const child = new Observer();
  const calls: string[] = [];
  let token = 0,
    pid = 0,
    down = false;
  let transform = (row: Row): Row | undefined => row;
  let finalDown = false,
    normalStop = true,
    postThrows = false,
    neverStop = false,
    finalAccess = true;
  const state = () => ({ sessionDown: down, hidDown: false });
  const emit = (row: Row) => {
    const value = transform(row);
    if (value) child.stdout.write(JSON.stringify(value) + "\n");
  };
  const runtime: Runtime = {
    spawn(_exe, args) {
      token = Number(args[1]);
      pid = Number(args[2]);
      setTimeout(
        () => emit({ kind: "ready", token, targetPID: pid, state: state() }),
        0,
      );
      const timer = setInterval(() => {
        if (neverStop || !existsSync(args[3]!)) return;
        clearInterval(timer);
        if (normalStop)
          emit({ kind: "observer-stopped", failed: false, state: state() });
        child.stdout.end();
        child.stderr.end();
        child.emit("close", 0, null);
      }, 5);
      return child;
    },
    execFileSync(_exe, args) {
      if (args[0] === "status")
        return (
          JSON.stringify({
            kind: "access",
            listen: finalAccess,
            post: finalAccess,
          }) +
          "\n" +
          JSON.stringify({
            kind: "state",
            state: { sessionDown: finalDown, hidDown: false },
          })
        );
      const operation = args[3]!;
      calls.push(operation);
      if (postThrows && operation === "down") throw new Error("post failed");
      down = operation !== "up";
      emit({
        kind: "tap",
        token,
        targetPID: pid,
        type: down ? "keyDown" : "keyUp",
        repeat: operation === "repeat" ? 1 : 0,
        state: state(),
      });
      return "submitted";
    },
  };
  return {
    root,
    manifest,
    executable,
    calls,
    child,
    emit,
    transform(fn: typeof transform) {
      transform = fn;
    },
    configure(options: {
      finalDown?: boolean;
      normalStop?: boolean;
      postThrows?: boolean;
      neverStop?: boolean;
      finalAccess?: boolean;
    }) {
      finalDown = options.finalDown ?? finalDown;
      normalStop = options.normalStop ?? normalStop;
      postThrows = options.postThrows ?? postThrows;
      neverStop = options.neverStop ?? neverStop;
      finalAccess = options.finalAccess ?? finalAccess;
    },
    start: () => openQuartzInput({ manifest, root }, runtime),
    async open() {
      const pending = openQuartzInput({ manifest, root }, runtime);
      await vi.advanceTimersByTimeAsync(25);
      return pending;
    },
    async close(input: Input) {
      const pending = input.close();
      void pending.catch(() => {});
      await vi.advanceTimersByTimeAsync(25);
      return pending;
    },
    blocked: () => existsSync(executable + ".unsettled.json"),
  };
}

it("uses the real public helper interface for two independently observed gestures and joined cleanup", async () => {
  const h = harness(),
    input = await h.open();
  await input.down();
  await input.repeat();
  await input.up();
  await input.down();
  await input.up();
  expect(h.calls).toEqual(["down", "repeat", "up", "down", "up"]);
  expect(h.blocked()).toBe(true);
  await h.close(input);
  await input.close();
  expect(h.blocked()).toBe(false);
  await expect(input.down()).rejects.toThrow("closed");
});

it.each(["source", "binary", "marker"])(
  "refuses %s mismatch before launching",
  async (mode) => {
    const h = harness();
    if (mode === "marker")
      writeFileSync(h.executable + ".unsettled.json", "retained");
    else if (mode === "binary") writeFileSync(h.executable, "changed");
    else {
      const value = JSON.parse(readFileSync(h.manifest, "utf8")) as Record<
        string,
        unknown
      >;
      value.sourceSha256 = "wrong";
      writeFileSync(h.manifest, JSON.stringify(value));
    }
    expect(() => verifyQuartzTool(h.manifest)).toThrow();
    expect(h.calls).toEqual([]);
  },
);

it.each([
  "missing-down",
  "missing-held-state",
  "wrong-down-pid",
  "wrong-down-token",
])(
  "rejects %s rather than accepting post return or constant up",
  async (mode) => {
    const h = harness(),
      input = await h.open();
    h.transform((row) => {
      if (row.kind !== "tap") return row;
      if (mode === "missing-down") return undefined;
      if (mode === "missing-held-state")
        return { ...row, state: { sessionDown: false, hidDown: false } };
      return {
        ...row,
        ...(mode === "wrong-down-pid" ? { targetPID: -1 } : { token: -1 }),
      };
    });
    const rejected = expect(input.down()).rejects.toThrow("targeted down");
    await vi.advanceTimersByTimeAsync(15025);
    await rejected;
    const closing = expect(h.close(input)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(25);
    await closing;
    expect(h.blocked()).toBe(true);
    expect(h.calls).toContain("up"); // Cleanup attempt is never success.
  },
);

it.each(["missing-up", "wrong-up-pid", "wrong-up-token", "still-held"])(
  "rejects %s with held precondition and retains refusal",
  async (mode) => {
    const h = harness(),
      input = await h.open();
    await input.down();
    h.transform((row) => {
      if (row.type !== "keyUp") return row;
      if (mode === "missing-up") return undefined;
      if (mode === "still-held")
        return { ...row, state: { sessionDown: true, hidDown: false } };
      return {
        ...row,
        ...(mode === "wrong-up-pid" ? { targetPID: -1 } : { token: -1 }),
      };
    });
    const rejected = expect(input.up()).rejects.toThrow("targeted release");
    await vi.advanceTimersByTimeAsync(15025);
    await rejected;
    const closing = expect(h.close(input)).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(25);
    await closing;
    expect(() => verifyQuartzTool(h.manifest)).toThrow("ownership unresolved");
  },
);

it("cannot reuse a prior gesture's correct tagged release", async () => {
  const h = harness(),
    input = await h.open();
  await input.down();
  await input.up();
  await input.down();
  h.transform((row) => (row.type === "keyUp" ? undefined : row));
  const rejected = expect(input.up()).rejects.toThrow("targeted release");
  await vi.advanceTimersByTimeAsync(15025);
  await rejected;
  const closing = expect(h.close(input)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(25);
  await closing;
  expect(h.blocked()).toBe(true);
});

it("refuses repeat/release without observed down", async () => {
  const h = harness(),
    input = await h.open();
  await expect(input.up()).rejects.toThrow("held state");
  await expect(input.repeat()).rejects.toThrow();
  const closing = expect(h.close(input)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(25);
  await closing;
  expect(h.calls).toEqual([]);
});

it.each([
  "exit",
  "tap-disabled",
  "observer-deadline",
  "cleanup-release",
  "error",
])("fails closed on observer continuity loss: %s", async (kind) => {
  const h = harness(),
    input = await h.open();
  await input.down();
  if (kind === "exit") h.child.emit("close", 0, null);
  else h.emit({ kind });
  await expect(input.repeat()).rejects.toThrow();
  const closing = expect(h.close(input)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(25);
  await closing;
  expect(h.blocked()).toBe(true);
});

it.each([
  "no-stop-receipt",
  "final-down",
  "unfinished-gesture",
  "post-failure",
])("never treats uncertain cleanup as success: %s", async (mode) => {
  const h = harness(),
    input = await h.open();
  if (mode === "no-stop-receipt") h.configure({ normalStop: false });
  if (mode === "final-down") h.configure({ finalDown: true });
  if (mode === "unfinished-gesture") await input.down();
  if (mode === "post-failure") {
    h.configure({ postThrows: true });
    await expect(input.down()).rejects.toThrow("post failed");
  }
  const closing = expect(h.close(input)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(25);
  await closing;
  expect(h.blocked()).toBe(true);
  if (["unfinished-gesture", "post-failure"].includes(mode))
    expect(h.calls).toContain("up");
});

it.each(["held-baseline", "wrong-ready-pid", "missing-ready"])(
  "refuses invalid observer startup: %s",
  async (mode) => {
    const h = harness();
    h.transform((row) => {
      if (row.kind !== "ready") return row;
      if (mode === "missing-ready") return undefined;
      if (mode === "held-baseline")
        return { ...row, state: { sessionDown: true, hidDown: false } };
      return { ...row, targetPID: -1 };
    });
    const rejected = expect(h.start()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15100);
    await rejected;
    expect(h.calls).toEqual([]);
    expect(h.blocked()).toBe(true);
  },
);

it("does not resolve close merely because stop was requested", async () => {
  const h = harness(),
    input = await h.open();
  h.configure({ neverStop: true });
  const rejected = expect(input.close()).rejects.toThrow("close join");
  await vi.advanceTimersByTimeAsync(15025);
  await rejected;
  expect(h.blocked()).toBe(true);
});

it("retains refusal when final key-state access is lost", async () => {
  const h = harness(),
    input = await h.open();
  h.configure({ finalAccess: false });
  const rejected = expect(input.close()).rejects.toThrow("listen access");
  await vi.advanceTimersByTimeAsync(25);
  await rejected;
  expect(h.blocked()).toBe(true);
});

it("requires a separately observed native OS repeat", async () => {
  const h = harness(),
    input = await h.open();
  await input.down();
  h.transform((row) => (row.repeat === 1 ? undefined : row));
  const rejected = expect(input.repeat()).rejects.toThrow("targeted repeat");
  await vi.advanceTimersByTimeAsync(15025);
  await rejected;
  const closing = expect(h.close(input)).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(25);
  await closing;
  expect(h.blocked()).toBe(true);
});
