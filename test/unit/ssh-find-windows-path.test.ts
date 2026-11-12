import { constants } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import { findSsh } from "../../src/main/ssh-terminal-launch";

// Exercise the actual lookup with Windows path semantics and controlled I/O;
// this does not execute a Windows client or qualify the SSH preview.
const files = vi.hoisted(() => ({
  stat: vi.fn<(name: string) => Promise<{ isFile(): boolean }>>(),
  access: vi.fn<(name: string, mode: number) => Promise<void>>(),
}));
vi.mock("node:fs/promises", () => files);
vi.mock("node:path", async (original) => {
  const actual = await original<typeof import("node:path")>();
  return { ...actual, default: actual.win32 };
});

beforeEach(() => {
  files.stat.mockReset();
  files.access.mockReset();
});

it("searches absolute semicolon-separated PATH directories for a regular ssh.exe", async () => {
  files.stat.mockImplementation(async (name) => {
    if (name === "C:\\directory\\ssh.exe") return { isFile: () => false };
    if (name === "C:\\denied\\ssh.exe" || name === "C:\\ready\\ssh.exe")
      return { isFile: () => true };
    throw new Error("missing");
  });
  files.access.mockImplementation(async (name) => {
    if (name === "C:\\denied\\ssh.exe") throw new Error("denied");
  });
  expect(
    await findSsh(
      { PATH: ";.;relative;C:\\directory;C:\\denied;C:\\ready" },
      "win32",
    ),
  ).toBe("C:\\ready\\ssh.exe");
  expect(files.stat.mock.calls).toEqual([
    ["C:\\directory\\ssh.exe"],
    ["C:\\denied\\ssh.exe"],
    ["C:\\ready\\ssh.exe"],
  ]);
  expect(files.access.mock.calls).toEqual([
    ["C:\\denied\\ssh.exe", constants.X_OK],
    ["C:\\ready\\ssh.exe", constants.X_OK],
  ]);
});
