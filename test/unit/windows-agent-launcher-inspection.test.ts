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
const echoes = () =>
  vi.fn(async (_file: string, args: string[]) => {
    throw Object.assign(new Error("usage"), {
      code: args[0] === launcherProbeArgument ? 2 : 1,
      stderr: `Unknown option ${args[0]}.\n`,
    });
  });

it("accepts a console launcher of the build's architecture", async () => {
  const root = await resources({
    "omxterm-ctl.cjs": "",
    "omxterm-ctl.exe": pe(0xaa64, 3),
  });
  const run = echoes();
  await inspectWindowsAgentLauncher(root, "arm64", run);
  expect(run).toHaveBeenCalledWith(
    path.join(root, "agent-ctl", "omxterm-ctl.exe"),
    [launcherProbeArgument],
    expect.anything(),
  );
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
