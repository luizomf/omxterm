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
// The mocked Darwin backend must use Darwin's POSIX paths even on Windows.
vi.mock("node:path", async (original) => {
  const actual = await original<typeof import("node:path")>();
  return { ...actual, default: actual.posix };
});

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

it.each([
  ["darwin", "arm64"],
  ["linux", "arm64"],
  ["linux", "x64"],
  ["win32", "arm64"],
  ["win32", "x64"],
])("loads the %s %s addon lazily and reuses it", async (os, cpu) => {
  Object.defineProperty(process, "platform", { value: os });
  Object.defineProperty(process, "arch", { value: cpu });
  const services = createFilesServices();
  expect(calls.load).not.toHaveBeenCalled();
  await services.moveNoReplace("/source", "/destination");
  await services.moveNoReplace("/second", "/other");
  expect(calls.load).toHaveBeenCalledTimes(1);
  expect(calls.load).toHaveBeenCalledWith(
    expect.stringMatching(/[\\/]files-move\.node$/),
  );
  expect(calls.moveNoReplace.mock.calls).toEqual([
    ["/source", "/destination"],
    ["/second", "/other"],
  ]);
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
  ["linux", "arm64"],
  ["linux", "x64"],
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
      error: "invalid-path",
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

function windowsServices(cpu = "arm64") {
  Object.defineProperty(process, "platform", { value: "win32" });
  Object.defineProperty(process, "arch", { value: cpu });
  return createFilesServices();
}

it.each(["arm64", "x64"])(
  "forwards a literal Windows %s drive path to the Recycle Bin service",
  async (cpu) => {
    // Windows forbids `"` in names; everything else here is literal.
    const target = "C:\\Users\\me\\space ' ; $() % # café";
    calls.trash.mockResolvedValue("");
    await expect(
      windowsServices(cpu).trash!(target, new AbortController().signal),
    ).resolves.toBeUndefined();
    expect(calls.trash.mock.calls).toEqual([[target]]);
  },
);

it.each([
  "C:\\",
  "C:/",
  "C:\\item\\",
  "C:\\link\\.",
  "C:\\link\\..\\victim",
  "C:\\one\\\\two",
  "C:item",
  "\\\\server\\share\\item",
  "\\item",
  "/item",
  "relative",
  "C:\\file.txt:stream",
  "C:\\Users\\me\\x.",
  "C:\\Users\\me\\x ",
  "C:\\Users\\...",
  "C:\\dir. \\x",
  "C:\\Users\\a*",
  "C:\\Users\\a?b",
  "C:\\Users\\a|b",
  "C:\\Users\\a<b>",
  'C:\\Users\\a"b',
  "C:\\Users\\a\x01b",
  "C:\\CON",
  "C:\\Users\\nul.txt",
  "C:\\Users\\Lpt1",
  "C:\\Users\\com9.tar.gz",
  "C:\\aux\\file",
])(
  "refuses ambiguous Windows trash input before loading (%j)",
  async (target) => {
    await expect(
      windowsServices().trash!(target, new AbortController().signal),
    ).rejects.toMatchObject({ code: "EINVAL" });
    expect(calls.load).not.toHaveBeenCalled();
  },
);

// This file mocks POSIX paths, so Windows hosts appear with POSIX spellings.
it("reports a Recycle Bin refusal as nothing deleted, not an unknown outcome", async () => {
  const signal = new AbortController().signal;
  const trash = vi.fn(async () => {
    throw Object.assign(new Error("ENOTRASH"), { code: "ENOTRASH" });
  });
  const backend = activate({
    signal,
    files: { moveNoReplace: calls.moveNoReplace, trash },
  });
  expect(
    await backend.invoke({ operation: "trash", path: "/big.iso" }, signal),
  ).toEqual({ ok: false, error: "trash-unavailable" });
  expect(trash).toHaveBeenCalledOnce();
});

it("refuses trash up front on a Windows host without a trash service", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  const signal = new AbortController().signal;
  const backend = activate({
    signal,
    files: { moveNoReplace: calls.moveNoReplace },
  });
  expect(
    await backend.invoke({ operation: "trash", path: "/item" }, signal),
  ).toEqual({ ok: false, error: "unsupported" });
});

it.each(["C:\\Users\\console.txt", "C:\\Users\\com10", "C:\\Users\\nullable"])(
  "still forwards ordinary Windows names that start like devices (%j)",
  async (target) => {
    calls.trash.mockResolvedValue("");
    await expect(
      windowsServices().trash!(target, new AbortController().signal),
    ).resolves.toBeUndefined();
  },
);
