import { createRequire } from "node:module";
import type { IPty } from "node-pty";
import { expect, it, vi } from "vitest";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { nativeFixtureEnvironment } from "../fixtures/native-fixture-processes";

const require = createRequire(import.meta.url);
const load = () =>
  require("../fixtures/snippets-source-launch.cjs") as {
    sourceLaunch(input: object): { executable: string; args: string[] };
    childInputCapture(input: {
      value?: string;
      platform: string;
      evidence?: string;
    }): boolean;
  };

it("launches the Windows probe through the joined Electron launcher with literal paths", () => {
  const root = "C:\\scope with spaces\\fixture";
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const electron = "C:\\source tree\\electron.exe";
  expect(
    load().sourceLaunch({
      platform: "win32",
      arch: "arm64",
      root,
      node,
      electron,
    }),
  ).toEqual({
    executable: node,
    args: [
      "C:\\scope with spaces\\fixture\\extension-composition-launch.cjs",
      electron,
      root,
      "-e",
      node,
      "C:\\scope with spaces\\fixture\\snippets-windows-probe.cjs",
    ],
  });
});

it("requires an explicit Windows capture flag and absolute evidence path", () => {
  const capture = load().childInputCapture;
  const input = { platform: "win32", evidence: "C:\\private\\evidence" };
  expect(capture(input)).toBe(false);
  expect(capture({ ...input, value: "1" })).toBe(true);
  expect(() => capture({ ...input, value: "0" })).toThrow();
  expect(() => capture({ ...input, value: "1", platform: "linux" })).toThrow();
  expect(() =>
    capture({ ...input, value: "1", evidence: "relative" }),
  ).toThrow();
  expect(() => capture({ platform: "win32", value: "1" })).toThrow();
});

it("passes capture-only settings through the fixture and literal Windows PTY spawn", () => {
  const evidence = "C:\\private\\evidence";
  const node = "C:\\Program Files\\nodejs\\node.exe";
  const probe = "C:\\scope\\snippets-windows-probe.cjs";
  vi.stubEnv("OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE", "1");
  vi.stubEnv("OMXTERM_SNIPPETS_PACKAGED_EVIDENCE", evidence);
  vi.stubEnv("OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC", undefined);
  try {
    const environment = nativeFixtureEnvironment("C:\\scope");
    const fake = {
      onData: () => ({ dispose() {} }),
      onExit: () => ({ dispose() {} }),
    } as unknown as IPty;
    const spawn = vi.fn<SpawnPty>(() => fake);
    createLocalTerminalSession(spawn, {
      shell: "C:\\Windows\\System32\\cmd.exe",
      launchRequest: {
        kind: "explicit-command",
        executable: node,
        arguments: [probe],
      },
      platform: "win32",
      homeDirectory: "C:\\scope",
      applicationVersionProvider: { getVersion: () => "test" },
      environment,
      onOutput() {},
      onExit() {},
    });
    expect(spawn).toHaveBeenCalledOnce();
    const [executable, args, options] = spawn.mock.calls[0]!;
    expect(executable).toBe(node);
    expect(args).toEqual([probe]);
    expect(options).toMatchObject({ useConptyDll: true });
    expect(options.env).toMatchObject({
      OMXTERM_SNIPPETS_PACKAGED_CHILD_INPUT_CAPTURE: "1",
      OMXTERM_SNIPPETS_PACKAGED_EVIDENCE: evidence,
    });
    expect(
      environment.OMXTERM_SNIPPETS_PACKAGED_INSERT_DIAGNOSTIC,
    ).toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
  }
});

it("refuses Windows x64 without changing the existing Linux and macOS launch", () => {
  const launch = load().sourceLaunch;
  const common = {
    root: "/tmp/fixture",
    node: "/usr/bin/node",
    electron: "/app/electron",
  };
  expect(() => launch({ ...common, platform: "win32", arch: "x64" })).toThrow();
  expect(launch({ ...common, platform: "darwin", arch: "arm64" })).toEqual({
    executable: "/app/electron",
    args: ["/tmp/fixture", "-e", "/bin/sh", "-i"],
  });
  expect(launch({ ...common, platform: "linux", arch: "x64" }).args).toEqual([
    "--no-sandbox",
    "--ozone-platform=x11",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "/tmp/fixture",
    "-e",
    "/bin/sh",
    "-i",
  ]);
});
