import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { validateDump, memoryInput } =
  require("../fixtures/snippets-memory-input.cjs") as typeof import("../fixtures/snippets-memory-input.cjs");
const nonce = "a".repeat(32);
const pid = 123;
const initial = {
  kind: "timeout",
  error: "Error: Timed out: controlled probe observed first Insert",
};
const outcomeText = JSON.stringify({
  classification: "first-insert-memory-not-qualification",
  nonce,
  pid,
  initial,
});
const source = readFileSync("test/fixtures/snippets-windows-probe.cjs", "utf8");
function probe(enabled = true, paths = path.posix) {
  let now = 0n;
  let next = 0;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  const files = new Map<string, string>();
  const io: string[] = [];
  const order: string[] = [];
  let input!: (chunk: Buffer) => void;
  let output = "";
  const stdin = {
    isTTY: true,
    setRawMode() {
      order.push("raw");
    },
    on(_event: string, cb: typeof input) {
      input = cb;
    },
    pause() {},
  };
  const stdout = {
    write(text: string) {
      output += text;
      return true;
    },
  };
  let inRead = false,
    outRead = false;
  const context = vm.createContext({
    Buffer,
    process: {
      pid,
      env: {
        OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: "/evidence",
        ...(enabled ? { OMXTERM_SNIPPETS_PACKAGED_MEMORY_INPUT: nonce } : {}),
      },
      hrtime: { bigint: () => now++ },
      get stdin() {
        if (!inRead) {
          inRead = true;
          order.push("stdin");
        }
        return stdin;
      },
      get stdout() {
        if (!outRead) {
          outRead = true;
          order.push("stdout");
        }
        return stdout;
      },
      get stderr() {
        throw Error("unexpected stderr");
      },
    },
    require(name: string) {
      io.push(name);
      if (name === "node:path") return paths;
      if (name === "node:fs")
        return {
          statSync(p: string) {
            if (!files.has(p)) throw Error("missing outcome");
            return { size: files.get(p)!.length };
          },
          readFileSync(p: string) {
            return files.get(p);
          },
          writeFileSync(p: string, text: string) {
            if (files.has(p))
              throw Object.assign(Error("exists"), { code: "EEXIST" });
            files.set(p, text);
          },
          existsSync(p: string) {
            return files.has(p);
          },
          renameSync(a: string, b: string) {
            files.set(b, files.get(a)!);
            files.delete(a);
          },
        };
      throw Error("unexpected require " + name);
    },
    setTimeout(fn: () => void, ms: number) {
      timers.set(++next, { fn, ms });
      return next;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });
  vm.runInContext(source, context);
  return {
    order,
    io,
    files,
    file: (name: string) => paths.join("/evidence", name),
    input: (text: string) => input(Buffer.from(text)),
    output: () => output,
    fire(ms: number) {
      now += BigInt(ms) * 1000000n;
      for (const [id, timer] of [...timers])
        if (timer.ms === ms) {
          timers.delete(id);
          timer.fn();
        }
    },
    dump() {
      return JSON.parse(
        files.get(paths.join("/evidence", "memory-child.json"))!,
      ) as import("../fixtures/snippets-memory-input.cjs").MemoryDump;
    },
  };
}

it("preserves lazy stdio order and performs no diagnostic I/O before the dump", () => {
  for (const enabled of [false, true]) {
    const p = probe(enabled);
    expect(p.order).toEqual(["stdin", "raw", "stdout"]);
    p.input("  SNIPPETS_INSERT  ");
    p.fire(150);
    expect(p.output()).toContain("SNIPPETS_INSERT_DRAFT_RECEIPT\n");
    expect(p.io).toEqual([]);
    if (enabled) {
      p.files.set("/evidence/memory-observation.json", outcomeText);
      p.fire(60000);
      expect(validateDump(p.dump(), outcomeText, pid, nonce).callbacks).toBe(1);
      expect(p.dump().events.map((e: { kind: string }) => e.kind)).toContain(
        "receipt-write-returned",
      );
      const frozen = p.files.get("/evidence/memory-child.json");
      p.input("x");
      p.fire(60000);
      expect(p.files.get("/evidence/memory-child.json")).toBe(frozen);
    }
  }
});

it.each([
  ["no callback", []],
  ["prior CPR", ["\x1b[2;1R", "  SNIPPETS_INSERT  "]],
  ["later focus", ["  SNIPPETS_INSERT  ", "\x1b[O", "\x1b[I"]],
])(
  "distinguishes missing receipt: %s without changing parser",
  (_name, chunks) => {
    const p = probe();
    for (const chunk of chunks) p.input(chunk);
    p.fire(150);
    expect(p.output()).not.toContain("DRAFT_RECEIPT");
    expect(p.io).toEqual([]);
    p.files.set("/evidence/memory-observation.json", outcomeText);
    p.fire(60000);
    const dump = p.dump();
    expect(validateDump(dump, outcomeText, pid, nonce).callbacks).toBe(
      chunks.length,
    );
    const callbacks = dump.events.filter(
      (e: { kind: string }) => e.kind === "stdin",
    );
    expect(
      callbacks.map((e) => Buffer.from(e.data!, "base64").toString()),
    ).toEqual(chunks);
    if (chunks.length)
      expect(
        Buffer.from(callbacks.at(-1)!.lineBefore!, "base64").length,
      ).toBeGreaterThan(0);
  },
);

it("retains split callbacks, line before/after, cancellation and the original 150ms timer", () => {
  const p = probe();
  p.input("  SNIPPETS_");
  p.input("INSERT  ");
  p.fire(150);
  p.files.set("/evidence/memory-observation.json", outcomeText);
  p.fire(60000);
  const events = p.dump().events;
  expect(
    events.filter((e: { kind: string }) => e.kind === "timer-schedule"),
  ).toHaveLength(1);
  expect(
    events.find((e: { kind: string }) => e.kind === "timer-schedule")!.delayMs,
  ).toBe(150);
  expect(
    events.find((e: { kind: string }) => e.kind === "timer-fire")!.matches,
  ).toBe(true);
});

it("refuses early/missing, mismatched and overflowing dumps", () => {
  const p = probe();
  p.fire(60000);
  expect(() => validateDump(p.dump(), outcomeText, pid, nonce)).toThrow();
  const q = probe();
  for (let i = 0; i < 100; i++) q.input("x");
  q.files.set("/evidence/memory-observation.json", outcomeText);
  q.fire(60000);
  expect(q.dump().overflow).toBe(true);
  expect(() => validateDump(q.dump(), outcomeText, pid, nonce)).toThrow();
  const r = probe();
  r.files.set("/evidence/memory-observation.json", outcomeText);
  r.fire(60000);
  const jitter = structuredClone(r.dump());
  jitter.events.at(-1)!.ns = "59999999999";
  expect(() => validateDump(jitter, outcomeText, pid, nonce)).not.toThrow();
  for (const changed of [
    { nonce: "b".repeat(32) },
    { pid: 124 },
    { outcomeText: "different" },
    { events: [] },
  ])
    expect(() =>
      validateDump({ ...r.dump(), ...changed }, outcomeText, pid, nonce),
    ).toThrow();
});

it("allows memory mode only on Windows with absolute evidence and all capture flags absent", () => {
  const config = {
    value: nonce,
    platform: "win32",
    evidence: "C:\\evidence",
    captures: [undefined, undefined, undefined],
  };
  expect(memoryInput(config)).toBe(nonce);
  for (const changed of [
    { platform: "linux" },
    { evidence: "relative" },
    { value: "1" },
    { captures: ["1"] },
    { captures: ["0"] },
  ])
    expect(() => memoryInput({ ...config, ...changed })).toThrow();
});

it.each(["posix", "win32"] as const)(
  "collects a delayed real-probe memory dump with %s paths",
  async (flavor) => {
    const paths = path[flavor];
    const p = probe(true, paths);
    const module = {
      exports: {} as typeof import("../fixtures/snippets-memory-input.cjs"),
    };
    const context = vm.createContext({
      module,
      Buffer,
      Date,
      setTimeout,
      require(name: string) {
        if (name === "node:path") return paths;
        if (name !== "node:fs/promises") return require(name) as unknown;
        return {
          async writeFile(file: string, text: string) {
            p.files.set(file, text);
          },
          async lstat() {
            p.fire(60000);
            return {
              isFile: () => true,
              isSymbolicLink: () => false,
              size: p.files.get(p.file("memory-child.json"))!.length,
            };
          },
          async readFile(file: string) {
            return p.files.get(file);
          },
        };
      },
    });
    vm.runInContext(
      readFileSync("test/fixtures/snippets-memory-input.cjs", "utf8"),
      context,
    );
    const result = await module.exports.observeFirstInsert({
      observe: async () => {
        p.input("  SNIPPETS_INSERT  ");
        p.fire(150);
        expect(p.io).toEqual([]);
      },
      snapshot: () => ({ output: p.output() }),
      evidence: "/evidence",
      pid,
      nonce,
    });
    expect(result.initial.kind).toBe("receipt");
    expect(result.collection.complete).toBe(true);
    expect(p.dump().outcomeText).toBe(
      p.files.get(p.file("memory-observation.json")),
    );
  },
);

it.each(["timer-schedule", "receipt-write-invoked", "receipt-write-returned"])(
  "rejects missing or invalid draft on %s",
  (kind) => {
    const p = probe();
    p.input("  SNIPPETS_INSERT  ");
    p.fire(150);
    p.files.set("/evidence/memory-observation.json", outcomeText);
    p.fire(60000);
    for (const draft of [
      undefined,
      "",
      "00",
      42,
      Buffer.from("SNIPPETS_RUN").toString("hex"),
    ]) {
      const dump = structuredClone(p.dump());
      Object.assign(
        dump.events.find((event) => event.kind === kind)!,
        { draft },
      );
      expect(() => validateDump(dump, outcomeText, pid, nonce)).toThrow();
    }
  },
);

it("rejects orphan receipts and broken producer order in actual dumps", () => {
  const p = probe();
  p.input("  SNIPPETS_INSERT  ");
  p.fire(150);
  p.files.set("/evidence/memory-observation.json", outcomeText);
  p.fire(60000);
  for (const removed of [
    "stdin",
    "timer-cancel",
    "processed",
    "timer-schedule",
    "timer-fire",
    "receipt-write-invoked",
  ]) {
    const dump = structuredClone(p.dump());
    dump.events = dump.events
      .filter((event) => event.kind !== removed)
      .map((event, index) => ({ ...event, sequence: index + 1 }));
    expect(() => validateDump(dump, outcomeText, pid, nonce)).toThrow();
  }
  const dump = structuredClone(p.dump());
  dump.events = [
    ...dump.events.slice(0, 4),
    { sequence: 5, ns: "100", kind: "receipt-write-returned" },
    { sequence: 6, ns: "101", kind: "dump-boundary" },
  ];
  expect(() => validateDump(dump, outcomeText, pid, nonce)).toThrow();
});

it("rejects contradictory callback, cancellation and timer fields", () => {
  const p = probe();
  p.input("  SNIPPETS_INSERT  ");
  p.fire(150);
  p.files.set("/evidence/memory-observation.json", outcomeText);
  p.fire(60000);
  for (const [kind, fields] of [
    ["stdin", { lineBefore: "eA==" }],
    ["timer-cancel", { pending: true }],
    ["timer-fire", { matches: false }],
    ["timer-fire", { line: "eA==" }],
  ] as const) {
    const dump = structuredClone(p.dump());
    Object.assign(
      dump.events.find((event) => event.kind === kind)!,
      fields,
    );
    expect(() => validateDump(dump, outcomeText, pid, nonce)).toThrow();
  }
});

it.each([
  ["unexpected-line", "bad\r"],
  ["line-bound", "x".repeat(4097)],
])(
  "validates %s probe-error fields and callback position",
  (_reason, input) => {
    const p = probe();
    expect(() => p.input(input)).toThrow("unexpected stderr");
    p.files.set("/evidence/memory-observation.json", outcomeText);
    p.fire(60000);
    expect(() => validateDump(p.dump(), outcomeText, pid, nonce)).not.toThrow();
    for (const changed of [
      { reason: undefined },
      { reason: "typo" },
      { lineAfter: undefined },
      { lineAfter: "" },
    ]) {
      const dump = structuredClone(p.dump());
      Object.assign(
        dump.events.find((event) => event.kind === "probe-error")!,
        changed,
      );
      expect(() => validateDump(dump, outcomeText, pid, nonce)).toThrow();
    }
  },
);

it.each(["  SNIPPETS_INSERT  ", "SNIPPETS_RUN"])(
  "retains pending timers and post-observation callback tails for %s",
  (text) => {
    for (const fire of [false, true]) {
      const p = probe();
      p.input(text);
      if (fire) {
        p.fire(150);
        p.input("tail");
      }
      p.files.set("/evidence/memory-observation.json", outcomeText);
      p.fire(60000);
      expect(validateDump(p.dump(), outcomeText, pid, nonce).callbacks).toBe(
        fire ? 2 : 1,
      );
    }
  },
);

it.each(["receipt", "timeout", "error"])(
  "publishes the initial %s only after observation; collection failure never overwrites it",
  async (kind) => {
    const writes = new Map<string, string>();
    let observed = false;
    const module = {
      exports: {} as typeof import("../fixtures/snippets-memory-input.cjs"),
    };
    const context = vm.createContext({
      module,
      Buffer,
      Date,
      setTimeout,
      require(name: string) {
        if (name === "node:path") return path.posix;
        if (name !== "node:fs/promises") return require(name) as unknown;
        return {
          async writeFile(p: string, text: string) {
            expect(observed).toBe(true);
            writes.set(p, text);
          },
          async lstat() {
            throw Object.assign(Error("missing"), { code: "ENOENT" });
          },
        };
      },
    });
    vm.runInContext(
      readFileSync("test/fixtures/snippets-memory-input.cjs", "utf8"),
      context,
    );
    const result = await module.exports.observeFirstInsert({
      observe: async () => {
        observed = true;
        if (kind !== "receipt")
          throw Error(
            kind === "timeout"
              ? "Timed out: controlled probe observed first Insert"
              : "other failure",
          );
      },
      snapshot: () => ({ writes: [] }),
      evidence: "/evidence",
      pid,
      nonce,
      waitMs: 0,
    });
    expect(result.initial.kind).toBe(kind);
    expect(result.collection.complete).toBe(false);
    expect(writes.size).toBe(2);
  },
);
