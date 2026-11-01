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

it("searches absolute semicolon-separated PATH directories for a literal regular ssh file", async () => {
  files.stat.mockImplementation(async (name) => {
    if (name === "C:\\directory\\ssh") return { isFile: () => false };
    if (name === "C:\\denied\\ssh" || name === "C:\\ready\\ssh")
      return { isFile: () => true };
    throw new Error("missing");
  });
  files.access.mockImplementation(async (name) => {
    if (name === "C:\\denied\\ssh") throw new Error("denied");
  });
  expect(
    await findSsh({ PATH: ";.;relative;C:\\directory;C:\\denied;C:\\ready" }),
  ).toBe("C:\\ready\\ssh");
  expect(files.stat.mock.calls).toEqual([
    ["C:\\directory\\ssh"],
    ["C:\\denied\\ssh"],
    ["C:\\ready\\ssh"],
  ]);
  expect(files.access.mock.calls).toEqual([
    ["C:\\denied\\ssh", constants.X_OK],
    ["C:\\ready\\ssh", constants.X_OK],
  ]);
});

it("does not use PATHEXT to resolve an ssh.exe-only PATH", async () => {
  files.stat.mockImplementation(async (name) => {
    if (name === "C:\\bin\\ssh.exe") return { isFile: () => true };
    throw new Error("missing");
  });
  expect(
    await findSsh({ PATH: "C:\\bin", PATHEXT: ".EXE;.CMD" }),
  ).toBeUndefined();
  expect(files.stat.mock.calls).toEqual([["C:\\bin\\ssh"]]);
  expect(files.access).not.toHaveBeenCalled();
});
