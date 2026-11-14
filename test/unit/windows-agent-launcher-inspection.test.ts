import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  inspectWindowsAgentLauncher,
  launcherProbeArgument,
} from "../../scripts/verify-windows-agent-launcher.mjs";

// The packaged launcher check (ADR 0052): a console PE of the build's
// architecture, alone with the client, that hands arguments over as given.
const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});

function pe(machine: number, subsystem: number) {
  const data = Buffer.alloc(256);
  data.writeUInt16LE(0x5a4d, 0);
  data.writeUInt32LE(64, 0x3c);
  data.writeUInt32LE(0x00004550, 64);
  data.writeUInt16LE(machine, 68);
  data.writeUInt16LE(subsystem, 64 + 24 + 68);
  return data;
}

async function resources(files: Record<string, Buffer | string>) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-agent-launcher-"));
  temporary.push(root);
  await mkdir(path.join(root, "agent-ctl"));
  for (const [name, bytes] of Object.entries(files))
    await writeFile(path.join(root, "agent-ctl", name), bytes);
  return root;
}

// The client's answer to the probe argument, when it arrives as given.
const usage = (argument: string) =>
  Object.assign(new Error("usage"), {
    code: argument === launcherProbeArgument ? 2 : 1,
    stderr: `Unknown option ${argument}.\n`,
  });
const echoes = () =>
  vi.fn(async (_file: string, args: string[]) => {
    throw usage(args[0]);
  });

it("accepts a console launcher of the build's architecture", async () => {
  const root = await resources({
    "omxterm-ctl.cjs": "",
    "omxterm-ctl.exe": pe(0xaa64, 3),
  });
  const run = echoes();
  await inspectWindowsAgentLauncher(root, "arm64", run);
  const launcher = path.join(root, "agent-ctl", "omxterm-ctl.exe");
  // Also from the \\?\ form of its path (the same path off Windows).
  expect(run.mock.calls.map(([file, args]) => [file, args])).toEqual([
    [launcher, [launcherProbeArgument]],
    [path.toNamespacedPath(launcher), [launcherProbeArgument]],
  ]);
});

it.each([
  [{ "omxterm-ctl.cmd": "" }, "holds"],
  [{ "omxterm-ctl.exe": pe(0x8664, 3) }, "not an arm64 PE"],
  [{ "omxterm-ctl.exe": pe(0xaa64, 2) }, "not a console program"],
])("refuses a packaged client that is wrong: %#", async (change, message) => {
  const root = await resources({
    "omxterm-ctl.cjs": "",
    "omxterm-ctl.exe": pe(0xaa64, 3),
    ...change,
  });
  await expect(
    inspectWindowsAgentLauncher(root, "arm64", echoes()),
  ).rejects.toThrow(message);
});

it("refuses a launcher that changes the arguments", async () => {
  const root = await resources({
    "omxterm-ctl.cjs": "",
    "omxterm-ctl.exe": pe(0x8664, 3),
  });
  const reparsed = vi.fn(async () => {
    throw Object.assign(new Error("usage"), {
      code: 2,
      stderr: "Unknown option --x a.\n",
    });
  });
  await expect(
    inspectWindowsAgentLauncher(root, "x64", reparsed),
  ).rejects.toThrow("changed its arguments");
});

it("refuses a launcher that only works from its plain path", async () => {
  const root = await resources({
    "omxterm-ctl.cjs": "",
    "omxterm-ctl.exe": pe(0xaa64, 3),
  });
  let runs = 0;
  const plainOnly = vi.fn(async (_file: string, args: string[]) => {
    runs += 1;
    if (runs === 1) throw usage(args[0]);
    throw Object.assign(new Error("start"), {
      code: 1,
      stderr: "omxterm-ctl: can't start OMXTerm\n",
    });
  });
  await expect(
    inspectWindowsAgentLauncher(root, "arm64", plainOnly),
  ).rejects.toThrow("changed its arguments");
  expect(runs).toBe(2);
});

it.each(["ELECTRON_RUN_AS_NODE", "Electron_Run_As_Node"])(
  "refuses a launcher that leaves Node mode to its caller's %s",
  async (name) => {
    vi.stubEnv(name, "1");
    const root = await resources({
      "omxterm-ctl.cjs": "",
      "omxterm-ctl.exe": pe(0xaa64, 3),
    });
    // Without the variable, OMXTerm.exe starts as the GUI app: no usage
    // error, exit 0.
    const forgetful = vi.fn(
      async (
        _file: string,
        args: string[],
        options: { env: Record<string, string | undefined> },
      ) => {
        const node = Object.entries(options.env).some(
          ([key, value]) =>
            key.toUpperCase() === "ELECTRON_RUN_AS_NODE" && value === "1",
        );
        if (node) throw usage(args[0]);
        return { stdout: "", stderr: "" };
      },
    );
    await expect(
      inspectWindowsAgentLauncher(root, "arm64", forgetful),
    ).rejects.toThrow("changed its arguments");
  },
);
