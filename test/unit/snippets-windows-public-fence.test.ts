import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  assertOutsideInstalledPrefix,
  createPublicInstallerFence,
} from "../fixtures/snippets-windows-public-fence";

const temp = "C:\\Temp";
const root = "C:\\Temp\\omxterm-installed-abc123";
const installer = "C:\\download\\installer.exe";
const uninstaller =
  "C:\\Temp\\omxterm-uninstaller-abc123\\Uninstall OMXTerm.exe";
const clean = {
  exitCode: 0,
  signal: null,
  reason: "exit",
  stdout: "",
  stderr: "",
  cleanupErrors: [],
};
const executor = vi.fn(async () => ({ stdout: "", stderr: "" }));
let lane: string;
beforeEach(async () => {
  lane = await mkdtemp(path.join(os.tmpdir(), "public-fence-"));
});
afterEach(async () => {
  await rm(lane, { recursive: true, force: true });
  executor.mockClear();
});
function fence() {
  return createPublicInstallerFence({
    installer,
    temporaryDirectory: temp,
    projectRoot: process.cwd(),
    systemRoot: "C:\\Windows",
    evidenceDirectory: lane,
    execute: executor,
  });
}
async function bind(f: ReturnType<typeof fence>) {
  await f.execute(installer, ["/S", `/D=${root}`], { timeout: 120000 });
}
const uninstall = (f: ReturnType<typeof fence>) =>
  f.execute(uninstaller, ["/S", "/currentuser", `_?=${root}`], {
    timeout: 120000,
  });

it("allows only the reviewed installer and pre-callback relocated rollback", async () => {
  const f = fence();
  await bind(f);
  await uninstall(f);
  expect(executor).toHaveBeenCalledTimes(2);
  await expect(
    f.execute("C:\\other.exe", [], { timeout: 120000 }),
  ).rejects.toThrow();
  await expect(
    f.execute(uninstaller, ["/S", `/D=${root}`], { timeout: 120000 }),
  ).rejects.toThrow();
});
it("keeps callback failures unresolved and refuses relocated cleanup", async () => {
  const f = fence();
  await bind(f);
  await expect(
    f.verifyInstalled(root, async () => {
      throw new Error("primary");
    }),
  ).rejects.toThrow("primary");
  await expect(uninstall(f)).rejects.toThrow("unresolved");
  expect(executor).toHaveBeenCalledTimes(1);
});
it.each(["missing", "malformed", "mismatch", "cleanup", "rejected", "stale"])(
  "does not unlock on %s evidence",
  async (mode) => {
    const receipt = path.join(lane, "supervisor.json");
    const f = fence();
    await bind(f);
    if (mode === "stale") await writeFile(receipt, JSON.stringify(clean));
    await expect(
      f.verifyInstalled(root, async (run) =>
        run(receipt, async () => {
          if (mode !== "missing")
            await writeFile(
              receipt,
              mode === "malformed"
                ? "{"
                : JSON.stringify(
                    mode === "mismatch"
                      ? { ...clean, stdout: "different" }
                      : clean,
                  ),
            );
          if (mode === "rejected") throw new Error("settled-looking rejection");
          return mode === "cleanup"
            ? { ...clean, cleanupErrors: ["uncertain"] }
            : clean;
        }),
      ),
    ).rejects.toThrow();
    await expect(uninstall(f)).rejects.toThrow("unresolved");
  },
);
it("does not treat a receipt alone as settlement", async () => {
  const receipt = path.join(lane, "supervisor.json");
  const f = fence();
  await bind(f);
  await f.verifyInstalled(root, async () => {
    await writeFile(receipt, JSON.stringify(clean));
  });
  await expect(uninstall(f)).rejects.toThrow("unresolved");
});

it("keeps cleanup fenced until the native operation actually returns", async () => {
  const receipt = path.join(lane, "supervisor.json");
  const f = fence();
  await bind(f);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const callback = f.verifyInstalled(root, (run) =>
    run(receipt, async () => {
      await writeFile(receipt, JSON.stringify(clean));
      await pending;
      return clean;
    }),
  );
  await expect(uninstall(f)).rejects.toThrow("unresolved");
  release();
  await callback;
  await uninstall(f);
});

it("unlocks only on the returned matching joined result before later assertions", async () => {
  const receipt = path.join(lane, "supervisor.json");
  const f = fence();
  await bind(f);
  await expect(
    f.verifyInstalled(root, async (run) => {
      await run(receipt, async () => {
        await writeFile(receipt, JSON.stringify(clean));
        return clean;
      });
      throw new Error("scenario failed");
    }),
  ).rejects.toThrow("scenario failed");
  await uninstall(f);
  expect(executor).toHaveBeenCalledTimes(2);
});
it("treats the NSIS termination scope as a case-insensitive string prefix", () => {
  expect(() =>
    assertOutsideInstalledPrefix(root, [root + "-tools\\node.exe"]),
  ).toThrow();
  expect(() =>
    assertOutsideInstalledPrefix(root, [root.toUpperCase() + "\\profile"]),
  ).toThrow();
  expect(() =>
    assertOutsideInstalledPrefix(root, ["C:\\Temp\\unrelated\\node.exe"]),
  ).not.toThrow();
});
it("forwards only the exact read-only inspection shape", async () => {
  const f = fence();
  const ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const args = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    path.join(process.cwd(), "scripts", "inspect-windows-installation.ps1"),
    "-Guid",
    "0ccdd15e-3293-50d3-aa93-6b1e5d7594b5",
  ];
  await f.execute(ps, args, { timeout: 30000, maxBuffer: 65536 });
  await expect(
    f.execute(ps, [...args, "-Command", "unsafe"], {
      timeout: 30000,
      maxBuffer: 65536,
    }),
  ).rejects.toThrow();
  expect(executor).toHaveBeenCalledTimes(1);
});
it("allows joined nonzero settlement but does not turn it into success", async () => {
  const receipt = path.join(lane, "supervisor.json");
  const f = fence();
  await bind(f);
  const failed = { ...clean, exitCode: 1, reason: "timeout" };
  const returned = await f.verifyInstalled(root, (run) =>
    run(receipt, async () => {
      await writeFile(receipt, JSON.stringify(failed));
      return failed;
    }),
  );
  expect(returned).toEqual(failed);
  await uninstall(f);
});
it("rejects an installed root different from /D", async () => {
  const f = fence();
  await bind(f);
  await expect(
    f.verifyInstalled(root + "other", async () => {}),
  ).rejects.toThrow();
  await expect(uninstall(f)).rejects.toThrow("unresolved");
});
