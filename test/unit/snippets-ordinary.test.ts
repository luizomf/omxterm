// @vitest-environment jsdom
import {
  constants,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  assertAbsentRoots,
  assertColdPause,
  assertDormant,
  assertNoNetwork,
  assertOrdinaryQuit,
  assertSettledFiles,
  mandatoryNetLogTypes,
  ordinaryInputs,
  ordinaryOutcome,
  type ColdPause,
} from "../fixtures/snippets-ordinary";

const require = createRequire(import.meta.url);
const observer = require("../fixtures/snippets-ordinary.cjs") as {
  managementReady(
    document: Document,
    generation: number,
    enabled: boolean,
  ): boolean;
  answerDialog(
    prompt: unknown,
    manualInstall: boolean,
    digest: string,
  ): { kind: string; response: number };
  observeNodeNetwork(
    record: (operation: string) => void,
    modules: unknown,
  ): () => void;
  observeYamlWrites(
    fs: unknown,
    record: (operation: string) => void,
  ): () => void;
};
const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  vi.restoreAllMocks();
});
it("opts out without configuration and rejects partial or substituted ordinary identity", () => {
  expect(ordinaryInputs({})).toBeUndefined();
  Object.defineProperty(process, "platform", { value: "linux" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  vi.spyOn(process, "getuid").mockReturnValue(1000);
  const env = {
    HOME: "/home/test",
    OMXTERM_SNIPPETS_ORDINARY_APPIMAGE: "/tmp/host.AppImage",
    OMXTERM_SNIPPETS_ORDINARY_SHA256: "a".repeat(64),
    OMXTERM_SNIPPETS_ORDINARY_EVIDENCE: "/tmp/evidence",
  };
  expect(ordinaryInputs(env, "/home/test")?.profile).toBe(
    "/home/test/.config/omxterm",
  );
  expect(() =>
    ordinaryInputs({ ...env, HOME: "/temporary/home" }, "/home/test"),
  ).toThrow();
  expect(() =>
    ordinaryInputs({ ...env, NODE_OPTIONS: "--require=x" }, "/home/test"),
  ).toThrow();
  expect(() =>
    ordinaryInputs(
      { ...env, OMXTERM_SNIPPETS_ORDINARY_SHA256: undefined },
      "/home/test",
    ),
  ).toThrow();
  expect(() =>
    ordinaryInputs(
      {
        ...env,
        OMXTERM_SNIPPETS_ORDINARY_EVIDENCE:
          "/home/test/.config/omxterm/evidence",
      },
      "/home/test",
    ),
  ).toThrow();
});
it("requires absent roots and unlinked real ancestors; existing empty is not fresh", () => {
  const root = realpathSync(
    mkdtempSync(path.join(os.tmpdir(), "ordinary-roots-")),
  );
  try {
    const product = path.join(root, "config/omxterm");
    expect(() => assertAbsentRoots([product])).not.toThrow();
    mkdirSync(product, { recursive: true });
    expect(() => assertAbsentRoots([product])).toThrow();
    symlinkSync(path.join(root, "config"), path.join(root, "alias"), "dir");
    expect(() =>
      assertAbsentRoots([path.join(root, "alias/absent")]),
    ).toThrow();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
const entry = "file:///exact/app.asar/dist/main/index.js";
const url = (id: string) =>
  id === "entry" ? entry : "node:internal/modules/esm/module_job";
const loaderHash =
  "1a8f350a32ce47b4e45b2251fc15f4438d322b5b9d227dc74d5f9846fb0ccacf";
const pause = (): ColdPause => ({
  reason: "Break on start",
  hitBreakpoints: [],
  callFrames: [
    {
      callFrameId: "0",
      functionName: "",
      location: { scriptId: "entry", lineNumber: 0, columnNumber: 0 },
      functionLocation: { scriptId: "entry", lineNumber: 0, columnNumber: 0 },
      scopeChain: [{ type: "module" }],
    },
    {
      callFrameId: "1",
      functionName: "#asyncInstantiate",
      location: { scriptId: "loader", lineNumber: 452, columnNumber: 8 },
      functionLocation: { scriptId: "loader", lineNumber: 0, columnNumber: 0 },
      scopeChain: [],
    },
  ],
});
it("accepts only the controlled pre-evaluation pause shape and pinned loader digest", () => {
  expect(() => assertColdPause(pause(), url, entry, loaderHash)).not.toThrow();
  expect(() => assertColdPause(pause(), url, entry, "unknown")).toThrow();
});
it.each([
  "late-reason",
  "breakpoint",
  "wrong-entry",
  "later-location",
  "not-module",
  "evaluation-loader",
  "loader-position",
])("refuses cold-coverage substitution: %s", (control) => {
  const p = pause();
  if (control === "late-reason") p.reason = "other";
  if (control === "breakpoint") p.hitBreakpoints = ["late"];
  if (control === "wrong-entry") p.callFrames[0]!.location.scriptId = "wrong";
  if (control === "later-location") p.callFrames[0]!.location.lineNumber = 1;
  if (control === "not-module") p.callFrames[0]!.scopeChain = [];
  if (control === "evaluation-loader") p.callFrames[1]!.functionName = "run";
  if (control === "loader-position") p.callFrames[1]!.location.lineNumber++;
  expect(() => assertColdPause(p, url, entry, loaderHash)).toThrow();
});
it("forwards Node filesystem calls, catches YAML mutations and restores methods", async () => {
  const open = vi.fn<(...args: unknown[]) => string>(() => "handle");
  const writeFile = vi.fn<(...args: unknown[]) => Promise<string>>(
    async () => "written",
  );
  const rename = vi.fn<(...args: unknown[]) => never>(() => {
    throw Error("original failure");
  });
  const fs = { constants, open, rename, promises: { writeFile } };
  const calls: string[] = [];
  const restore = observer.observeYamlWrites(fs, (operation) =>
    calls.push(operation),
  );
  expect(fs.open("/profile/snippets.yaml", "r")).toBe("handle");
  expect(calls).toEqual([]);
  expect(fs.open("/profile/snippets.yaml", constants.O_CREAT)).toBe("handle");
  expect(await fs.promises.writeFile("snippets.yaml", "synthetic")).toBe(
    "written",
  );
  expect(() => fs.rename("/profile/snippets.yaml", "/hold/file")).toThrow(
    "original failure",
  );
  expect(calls).toEqual(["open", "writeFile", "rename"]);
  expect(open).toHaveBeenCalledWith("/profile/snippets.yaml", "r");
  restore();
  expect(fs.open).toBe(open);
  expect(fs.rename).toBe(rename);
  expect(fs.promises.writeFile).toBe(writeFile);
});
it("observes the product's Node HTTP(S) path and fetch without replacing results or errors", () => {
  const request = vi.fn<(...args: unknown[]) => string>(
    () => "original-request",
  );
  const fetch = vi.fn<(...args: unknown[]) => never>(() => {
    throw Error("original network failure");
  });
  const modules = { http: { request }, https: { request }, global: { fetch } };
  const calls: string[] = [];
  const restore = observer.observeNodeNetwork(
    (operation) => calls.push(operation),
    modules,
  );
  expect(modules.https.request("https://example.invalid")).toBe(
    "original-request",
  );
  expect(() => modules.global.fetch("https://example.invalid")).toThrow(
    "original network failure",
  );
  expect(calls).toEqual(["https.request", "global.fetch"]);
  expect(request).toHaveBeenCalledWith("https://example.invalid");
  restore();
  expect(modules.https.request).toBe(request);
  expect(modules.global.fetch).toBe(fetch);
});
it("requires selected Extensions and the actual committed Snippets generation before capture", () => {
  document.body.innerHTML = `<button id="settings-tab-extensions" aria-selected="true"></button><div class="extensions-panel"><section><p>omxterm.snippets · generation 3 · uninstalled · local inactive</p></section></div>`;
  const doc = document;
  expect(observer.managementReady(doc, 3, false)).toBe(true);
  expect(observer.managementReady(doc, 2, false)).toBe(false);
  doc.querySelector("p")!.textContent =
    "omxterm.files · generation 3 · uninstalled · local inactive";
  expect(observer.managementReady(doc, 3, false)).toBe(false);
  doc.querySelector("p")!.textContent =
    "omxterm.snippets · generation 1 · enabled · local inactive";
  expect(observer.managementReady(doc, 1, true)).toBe(true);
  doc.querySelector("button")!.setAttribute("aria-selected", "false");
  expect(observer.managementReady(doc, 1, true)).toBe(false);
  document.body.replaceChildren();
});
it("answers actual normal-Quit consent separately from local archive trust", () => {
  const quit = {
    title: "Quit OMXTerm",
    type: "question",
    message: "Quit OMXTerm and close all Terminal Windows?",
    buttons: ["Quit", "Cancel"],
    defaultId: 1,
    cancelId: 1,
  };
  expect(observer.answerDialog(quit, false, "digest")).toEqual({
    kind: "quit",
    response: 0,
  });
  expect(() =>
    observer.answerDialog(
      { ...quit, buttons: ["Cancel", "Quit"] },
      false,
      "digest",
    ),
  ).toThrow();
  const trust = { title: "Trust extension code?", detail: "SHA-256: digest" };
  expect(observer.answerDialog(trust, true, "digest")).toEqual({
    kind: "install",
    response: 1,
  });
  expect(() => observer.answerDialog(trust, false, "digest")).toThrow();
  expect(() =>
    observer.answerDialog({ title: "unexpected" }, false, "digest"),
  ).toThrow();
});
it("rejects transient startup activation, YAML mutations and network attempts", () => {
  const state = {
    forks: [],
    views: ["file:///core/index.html"],
    urls: ["file:///core/index.html"],
    yamlWrites: [],
    nodeNetwork: [],
  };
  expect(() => assertDormant(state)).not.toThrow();
  expect(() => assertDormant({ ...state, forks: [{}] })).toThrow();
  expect(() =>
    assertDormant({ ...state, nodeNetwork: ["https.request"] }),
  ).toThrow();
  expect(() =>
    assertDormant({ ...state, urls: ["omx-extension://transient/index.html"] }),
  ).toThrow();
  expect(() => assertDormant({ ...state, yamlWrites: ["open"] })).toThrow();
  const constants = {
    logEventTypes: { ...mandatoryNetLogTypes, URL_REQUEST: 10 },
  };
  expect(() =>
    assertNoNetwork({
      constants,
      events: [{ type: 10, params: { url: "file:///core" } }],
    }),
  ).not.toThrow();
  for (const event of [
    { type: mandatoryNetLogTypes.TCP_CONNECT },
    { type: mandatoryNetLogTypes.UDP_CONNECT },
    { type: mandatoryNetLogTypes.HOST_RESOLVER_MANAGER_REQUEST },
    { type: 10, params: { url: "https://example.invalid/" } },
  ])
    expect(() => assertNoNetwork({ constants, events: [event] })).toThrow();
});

it("rejects missing, invalid, incompatible or unknown NetLog vocabulary/events", () => {
  for (const input of [
    null,
    {},
    { constants: { logEventTypes: {} }, events: [] },
    { constants: { logEventTypes: {} }, events: [{ type: 999 }] },
  ])
    expect(() => assertNoNetwork(input)).toThrow();
  for (const name of Object.keys(mandatoryNetLogTypes)) {
    for (const value of [undefined, null, "50", NaN, -1, 1.5, 999]) {
      expect(() =>
        assertNoNetwork({
          constants: {
            logEventTypes: { ...mandatoryNetLogTypes, [name]: value },
          },
          events: [],
        }),
      ).toThrow();
    }
    const types: Record<string, unknown> = { ...mandatoryNetLogTypes };
    delete types[name];
    expect(() =>
      assertNoNetwork({ constants: { logEventTypes: types }, events: [] }),
    ).toThrow();
  }
  for (const events of [
    undefined,
    {},
    [{ type: 999 }],
    [{ type: NaN }],
    [null],
  ])
    expect(() =>
      assertNoNetwork({
        constants: { logEventTypes: mandatoryNetLogTypes },
        events,
      }),
    ).toThrow();
  expect(() =>
    assertNoNetwork({
      constants: { logEventTypes: mandatoryNetLogTypes },
      events: [],
    }),
  ).not.toThrow();
});

it("rejects activity accumulated after the last live snapshot, even a joined late backend", () => {
  const quiet = {
    forks: [],
    urls: [],
    views: [],
    yamlWrites: [],
    nodeNetwork: [],
    joined: true,
    natural: true,
    quitApprovals: 1,
  };
  expect(() => assertOrdinaryQuit(quiet)).not.toThrow();
  for (const late of [
    { forks: [{ closed: true, exit: { code: 0, signal: null } }] },
    { urls: ["omx-extension://transient/index.html"] },
    { views: ["omx-extension://active/index.html"] },
    { yamlWrites: ["writeFile"] },
    { nodeNetwork: ["https.request"] },
    { joined: false },
    { natural: false },
    { quitApprovals: 0 },
  ])
    expect(() => assertOrdinaryQuit({ ...quiet, ...late })).toThrow();
});

it("requires exact postsettlement registry, permanent witness and YAML presence/bytes", () => {
  const expected = {
    registry: Buffer.from("generation3-tombstone"),
    witness: Buffer.from("snippets-default-attempt-v1\n"),
    yaml: undefined,
  };
  expect(() => assertSettledFiles({ ...expected }, expected)).not.toThrow();
  for (const changed of [
    { registry: Buffer.from("generation1-reprovisioned") },
    { witness: undefined },
    { witness: Buffer.alloc(0) },
    { witness: Buffer.from("changed\n") },
    { yaml: Buffer.from("late YAML") },
  ])
    expect(() =>
      assertSettledFiles({ ...expected, ...changed }, expected),
    ).toThrow();
  const existing = {
    registry: expected.registry,
    witness: undefined,
    yaml: Buffer.from("preserved synthetic YAML"),
  };
  expect(() => assertSettledFiles(existing, existing)).not.toThrow();
  expect(() =>
    assertSettledFiles({ ...existing, yaml: undefined }, existing),
  ).toThrow();
  expect(() =>
    assertSettledFiles({ ...existing, witness: expected.witness }, existing),
  ).toThrow();
});

it("retains original failure objects when recording, integrity, finalization and cleanup also fail", async () => {
  const outcome = ordinaryOutcome();
  const stages = [
    "scenario",
    "failure-receipt",
    "integrity",
    "scratch-cleanup",
    "result-receipt",
  ];
  const errors = stages.map((stage) => Error(stage));
  const attempted: string[] = [];
  for (const [i, stage] of stages.entries())
    await outcome.attempt(stage, () => {
      attempted.push(stage);
      throw errors[i];
    });
  expect(attempted).toEqual(stages);
  expect(outcome.records().map((r) => r.stage)).toEqual(stages);
  try {
    outcome.throwIfFailed("owner failure");
    throw Error("missing failure");
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError);
    const combined = error as AggregateError;
    expect(combined.errors).toEqual(errors);
    for (const [i, original] of errors.entries())
      expect(combined.errors[i]).toBe(original);
  }
  const outer = ordinaryOutcome();
  await outer.attempt("phase", () => outcome.throwIfFailed("phase failure"));
  const secondary = Error("outer integrity failure");
  await outer.attempt("integrity", () => {
    throw secondary;
  });
  expect(() => outer.throwIfFailed("outer failure")).toThrow(AggregateError);
  expect((outer.failures[0]!.error as AggregateError).errors[0]).toBe(
    errors[0],
  );
  expect(outer.failures[1]!.error).toBe(secondary);
});

it("records a secondary-only failure without inventing a primary or retrying work", async () => {
  const outcome = ordinaryOutcome();
  const work = vi.fn(() => undefined);
  await outcome.attempt("scenario", work);
  expect(() => outcome.throwIfFailed("success")).not.toThrow();
  const cleanup = Error("cleanup");
  await outcome.attempt("cleanup", () => {
    throw cleanup;
  });
  expect(work).toHaveBeenCalledOnce();
  expect(outcome.failures).toEqual([{ stage: "cleanup", error: cleanup }]);
});
