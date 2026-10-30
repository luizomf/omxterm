import { afterEach, expect, it, vi } from "vitest";
import { createFilesServices } from "../../src/extension-runtime/files-services";
import { activate } from "../../extensions/files/backend";

const calls = vi.hoisted(() => {
  const moveNoReplace = vi.fn();
  const trash = vi.fn<(target: string) => Promise<string>>();
  const load = vi.fn(() => ({ moveNoReplace, trash }));
  return { moveNoReplace, trash, load, createRequire: vi.fn(() => load) };
});
vi.mock("node:module", () => ({ createRequire: calls.createRequire }));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  vi.resetAllMocks();
  calls.load.mockImplementation(() => ({
    moveNoReplace: calls.moveNoReplace,
    trash: calls.trash,
  }));
  calls.createRequire.mockReturnValue(calls.load);
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

function macServices() {
  Object.defineProperty(process, "platform", { value: "darwin" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  return createFilesServices();
}

it.each([
  ["darwin", "x64"],
  ["linux", "arm64"],
  ["linux", "x64"],
  ["win32", "arm64"],
])("omits trash on %s %s without loading native code", (os, cpu) => {
  Object.defineProperty(process, "platform", { value: os });
  Object.defineProperty(process, "arch", { value: cpu });
  expect(createFilesServices()).not.toHaveProperty("trash");
  expect(calls.load).not.toHaveBeenCalled();
});

it("shares lazy native loading and discards the private resulting Trash path", async () => {
  const services = macServices();
  expect(calls.load).not.toHaveBeenCalled();
  const target = "/fixture/space ' \" ; $() % # café";
  calls.trash.mockResolvedValue("/private-trash/result");
  await expect(
    services.trash!(target, new AbortController().signal),
  ).resolves.toBeUndefined();
  await services.moveNoReplace("/source", "/destination");
  expect(calls.load).toHaveBeenCalledTimes(1);
  expect(calls.trash.mock.calls).toEqual([[target]]);
});

it.each([
  "",
  "/",
  "/item/",
  "/link/.",
  "/link/..",
  "//item",
  "/one//two",
  "relative",
  "/nul\0item",
  "/" + "x".repeat(4096),
])(
  "refuses ambiguous or invalid trash input before loading (%j)",
  async (target) => {
    await expect(
      macServices().trash!(target, new AbortController().signal),
    ).rejects.toMatchObject({ code: "EINVAL" });
    expect(calls.load).not.toHaveBeenCalled();
    expect(calls.trash).not.toHaveBeenCalled();
  },
);

it.each([
  "/fixture/link/../victim",
  "/fixture/link/.",
  "/fixture//victim",
  "//fixture/victim",
  "/fixture/link/",
])(
  "refuses original trash spelling through the backend (%j)",
  async (target) => {
    const signal = new AbortController().signal;
    const backend = activate({ signal, files: macServices() });
    expect(
      await backend.invoke({ operation: "trash", path: target }, signal),
    ).toEqual({
      ok: false,
      error: "outcome-unknown",
    });
    expect(calls.load).not.toHaveBeenCalled();
    expect(calls.trash).not.toHaveBeenCalled();
  },
);

it("forwards a valid literal trash path through the backend once", async () => {
  const signal = new AbortController().signal;
  const backend = activate({ signal, files: macServices() });
  const target = "/fixture/space ' \" ; $() % # café";
  calls.trash.mockResolvedValue("/private-trash/result");
  expect(
    await backend.invoke({ operation: "trash", path: target }, signal),
  ).toEqual({ ok: true });
  expect(calls.trash).toHaveBeenCalledExactlyOnceWith(target);
});

it("refuses already-aborted trash before native loading", async () => {
  await expect(
    macServices().trash!("/entry", AbortSignal.abort()),
  ).rejects.toMatchObject({ code: "ECANCELED" });
  expect(calls.load).not.toHaveBeenCalled();
});

it("retains actual worker completion after cancellation without replay", async () => {
  let complete!: (result: string) => void;
  calls.trash.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const controller = new AbortController();
  const settled = vi.fn();
  const pending = macServices().trash!("/entry", controller.signal).then(
    settled,
  );
  controller.abort();
  await Promise.resolve();
  expect(settled).not.toHaveBeenCalled();
  expect(calls.trash).toHaveBeenCalledTimes(1);
  complete("/private-trash/entry");
  await pending;
  expect(settled).toHaveBeenCalledExactlyOnceWith(undefined);
});

it.each(["EIO", "EBUSY", "ECANCELED"])(
  "propagates trash %s once, without fallback",
  async (code) => {
    const failure = Object.assign(new Error(code), { code });
    calls.trash.mockRejectedValueOnce(failure);
    await expect(
      macServices().trash!("/entry", new AbortController().signal),
    ).rejects.toBe(failure);
    expect(calls.trash).toHaveBeenCalledTimes(1);
    expect(calls.moveNoReplace).not.toHaveBeenCalled();
  },
);
