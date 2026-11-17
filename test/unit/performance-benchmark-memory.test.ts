import { describe, expect, it } from "vitest";
import {
  gpuClass,
  machineIdentity,
  memoryMetric,
  parseFootprintJson,
  parseWindowsPrivateBytes,
  windowsMemoryCommand,
} from "../fixtures/performance-benchmark-memory";

// Captured from `footprint --json <file> --pid <pid> --pid <pid>` on macOS
// (trimmed to the fields the reader uses). `footprint` reports byte units and
// carries phys_footprint under "auxiliary"; the earlier reader expected a
// "Process:" table that this tool does not print.
const CAPTURED_FOOTPRINT_JSON = JSON.stringify({
  unit: "byte",
  "bytes per unit": 1,
  processes: [
    {
      name: "bash",
      pid: 24683,
      translated: false,
      "page size": 16384,
      footprint: 1458560,
      categories: { "Malloc Tiny": { dirty: 65536, swapped: 0 } },
      auxiliary: {
        phys_footprint_peak: 1458560,
        phys_footprint: 1458560,
      },
    },
    {
      name: "sleep",
      pid: 24684,
      translated: false,
      footprint: 1212752,
      categories: {},
      auxiliary: {},
    },
  ],
});

describe("platform memory readers", () => {
  it("parses a captured footprint report by pid", () => {
    const readings = parseFootprintJson(CAPTURED_FOOTPRINT_JSON);
    expect(readings.get(24683)).toBe(1458560);
    // A missing auxiliary block falls back to the reported total footprint.
    expect(readings.get(24684)).toBe(1212752);
    expect(readings.size).toBe(2);
  });

  it("rejects an unreadable footprint report instead of reporting zeros", () => {
    expect(() => parseFootprintJson("not json")).toThrow("unreadable");
    expect(() =>
      parseFootprintJson(JSON.stringify({ unit: "page", processes: [] })),
    ).toThrow("Unsupported footprint unit");
  });

  it("does not accept impossible footprint byte counts", () => {
    const process = (bytes: number) =>
      JSON.stringify({
        unit: "byte",
        processes: [{ pid: 10, footprint: bytes }],
      });
    for (const bytes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(parseFootprintJson(process(bytes)).has(10)).toBe(false);
  });

  it("builds a Windows PowerShell 5.1 command and parses both JSON shapes", () => {
    const command = windowsMemoryCommand([10, 11]);
    expect(command).toContain("Get-Process -Id 10,11");
    expect(command).not.toContain("-AsArray");
    expect(parseWindowsPrivateBytes('{"pid":10,"bytes":2048}').get(10)).toBe(
      2048,
    );
    expect(
      parseWindowsPrivateBytes(
        JSON.stringify([
          { pid: 10, bytes: 2048 },
          { pid: 11, bytes: 4096 },
        ]),
      ).get(11),
    ).toBe(4096);
    expect(parseWindowsPrivateBytes("").size).toBe(0);
  });

  it("does not accept impossible Windows private-byte counts", () => {
    for (const bytes of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1])
      expect(
        parseWindowsPrivateBytes(JSON.stringify({ pid: 10, bytes })).has(10),
      ).toBe(false);
  });

  it("declares one metric per platform family", () => {
    expect(memoryMetric("linux")).toMatchObject({
      name: "pss",
      addable: true,
    });
    expect(memoryMetric("darwin")).toMatchObject({
      name: "phys_footprint",
      addable: false,
    });
    expect(memoryMetric("win32")).toMatchObject({
      name: "private_bytes",
    });
    expect(memoryMetric("darwin").qualification).toContain(
      "no measured macOS run",
    );
    expect(memoryMetric("win32").qualification).toContain(
      "Windows PowerShell 5.1",
    );
  });

  it("normalises the renderer class without keeping the vendor token", () => {
    const virtualized = gpuClass(
      "ANGLE (Mesa, virgl (Synthetic Device), OpenGL 4.0)",
    );
    expect(virtualized).toEqual({ gpuClass: "virtualized", gpuApi: "angle" });
    expect(gpuClass("SwiftShader Device (Subzero)")).toEqual({
      gpuClass: "software",
      gpuApi: "unknown",
    });
    expect(
      gpuClass(
        "ANGLE (Apple, ANGLE Metal Renderer: Apple M4, Unspecified Version)",
      ),
    ).toEqual({ gpuClass: "hardware", gpuApi: "angle" });
    expect(gpuClass(null)).toEqual({ gpuClass: "unknown", gpuApi: "unknown" });
  });

  it("derives a machine identity hash without publishing host strings", () => {
    const identity = machineIdentity({
      platform: "linux",
      arch: "arm64",
      cpuModel: "Apple M4 Max (Compat)",
      logicalCpus: 4,
      totalMemoryBytes: 8 * 1024 ** 3,
      release: "7.2.11-200.fc44.aarch64",
      gpuRenderer: "ANGLE (Mesa, virgl (Apple M4 Max (Compat)), OpenGL 4.0)",
    });
    expect(identity.identityHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(identity.class).toBe("linux-arm64-4cpu-virtualized");
    const serialised = JSON.stringify(identity);
    expect(serialised).not.toContain("Apple");
    expect(serialised).not.toContain("virgl");
    expect(serialised).not.toContain("fc44");
    // Kernel and RAM changes are routine: they must not force a re-record.
    const sameClass = machineIdentity({
      platform: "linux",
      arch: "arm64",
      cpuModel: "Apple M4 Max (Compat)",
      logicalCpus: 4,
      totalMemoryBytes: 16 * 1024 ** 3,
      release: "6.14.0-1.fc42.aarch64",
      gpuRenderer: "ANGLE (Mesa, virgl (Apple M4 Max (Compat)), OpenGL 4.0)",
    });
    expect(sameClass.identityHash).toBe(identity.identityHash);
    // A different machine class does force a new baseline.
    const otherMachine = machineIdentity({
      platform: "linux",
      arch: "arm64",
      cpuModel: "Apple M4 Max (Compat)",
      logicalCpus: 8,
      totalMemoryBytes: 8 * 1024 ** 3,
      release: "7.2.11-200.fc44.aarch64",
      gpuRenderer: "ANGLE (Mesa, virgl (Apple M4 Max (Compat)), OpenGL 4.0)",
    });
    expect(otherMachine.identityHash).not.toBe(identity.identityHash);
  });
});
