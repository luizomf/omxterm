import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  compile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: calls.compile }));
vi.mock("node:fs/promises", () => ({ mkdir: calls.mkdir }));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const architecture = Object.getOwnPropertyDescriptor(process, "arch")!;
const importLibrary = process.env.OMXTERM_NODE_IMPORT_LIBRARY;
async function build(output: string): Promise<void> {
  const entry = "../../scripts/build-extension-leases.mjs";
  const module = (await import(entry)) as {
    buildExtensionLeases(directory: string): Promise<void>;
  };
  await module.buildExtensionLeases(output);
}
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", architecture);
  if (importLibrary === undefined)
    delete process.env.OMXTERM_NODE_IMPORT_LIBRARY;
  else process.env.OMXTERM_NODE_IMPORT_LIBRARY = importLibrary;
  vi.clearAllMocks();
});

it.each([
  ["arm64", "ARM64"],
  ["x64", "X64"],
] as const)(
  "keeps Windows %s lease linker outputs in the selected native output directory",
  async (arch, machine) => {
    Object.defineProperty(process, "platform", { value: "win32" });
    Object.defineProperty(process, "arch", { value: arch });
    const output = path.resolve(".scratch", "native lease output");
    const library = path.resolve(".scratch", "node import library.lib");
    process.env.OMXTERM_NODE_IMPORT_LIBRARY = library;
    await build(output);

    expect(calls.mkdir).toHaveBeenCalledWith(output, { recursive: true });
    expect(calls.compile).toHaveBeenCalledOnce();
    const [command, args, options] = calls.compile.mock.calls[0]! as [
      string,
      string[],
      { cwd?: string; stdio: string; timeout: number },
    ];
    expect(command).toBe("cl.exe");
    expect(args).toEqual(
      expect.arrayContaining([
        `/MACHINE:${machine}`,
        "/DELAYLOAD:node.exe",
        "delayimp.lib",
        library,
        path.resolve("native", "extension-leases.cc"),
        path.resolve("native", "extension-leases-delay-load.cc"),
        `/Fo${output}${path.sep}`,
        `/OUT:${path.join(output, "extension-leases.node")}`,
        `/IMPLIB:${path.join(output, "extension-leases.lib")}`,
      ]),
    );
    const include = args.find(
      (arg) => arg.startsWith("/I") && !arg.startsWith("/IMPLIB:"),
    );
    expect(include && path.isAbsolute(include.slice(2))).toBe(true);
    expect(options).toEqual({ cwd: output, stdio: "pipe", timeout: 60_000 });
  },
);

it.each(["darwin", "linux"] as const)(
  "leaves the %s lease compiler invocation unchanged",
  async (os) => {
    Object.defineProperty(process, "platform", { value: os });
    const output = path.resolve(".scratch", "native lease output");
    await build(output);
    const [command, args, options] = calls.compile.mock.calls[0]! as [
      string,
      string[],
      { cwd?: string; stdio: string; timeout: number },
    ];
    expect(command).toBe(
      os === "darwin" ? "/usr/bin/xcrun" : process.env.CXX || "c++",
    );
    expect(args).toContain(path.join(output, "extension-leases.node"));
    expect(args.some((arg) => arg.startsWith("/IMPLIB:"))).toBe(false);
    expect(options).toEqual({ stdio: "pipe", timeout: 60_000 });
  },
);

it("refuses a relative Windows import library before invoking the compiler", async () => {
  Object.defineProperty(process, "platform", { value: "win32" });
  Object.defineProperty(process, "arch", { value: "arm64" });
  process.env.OMXTERM_NODE_IMPORT_LIBRARY = "relative.lib";
  await expect(build(path.resolve(".scratch", "native"))).rejects.toThrow(
    "OMXTERM_NODE_IMPORT_LIBRARY must name an absolute runtime import library",
  );
  expect(calls.compile).not.toHaveBeenCalled();
});
