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
  ordinaryInputs,
  type ColdPause,
} from "../fixtures/snippets-ordinary";

const require = createRequire(import.meta.url);
const observer = require("../fixtures/snippets-ordinary.cjs") as {
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
it("rejects transient startup activation, YAML mutations and network attempts", () => {
  const state = {
    forks: [],
    views: ["file:///core/index.html"],
    urls: ["file:///core/index.html"],
    yamlWrites: [],
  };
  expect(() => assertDormant(state)).not.toThrow();
  expect(() => assertDormant({ ...state, forks: [{}] })).toThrow();
  expect(() =>
    assertDormant({ ...state, urls: ["omx-extension://transient/index.html"] }),
  ).toThrow();
  expect(() => assertDormant({ ...state, yamlWrites: ["open"] })).toThrow();
  const constants = {
    logEventTypes: {
      TCP_CONNECT: 1,
      UDP_CONNECT: 2,
      HOST_RESOLVER_MANAGER_REQUEST: 3,
    },
  };
  expect(() =>
    assertNoNetwork({
      constants,
      events: [{ type: 10, params: { url: "file:///core" } }],
    }),
  ).not.toThrow();
  for (const event of [
    { type: 1 },
    { type: 2 },
    { type: 3 },
    { type: 10, params: { url: "https://example.invalid/" } },
  ])
    expect(() => assertNoNetwork({ constants, events: [event] })).toThrow();
});
