import { afterEach, expect, it, vi } from "vitest";
import { createFilesServices } from "../../src/extension-runtime/files-services";

const calls = vi.hoisted(() => {
  const moveNoReplace = vi.fn();
  const load = vi.fn(() => ({ moveNoReplace }));
  return { moveNoReplace, load, createRequire: vi.fn(() => load) };
});
vi.mock("node:module", () => ({ createRequire: calls.createRequire }));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  vi.clearAllMocks();
});

it.each(["darwin", "linux"])(
  "loads the %s ARM64 addon lazily and reuses it",
  async (os) => {
    Object.defineProperty(process, "platform", { value: os });
    Object.defineProperty(process, "arch", { value: "arm64" });
    const services = createFilesServices();
    expect(calls.load).not.toHaveBeenCalled();
    await services.moveNoReplace("/source", "/destination");
    await services.moveNoReplace("/second", "/other");
    expect(calls.load).toHaveBeenCalledTimes(1);
    expect(calls.load).toHaveBeenCalledWith(
      expect.stringMatching(/\/files-move\.node$/),
    );
    expect(calls.moveNoReplace.mock.calls).toEqual([
      ["/source", "/destination"],
      ["/second", "/other"],
    ]);
  },
);

it.each([
  ["darwin", "x64"],
  ["linux", "x64"],
  ["win32", "arm64"],
  ["win32", "x64"],
])("refuses %s %s before native loading", async (os, cpu) => {
  Object.defineProperty(process, "platform", { value: os });
  Object.defineProperty(process, "arch", { value: cpu });
  await expect(
    createFilesServices().moveNoReplace("/source", "/destination"),
  ).rejects.toMatchObject({ code: "ENOTSUP" });
  expect(calls.load).not.toHaveBeenCalled();
  expect(calls.moveNoReplace).not.toHaveBeenCalled();
});

it.each(["EEXIST", "EXDEV", "ENOTSUP", "EACCES", "EBUSY"])(
  "propagates %s without retry",
  async (code) => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    Object.defineProperty(process, "arch", { value: "arm64" });
    const error = Object.assign(new Error(code), { code });
    calls.moveNoReplace.mockRejectedValueOnce(error);
    await expect(
      createFilesServices().moveNoReplace("/source", "/destination"),
    ).rejects.toBe(error);
    expect(calls.moveNoReplace).toHaveBeenCalledTimes(1);
  },
);
