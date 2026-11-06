import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appImageEnvironment,
  appImageInputs,
} from "../fixtures/snippets-appimage-inputs";

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
const getuid = Object.getOwnPropertyDescriptor(process, "getuid");
beforeEach(() => {
  Object.defineProperty(process, "platform", { value: "linux" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  Object.defineProperty(process, "getuid", {
    configurable: true,
    value: () => 1000,
  });
  vi.spyOn(os, "userInfo").mockReturnValue({
    ...os.userInfo(),
    shell: "/bin/bash",
  });
});
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  if (getuid) Object.defineProperty(process, "getuid", getuid);
  else Reflect.deleteProperty(process, "getuid");
  vi.restoreAllMocks();
});
function inputs() {
  return Object.fromEntries(
    Object.entries({
      APPIMAGE: "/host.AppImage",
      APPIMAGE_SHA256: "a".repeat(64),
      ARCHIVE: "/snippets.omxext",
      ARCHIVE_SHA256: "b".repeat(64),
      VERSION: "0.24.0-dev.30",
      EVIDENCE: "/evidence",
    }).map(([key, value]) => ["OMXTERM_SNIPPETS_APPIMAGE_" + key, value]),
  );
}

describe("exact AppImage account-shell environment", () => {
  it("retains only selected desktop admission and system-tool paths, not source overrides", () => {
    const root = "/synthetic-appimage-root";
    const env = appImageEnvironment(root, {
      PATH: "/source/node_modules/.bin:/source/bin",
      HOME: "/source/home",
      NODE_OPTIONS: "--require=/source/observer.cjs",
      ELECTRON_RUN_AS_NODE: "1",
      DISPLAY: ":0",
      LANG: "C",
    });
    expect(env).toEqual({
      HOME: path.join(root, "home"),
      PATH: `${path.join(root, "bin")}:/usr/bin:/bin`,
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
      XDG_DATA_HOME: path.join(root, "data"),
      DISPLAY: ":0",
      LANG: "C",
    });
  });

  it.skipIf(process.platform !== "linux")(
    "admits actual account-shell system helpers without source PATH inheritance",
    () => {
      const root = mkdtempSync(path.join(os.tmpdir(), "snippets-shell-env-"));
      mkdirSync(path.join(root, "home"));
      mkdirSync(path.join(root, "bin"));
      try {
        const env = appImageEnvironment(root, {
          LANG: "C",
          PATH: "/source/node_modules/.bin",
          NODE_OPTIONS: "--require=/source/observer.cjs",
        });
        const result = spawnSync(
          "/bin/bash",
          [
            "-l",
            "-i",
            "-c",
            "command -v grep >/dev/null && command -v tr >/dev/null && printf 'SHELL_READY\\n'",
          ],
          { env, input: "", encoding: "utf8", timeout: 5000 },
        );
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain("SHELL_READY");
        expect(result.stderr).not.toMatch(
          /grep: command not found|tr: command not found/,
        );
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});

describe("exact AppImage admission and independent expected receipt", () => {
  it.each([
    ["arm64", "ARM64"],
    ["x64", "x64"],
  ])(
    "admits Linux %s without changing artifact inputs",
    (architecture, label) => {
      Object.defineProperty(process, "arch", { value: architecture });
      expect(appImageInputs(inputs())).toEqual({
        APPIMAGE: "/host.AppImage",
        APPIMAGE_SHA256: "a".repeat(64),
        ARCHIVE: "/snippets.omxext",
        ARCHIVE_SHA256: "b".repeat(64),
        VERSION: "0.24.0-dev.30",
        EVIDENCE: "/evidence",
        input: `synthetic Chromium/X11; controlled native consent; production Linux ${label} composition`,
      });
    },
  );
  it("skips only absent configuration and rejects each missing or empty input", () => {
    expect(appImageInputs({})).toBeUndefined();
    expect(
      appImageInputs({ OMXTERM_SNIPPETS_APPIMAGE_VERSION: undefined }),
    ).toBeUndefined();
    for (const key of Object.keys(inputs())) {
      const missing = inputs();
      delete missing[key];
      expect(() => appImageInputs(missing)).toThrow("required");
      expect(() => appImageInputs({ ...inputs(), [key]: "" })).toThrow(
        "required",
      );
    }
    expect(() =>
      appImageInputs({ OMXTERM_SNIPPETS_APPIMAGE_UNKNOWN: "set" }),
    ).toThrow("required");
  });
  it.each([
    ["darwin", "arm64"],
    ["win32", "x64"],
    ["linux", "ia32"],
    ["linux", "riscv64"],
  ])(
    "refuses unsupported %s/%s instead of labeling it x64",
    (system, architecture) => {
      Object.defineProperty(process, "platform", { value: system });
      Object.defineProperty(process, "arch", { value: architecture });
      expect(() => appImageInputs(inputs())).toThrow();
    },
  );
  it("preserves nonroot and real POSIX account-shell prerequisites", () => {
    Object.defineProperty(process, "getuid", { value: () => 0 });
    expect(() => appImageInputs(inputs())).toThrow();
    Object.defineProperty(process, "getuid", { value: () => 1000 });
    vi.mocked(os.userInfo).mockReturnValue({
      ...os.userInfo(),
      shell: "/bin/fish",
    });
    expect(() => appImageInputs(inputs())).toThrow(
      "POSIX sh/bash account shell",
    );
  });
  it("refuses mixed source/DMG inputs, relative paths and malformed digests", () => {
    for (const key of [
      "OMXTERM_SNIPPETS_PACKAGED_ENTRY",
      "OMXTERM_SNIPPETS_PACKAGED_EVIDENCE",
      "OMXTERM_SNIPPETS_DMG_DMG",
      "OMXTERM_SNIPPETS_DMG_QUARTZ_TOOL",
    ])
      expect(() => appImageInputs({ ...inputs(), [key]: "/other" })).toThrow(
        "one Snippets adapter",
      );
    for (const key of ["APPIMAGE", "ARCHIVE", "EVIDENCE"])
      expect(() =>
        appImageInputs({
          ...inputs(),
          ["OMXTERM_SNIPPETS_APPIMAGE_" + key]: "relative",
        }),
      ).toThrow("absolute");
    for (const key of ["APPIMAGE_SHA256", "ARCHIVE_SHA256"])
      expect(() =>
        appImageInputs({
          ...inputs(),
          ["OMXTERM_SNIPPETS_APPIMAGE_" + key]: "not-a-digest",
        }),
      ).toThrow();
  });
});
