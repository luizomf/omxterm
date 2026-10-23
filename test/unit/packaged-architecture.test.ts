import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  inspectArchitectureDescription,
  inspectAsarEntries,
  inspectLinuxNativeBinaries,
  inspectPeMachine,
  nativeBinaryKind,
  packageVerificationOptions,
  packagedArchitecture,
  unpackedDirectoryName,
  verifyLinuxNativeTree,
} from "../../scripts/verify-packaged-app.mjs";

const requiredEntries = [
  "/dist/main/index.js",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.css",
  "/dist/renderer/index.html",
  "/dist/renderer/index.js",
  "/node_modules/node-pty/lib/index.js",
  "/package.json",
];
const other = (arch: "arm64" | "x64") => (arch === "arm64" ? "x64" : "arm64");

function elfHeader(machine: number, bigEndian = false) {
  const header = Buffer.alloc(64);
  header.writeUInt32BE(0x7f454c46, 0);
  header[4] = 2;
  header[5] = bigEndian ? 2 : 1;
  if (bigEndian) header.writeUInt16BE(machine, 18);
  else header.writeUInt16LE(machine, 18);
  return header;
}

function peHeader(machine: number) {
  const header = Buffer.alloc(256);
  header.writeUInt16LE(0x5a4d, 0);
  header.writeUInt32LE(0x80, 0x3c);
  header.writeUInt32LE(0x00004550, 0x80);
  header.writeUInt16LE(machine, 0x84);
  return header;
}

describe("packaged architecture selection", () => {
  it.each(["arm64", "x64"])("supports native %s packages", (arch) => {
    expect(packagedArchitecture(arch)).toBe(arch);
  });

  it.each(["ia32", "arm", "riscv64"])("rejects %s packages", (arch) => {
    expect(() => packagedArchitecture(arch)).toThrow("arm64 or x64");
  });

  it.each([
    ["darwin", "arm64", "mac-arm64"],
    ["darwin", "x64", "mac"],
    ["linux", "arm64", "linux-arm64-unpacked"],
    ["linux", "x64", "linux-unpacked"],
    ["win32", "arm64", "win-arm64-unpacked"],
    ["win32", "x64", "win-unpacked"],
  ])("locates the %s %s unpacked application at %s", (platform, arch, name) => {
    expect(unpackedDirectoryName(platform, arch)).toBe(name);
  });
});

describe("per-architecture native runtime entries", () => {
  it.each(["arm64", "x64"] as const)(
    "accepts only the darwin-%s node-pty prebuild",
    (arch) => {
      const own = `/node_modules/node-pty/prebuilds/darwin-${arch}`;
      const foreign = `/node_modules/node-pty/prebuilds/darwin-${other(arch)}`;
      expect(
        inspectAsarEntries(
          [
            ...requiredEntries,
            "/dist/main/macos-window-blur.node",
            own,
            `${own}/pty.node`,
            `${own}/spawn-helper`,
          ],
          "darwin",
          arch,
        ),
      ).toEqual({ missing: [], forbidden: [] });
      expect(
        inspectAsarEntries(
          [
            ...requiredEntries,
            "/dist/main/macos-window-blur.node",
            foreign,
            `${foreign}/pty.node`,
          ],
          "darwin",
          arch,
        ).forbidden,
      ).toEqual([foreign, `${foreign}/pty.node`]);
    },
  );

  it.each(["arm64", "x64"] as const)(
    "accepts only the win32-%s node-pty prebuild without symbols",
    (arch) => {
      const own = `/node_modules/node-pty/prebuilds/win32-${arch}`;
      const foreign = `/node_modules/node-pty/prebuilds/win32-${other(arch)}`;
      expect(
        inspectAsarEntries(
          [
            ...requiredEntries,
            own,
            `${own}/pty.node`,
            `${own}/conpty.node`,
            `${own}/conpty/OpenConsole.exe`,
          ],
          "win32",
          arch,
        ),
      ).toEqual({ missing: [], forbidden: [] });
      expect(
        inspectAsarEntries(
          [...requiredEntries, `${foreign}/pty.node`, `${own}/pty.pdb`],
          "win32",
          arch,
        ).forbidden,
      ).toEqual([`${foreign}/pty.node`, `${own}/pty.pdb`]);
    },
  );

  it("keeps arm64 as the default for existing callers", () => {
    expect(
      inspectAsarEntries(
        [
          ...requiredEntries,
          "/node_modules/node-pty/prebuilds/win32-x64/pty.node",
        ],
        "win32",
      ).forbidden,
    ).toEqual(["/node_modules/node-pty/prebuilds/win32-x64/pty.node"]);
  });

  it("rejects an unsupported packaged architecture", () => {
    expect(() => inspectAsarEntries(requiredEntries, "linux", "ia32")).toThrow(
      "arm64 or x64",
    );
  });
});

describe("executable machine checks", () => {
  it.each([
    ["arm64", 0xaa64, 0x8664],
    ["x64", 0x8664, 0xaa64],
  ] as const)("accepts only %s PE machines", (arch, own, foreign) => {
    expect(() => inspectPeMachine(own, "OMXTerm.exe", arch)).not.toThrow();
    expect(() => inspectPeMachine(foreign, "OMXTerm.exe", arch)).toThrow(
      `OMXTerm.exe is not an ${arch}-only PE: machine 0x${foreign.toString(16)}`,
    );
    expect(() => inspectPeMachine(0x14c, "OMXTerm.exe", arch)).toThrow(
      "machine 0x14c",
    );
  });

  const machO = {
    arm64: "Mach-O 64-bit executable arm64",
    x64: "Mach-O 64-bit executable x86_64",
  };
  const elf = {
    arm64:
      "ELF 64-bit LSB pie executable, ARM aarch64, version 1 (SYSV), dynamically linked",
    x64: "ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked",
  };
  const universal =
    "Mach-O universal binary with 2 architectures: [x86_64:Mach-O 64-bit executable x86_64] [arm64]";

  it.each(["arm64", "x64"] as const)(
    "accepts only %s Mach-O and ELF descriptions",
    (arch) => {
      expect(() =>
        inspectArchitectureDescription(machO[arch], "app", "darwin", arch),
      ).not.toThrow();
      expect(() =>
        inspectArchitectureDescription(
          machO[other(arch)],
          "app",
          "darwin",
          arch,
        ),
      ).toThrow(`app is not an ${arch}-only Mach-O`);
      expect(() =>
        inspectArchitectureDescription(universal, "app", "darwin", arch),
      ).toThrow("Mach-O");
      expect(() =>
        inspectArchitectureDescription(elf[arch], "app", "linux", arch),
      ).not.toThrow();
      expect(() =>
        inspectArchitectureDescription(elf[other(arch)], "app", "linux", arch),
      ).toThrow(`app is not an ${arch}-only ELF`);
    },
  );
});

describe("Linux native file scan", () => {
  it("classifies ELF machines and foreign executable formats", () => {
    expect(nativeBinaryKind(elfHeader(62))).toBe("elf-x64");
    expect(nativeBinaryKind(elfHeader(183))).toBe("elf-arm64");
    expect(nativeBinaryKind(elfHeader(183, true))).toBe("elf-arm64");
    expect(nativeBinaryKind(elfHeader(40))).toBe("elf-machine-40");
    const macho = Buffer.alloc(32);
    macho.writeUInt32BE(0xcffaedfe, 0);
    expect(nativeBinaryKind(macho)).toBe("mach-o");
    expect(nativeBinaryKind(peHeader(0x8664))).toBe("pe");
    expect(nativeBinaryKind(Buffer.from("#!/bin/sh\nexec omxterm\n"))).toBe(
      undefined,
    );
    expect(nativeBinaryKind(Buffer.from("MZ"))).toBe(undefined);
  });

  it.each(["arm64", "x64"] as const)(
    "reports every non-%s native file",
    (arch) => {
      expect(
        inspectLinuxNativeBinaries(
          [
            { entry: "/omxterm", kind: `elf-${arch}` },
            { entry: "/AppRun" },
            { entry: "/foreign.node", kind: `elf-${other(arch)}` },
            { entry: "/pty.node", kind: "mach-o" },
            { entry: "/conpty.dll", kind: "pe" },
          ],
          arch,
        ),
      ).toEqual([
        `/foreign.node (elf-${other(arch)})`,
        "/pty.node (mach-o)",
        "/conpty.dll (pe)",
      ]);
    },
  );

  it("scans a whole extracted tree", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-native-tree-"));
    try {
      await mkdir(path.join(root, "resources"), { recursive: true });
      await writeFile(path.join(root, "omxterm"), elfHeader(62));
      await writeFile(path.join(root, "AppRun"), "#!/bin/sh\n");
      await expect(verifyLinuxNativeTree(root, "x64")).resolves.toBe(undefined);
      await expect(verifyLinuxNativeTree(root, "arm64")).rejects.toThrow(
        "non-arm64 native files: /omxterm (elf-x64)",
      );
      await writeFile(path.join(root, "resources", "pty.node"), elfHeader(183));
      await expect(verifyLinuxNativeTree(root, "x64")).rejects.toThrow(
        "/resources/pty.node (elf-arm64)",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("requires at least one ELF for the target architecture", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-native-tree-"));
    try {
      await writeFile(path.join(root, "AppRun"), "#!/bin/sh\n");
      await expect(verifyLinuxNativeTree(root, "x64")).rejects.toThrow(
        "no x64 ELF files",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("package verification options", () => {
  it.each(["darwin", "linux", "win32"])(
    "accepts static-only content verification on %s",
    (platform) => {
      expect(packageVerificationOptions(["--static-only"], platform)).toEqual({
        windowsUnpackedOnly: false,
        disposableVm: false,
        staticOnly: true,
        softwareGl: false,
      });
      expect(packageVerificationOptions([], platform)).toEqual({
        windowsUnpackedOnly: false,
        disposableVm: false,
        staticOnly: false,
        softwareGl: false,
      });
    },
  );

  it("accepts software GL only for a Linux startup verification", () => {
    expect(packageVerificationOptions(["--software-gl"], "linux")).toEqual({
      windowsUnpackedOnly: false,
      disposableVm: false,
      staticOnly: false,
      softwareGl: true,
    });
    expect(() =>
      packageVerificationOptions(["--software-gl"], "darwin"),
    ).toThrow(/only to a Linux startup/u);
    expect(() =>
      packageVerificationOptions(["--software-gl", "--static-only"], "linux"),
    ).toThrow(/only to a Linux startup/u);
  });

  it.each([
    [["--static-only", "--static-only"], "linux", "duplicate"],
    [
      ["--static-only", "--windows-unpacked-only"],
      "win32",
      "cannot be combined",
    ],
    [
      ["--static-only", "--disposable-vm-allow-omxterm-replacement"],
      "win32",
      "cannot be combined",
    ],
    [["--windows-unpacked-only"], "linux", "require Windows"],
  ])("rejects %j on %s", (args, platform, message) => {
    expect(() => packageVerificationOptions(args, platform)).toThrow(message);
  });
});
