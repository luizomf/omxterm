import * as childProcess from "node:child_process";
import * as files from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";

vi.mock("node:child_process", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("esbuild", () => ({ build: vi.fn(async () => ({})) }));

const actual = await vi.importActual<typeof files>("node:fs/promises");
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const builder = await vi.importActual<typeof import("esbuild")>("esbuild");
const supervisorProgram = (
  await builder.build({
    entryPoints: ["test/fixtures/native-fixture-supervisor.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  })
).outputFiles[0]!.text;
const parent = {
  pid: process.pid + 100,
  parent: 1,
  identity: "639000000000000001",
};
const current = { pid: process.pid, parent: 1, identity: "639000000000000101" };
const outcome = {
  exitCode: 0,
  signal: null,
  reason: "exit",
  stdout: "",
  stderr: "",
  cleanupErrors: [],
};
let base: string;
let root: string;
let oldRoot: string;
let blocked: string;
let evidence: string;
let oldEvidence: string;
let request: Record<string, unknown>;
let receipt: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.mocked(files.rename).mockImplementation(actual.rename);
  vi.mocked(files.mkdtemp).mockImplementation(actual.mkdtemp);
  vi.mocked(files.lstat).mockImplementation(actual.lstat);
  base = await actual.mkdtemp(path.join(tmpdir(), "omxterm-recovery-"));
  oldRoot = path.join(base, "old-profile");
  root = path.join(base, "new-profile");
  const scope = path.join(base, "evidence");
  await actual.mkdir(scope);
  await actual.mkdir(oldRoot);
  await actual.mkdir(root);
  await actual.mkdir(path.join(oldRoot, "native-process-ownership"));
  await actual.writeFile(
    path.join(oldRoot, "native-fixture-supervisor.cjs"),
    "retained compiled supervisor",
  );
  oldEvidence = path.join(scope, "old.json");
  evidence = path.join(scope, "new.json");
  blocked = path.join(scope, "ownership-blocked.json");
  request = {
    root: oldRoot,
    evidencePath: oldEvidence,
    executable: process.execPath,
    args: [],
    timeout: 1000,
    cancellationToken: "old-token",
    parent,
    externalChild: true,
  };
  await actual.writeFile(
    path.join(oldRoot, "supervisor-request.json"),
    JSON.stringify(request),
  );
  receipt = JSON.stringify({ root: oldRoot, evidencePath: oldEvidence }) + "\n";
  await actual.writeFile(blocked, receipt);
  Object.defineProperty(process, "platform", { value: "win32" });
  vi.spyOn(childProcess, "execFileSync").mockImplementation((_file, args) => {
    if (String(args?.at(-1)).includes("Invoke-CimMethod")) {
      // The new fixture completes without starting a real process.
      return "987654\n";
    }
    // Real Windows CIM inventories include the System Idle Process (PID 0).
    return JSON.stringify([
      { pid: 0, parent: 0, identity: "639000000000000001" },
      current,
    ]);
  });
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("Supervisor exited"), { code: "ESRCH" });
  });
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", platform);
  await actual.rm(base, { recursive: true, force: true });
});

function run(signal = new AbortController().signal, profile = root) {
  return runNativeFixture({
    executable: process.execPath,
    args: [],
    root: profile,
    evidencePath: evidence,
    timeout: 1000,
    testContext: { signal, onTestFinished: vi.fn() },
    prepare: async () => {
      await actual.writeFile(evidence, JSON.stringify(outcome));
    },
  });
}

it("archives an abandoned Windows pre-bootstrap receipt and permits a fresh fixture without deleting old evidence", async () => {
  await expect(run()).resolves.toEqual(outcome);
  expect(existsSync(blocked)).toBe(false);
  expect(
    await actual.readFile(
      path.join(oldRoot, "supervisor-request.json"),
      "utf8",
    ),
  ).toBe(JSON.stringify(request));
  expect(existsSync(oldEvidence)).toBe(false);
  const archives = (await actual.readdir(path.dirname(blocked))).filter(
    (name) => name.startsWith("ownership-blocked-recovered-"),
  );
  expect(archives).toHaveLength(1);
  expect(
    await actual.readFile(
      path.join(path.dirname(blocked), archives[0]!, "ownership-blocked.json"),
      "utf8",
    ),
  ).toBe(receipt);
  expect(childProcess.spawn).not.toHaveBeenCalled();
});

async function refused(reason: string) {
  await expect(run()).rejects.toThrow(reason);
  expect(existsSync(blocked)).toBe(true);
  expect(existsSync(oldRoot)).toBe(true);
  expect(existsSync(evidence)).toBe(false);
  expect(childProcess.spawn).not.toHaveBeenCalled();
  expect(childProcess.fork).not.toHaveBeenCalled();
  expect(
    vi
      .mocked(childProcess.execFileSync)
      .mock.calls.some(([, args]) =>
        String(args?.at(-1)).includes("Invoke-CimMethod"),
      ),
  ).toBe(false);
}

it("serializes concurrent receipt inspections without archiving twice", async () => {
  const another = path.join(base, "another-profile");
  await actual.mkdir(another);
  const results = await Promise.all([run(), run(undefined, another)]);
  expect(results).toEqual([outcome, outcome]);
  expect(
    (await actual.readdir(path.dirname(blocked))).filter((name) =>
      name.startsWith("ownership-blocked-recovered-"),
    ),
  ).toHaveLength(1);
});

it("refuses PID zero as an authorizing parent", async () => {
  request.parent = { ...parent, pid: 0 };
  await actual.writeFile(
    path.join(oldRoot, "supervisor-request.json"),
    JSON.stringify(request),
  );
  await refused("unrecognized or mismatched external-child request");
});

it("refuses a still-live authorizing parent", async () => {
  vi.mocked(childProcess.execFileSync).mockReturnValue(
    JSON.stringify([parent, current]),
  );
  await refused("authorizing parent incarnation is still alive");
});

it("does not confuse a reused PID with the dead authorizing incarnation", async () => {
  const inventory = vi
    .mocked(childProcess.execFileSync)
    .getMockImplementation()!;
  vi.mocked(childProcess.execFileSync).mockImplementation(
    (file, args, options) =>
      String(args?.at(-1)).includes("Invoke-CimMethod")
        ? inventory(file, args, options)
        : JSON.stringify([
            current,
            { ...parent, identity: "639000000000000002" },
          ]),
  );
  await expect(run()).resolves.toEqual(outcome);
  expect(childProcess.spawn).not.toHaveBeenCalled();
});

it.each([
  "supervisor-ready",
  "native-bootstrap-pending",
  "native-process.json",
  "native-exit.json",
  "native-stdout",
  "native-stderr",
  "native-cancel.json",
  "native-process-ownership/pending.tmp",
  "native-process-ownership/registered.json",
])(
  "retains uncertain ownership when %s exists despite an empty inventory",
  async (name) => {
    await actual.writeFile(path.join(oldRoot, name), "{}");
    vi.mocked(childProcess.execFileSync).mockReturnValue("[]");
    await refused(
      name.includes("ownership/")
        ? "process ownership entries remain"
        : "bootstrap, supervisor progress or outcome evidence exists",
    );
  },
);

it.each([
  "supervisor-request.json",
  "native-fixture-supervisor.cjs",
  "native-process-ownership",
])("does not recover an incomplete profile missing %s", async (name) => {
  await actual.rm(path.join(oldRoot, name), { recursive: true });
  await refused("retained files unavailable or invalid");
});

it("does not reinterpret a completed outcome as pre-bootstrap proof", async () => {
  await actual.writeFile(oldEvidence, JSON.stringify(outcome));
  await refused("bootstrap, supervisor progress or outcome evidence exists");
  expect(await actual.readFile(oldEvidence, "utf8")).toBe(
    JSON.stringify(outcome),
  );
});

it.each([
  "{private-injected-text",
  JSON.stringify({ externalChild: "true" }),
  JSON.stringify({ ...parent, externalChild: true }),
])(
  "refuses malformed or unrecognized requests without echoing their contents (%#)",
  async (text) => {
    await actual.writeFile(path.join(oldRoot, "supervisor-request.json"), text);
    await expect(run()).rejects.toThrow("automatic recovery refused");
    await expect(run()).rejects.not.toThrow("private-injected-text");
    expect(existsSync(blocked)).toBe(true);
  },
);

it.each(["root", "evidencePath", "externalChild", "parent"])(
  "refuses a mismatched or invalid request field %s",
  async (field) => {
    await actual.writeFile(
      path.join(oldRoot, "supervisor-request.json"),
      JSON.stringify({
        ...request,
        [field]:
          field === "externalChild"
            ? false
            : field === "parent"
              ? { ...parent, identity: 639000000000000000 }
              : path.join(base, "other"),
      }),
    );
    await refused("unrecognized or mismatched external-child request");
  },
);

it.each(["{private-injected-text", "null", "{}"])(
  "refuses invalid stop receipts (%#)",
  async (text) => {
    await actual.writeFile(blocked, text);
    await refused("automatic recovery refused");
    await expect(run()).rejects.not.toThrow("private-injected-text");
  },
);

it("refuses a missing profile rather than treating absence as settlement", async () => {
  await actual.rm(oldRoot, { recursive: true });
  await expect(run()).rejects.toThrow("retained files unavailable or invalid");
  expect(existsSync(blocked)).toBe(true);
  expect(existsSync(evidence)).toBe(false);
});

it("does not treat the temporary area itself as a fixture profile", async () => {
  await actual.writeFile(
    blocked,
    JSON.stringify({ root: tmpdir(), evidencePath: oldEvidence }),
  );
  await refused("profile is outside the temporary fixture area");
});

it("refuses a receipt pointing outside its evidence scope", async () => {
  await actual.writeFile(
    blocked,
    JSON.stringify({
      root: oldRoot,
      evidencePath: path.join(base, "foreign.json"),
    }),
  );
  await refused("receipt evidence scope mismatch");
});

it.each(["failure", "malformed", "invalid rows", "spoofed diagnostic"])(
  "keeps the stop on process inspection %s",
  async (mode) => {
    vi.mocked(childProcess.execFileSync).mockImplementation(() => {
      if (mode === "failure") throw new Error("private native error payload");
      if (mode === "spoofed diagnostic")
        throw new Error(
          "Native fixture ownership unresolved; automatic recovery refused: private native error payload",
        );
      return mode === "malformed" ? "{" : JSON.stringify([{ pid: parent.pid }]);
    });
    await refused("process identity inspection unavailable");
    await expect(run()).rejects.not.toThrow("private native error payload");
  },
);

it.each(["rename", "mkdtemp"] as const)(
  "retains the stop on archival %s failure",
  async (operation) => {
    vi.spyOn(files, operation).mockRejectedValue(
      new Error("private filesystem payload"),
    );
    await refused("receipt archival failed");
    expect(await actual.readFile(blocked, "utf8")).toBe(receipt);
  },
);

it.each(["receipt", "profile", "request", "bootstrap"])(
  "refuses %s replacement during recovery",
  async (target) => {
    const mkdir = vi.spyOn(files, "mkdtemp");
    mkdir.mockImplementation(async (...args) => {
      const result = await actual.mkdtemp(...args);
      if (String(args[0]).includes("ownership-blocked-recovered-")) {
        if (target === "bootstrap")
          await actual.writeFile(
            path.join(oldRoot, "native-bootstrap-pending"),
            "pending",
          );
        else {
          const source =
            target === "receipt"
              ? blocked
              : target === "profile"
                ? oldRoot
                : path.join(oldRoot, "supervisor-request.json");
          await actual.rename(source, source + ".preserved");
          if (target === "profile") await actual.mkdir(source);
          else
            await actual.writeFile(
              source,
              target === "receipt" ? receipt : JSON.stringify(request),
            );
        }
      }
      return result;
    });
    await refused("retained evidence changed during inspection");
  },
);

it("does not bypass a dangling stop-receipt symlink", async () => {
  await actual.unlink(blocked);
  await actual.symlink(path.join(base, "missing"), blocked);
  await expect(run()).rejects.toThrow(
    "unrecognized profile or receipt filesystem entry",
  );
  expect((await actual.lstat(blocked)).isSymbolicLink()).toBe(true);
  expect(existsSync(evidence)).toBe(false);
});

it("refuses a linked profile without changing its target", async () => {
  const original = oldRoot + "-original";
  await actual.rename(oldRoot, original);
  await actual.symlink(original, oldRoot, "junction");
  await refused("unrecognized profile or receipt filesystem entry");
  expect(
    await actual.readFile(
      path.join(original, "supervisor-request.json"),
      "utf8",
    ),
  ).toBe(JSON.stringify(request));
});

it("leaves POSIX ownership blocked without process inspection", async () => {
  Object.defineProperty(process, "platform", { value: "darwin" });
  await refused("Windows pre-bootstrap recovery only");
  expect(childProcess.execFileSync).not.toHaveBeenCalled();
});

it.each(["entry", "inspection", "after archive"])(
  "does not prepare or launch after cancellation at %s",
  async (stage) => {
    const controller = new AbortController();
    const failure = new Error("test cancelled");
    if (stage === "entry") controller.abort(failure);
    else if (stage === "inspection")
      vi.mocked(childProcess.execFileSync).mockImplementation(() => {
        controller.abort(failure);
        return JSON.stringify([current]);
      });
    else
      vi.spyOn(files, "rename").mockImplementation(async (...args) => {
        await actual.rename(...args);
        controller.abort(failure);
      });
    await expect(run(controller.signal)).rejects.toBe(failure);
    expect(existsSync(evidence)).toBe(false);
    expect(existsSync(oldRoot)).toBe(true);
    expect(existsSync(blocked)).toBe(stage !== "after archive");
  },
);

it("clears an in-memory stop only after recovering its durable receipt", async () => {
  await actual.rm(blocked);
  // Fail WMI after the runner has durably published its request. This sets both
  // the real runner's in-memory block and its stop receipt.
  vi.mocked(childProcess.execFileSync).mockImplementation((_file, args) => {
    if (String(args?.at(-1)).includes("Invoke-CimMethod"))
      throw new Error("WMI handoff failed");
    return JSON.stringify([current]);
  });
  // Make this test's profile genuinely fresh for the first launch.
  await actual.rm(path.join(oldRoot, "native-process-ownership"), {
    recursive: true,
  });
  await expect(
    runNativeFixture({
      executable: process.execPath,
      args: [],
      root: oldRoot,
      evidencePath: oldEvidence,
      timeout: 1000,
    }),
  ).rejects.toThrow("WMI handoff failed");
  expect(existsSync(blocked)).toBe(true);
  await actual.rename(blocked, blocked + ".held");
  await expect(run()).rejects.toThrow("retained files unavailable or invalid");
  expect(existsSync(evidence)).toBe(false);
  await actual.rename(blocked + ".held", blocked);
  await expect(run()).rejects.toThrow(
    "authorizing parent incarnation is still alive",
  );
  const replacement = { ...current, identity: "639000000000000102" };
  vi.mocked(childProcess.execFileSync).mockImplementation((_file, args) =>
    String(args?.at(-1)).includes("Invoke-CimMethod")
      ? "987654"
      : JSON.stringify([replacement]),
  );
  await expect(run()).resolves.toEqual(outcome);
  // A subsequent call in the same module/scope must not retain the cached stop.
  root = path.join(base, "third-profile");
  await actual.mkdir(root);
  await expect(run()).resolves.toEqual(outcome);
});

it("a delayed external-child supervisor cannot launch native work, but may still remove its old profile", async () => {
  await expect(run()).resolves.toEqual(outcome);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let removing!: () => void;
  const cleanup = new Promise<void>((resolve) => {
    removing = resolve;
  });
  let exited!: () => void;
  const exit = new Promise<void>((resolve) => {
    exited = resolve;
  });
  const spawn = vi.fn(() => {
    throw new Error("Native spawn forbidden");
  });
  const supervisor = Object.assign(new EventEmitter(), {
    argv: ["node", "supervisor", path.join(oldRoot, "supervisor-request.json")],
    platform: "win32",
    connected: false,
    env: {},
    exit: vi.fn(() => {
      exited();
    }),
  });
  const require = createRequire(import.meta.url);
  // Run the actual bundled supervisor with only OS process I/O substituted.
  // Delayed creation is controlled, not evidence of real WMI/Job behavior.
  runInNewContext(supervisorProgram, {
    process: supervisor,
    Buffer,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    require: (name: string) => {
      if (name === "node:child_process")
        return {
          spawn,
          execFileSync: () => JSON.stringify([current]),
        };
      if (name === "node:fs/promises")
        return {
          ...actual,
          rm: async (...args: Parameters<typeof actual.rm>) => {
            removing();
            await held;
            return actual.rm(...args);
          },
        };
      return require(name) as unknown;
    },
  });
  try {
    await Promise.race([
      cleanup,
      exit.then(() => {
        throw new Error("Supervisor exited before held cleanup");
      }),
    ]);
    expect(supervisor.exit).not.toHaveBeenCalled();
    expect(existsSync(oldRoot)).toBe(true);
    expect(spawn).not.toHaveBeenCalled();
  } finally {
    release();
    await exit;
  }
  expect(spawn).not.toHaveBeenCalled();
  expect(existsSync(oldRoot)).toBe(false);
  expect(JSON.parse(await actual.readFile(oldEvidence, "utf8"))).toMatchObject({
    reason: "parent-disconnected",
    cleanupErrors: [],
    ownedProcesses: [],
  });
  expect(existsSync(root)).toBe(true);
});
