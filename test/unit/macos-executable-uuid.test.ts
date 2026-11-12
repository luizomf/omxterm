import { describe, expect, it } from "vitest";
import {
  executableUuid,
  replaceMachOUuid,
} from "../../scripts/macos-executable-uuid.mjs";

const loadCommandUuid = 0x1b;
const loadCommandSegment64 = 0x19;

const arm64 = 0x0100000c;
const x86_64 = 0x01000007;

function thinMachO(
  commands: Array<{ command: number; size: number }>,
  cpuType = arm64,
) {
  const size = 32 + commands.reduce((total, { size }) => total + size, 0);
  const binary = Buffer.alloc(size);
  binary.writeUInt32LE(0xfeedfacf, 0);
  binary.writeUInt32LE(cpuType, 4);
  binary.writeUInt32LE(commands.length, 16);
  let offset = 32;
  for (const { command, size } of commands) {
    binary.writeUInt32LE(command, offset);
    binary.writeUInt32LE(size, offset + 4);
    if (command === loadCommandUuid) binary.fill(0xee, offset + 8, offset + 24);
    offset += size;
  }
  return binary;
}

const electronLike = (cpuType = arm64) =>
  thinMachO(
    [
      { command: loadCommandSegment64, size: 72 },
      { command: loadCommandUuid, size: 24 },
    ],
    cpuType,
  );

const uuidAt = (binary: Buffer, offset: number) =>
  binary.subarray(offset, offset + 16);

describe("macOS executable UUID", () => {
  const omxterm = "com.otaviomiranda.omxterm";
  const main = "Contents/MacOS/OMXTerm";
  const uuid = executableUuid(omxterm, main, "build-a", "arm64");
  const uuidFor = (architecture: string) =>
    executableUuid(omxterm, main, "build-a", architecture);

  it("is a version 8 UUID unique to the app, executable, build and architecture", () => {
    expect(uuid).toHaveLength(16);
    expect(uuid.readUInt8(6) >> 4).toBe(8);
    expect(uuid.readUInt8(8) >> 6).toBe(2);
    expect(executableUuid(omxterm, main, "build-a", "arm64")).toEqual(uuid);
    for (const other of [
      executableUuid(omxterm, main, "build-b", "arm64"),
      executableUuid(omxterm, main, "build-a", "x86_64"),
      executableUuid(
        omxterm,
        "Contents/Frameworks/OMXTerm Helper.app/Contents/MacOS/OMXTerm Helper",
        "build-a",
        "arm64",
      ),
      executableUuid("com.example.fork", main, "build-a", "arm64"),
    ])
      expect(other).not.toEqual(uuid);
  });

  it("replaces only the UUID of a thin Mach-O", () => {
    const binary = electronLike();
    const original = Buffer.from(binary);

    replaceMachOUuid(binary, uuidFor);

    expect(uuidAt(binary, 32 + 72 + 8)).toEqual(uuidFor(`${arm64}:0`));
    binary.set(original.subarray(32 + 72 + 8, 32 + 72 + 24), 32 + 72 + 8);
    expect(binary).toEqual(original);
  });

  it("gives every slice of a universal binary its own UUID", () => {
    const slices = [
      { offset: 4096, slice: electronLike(arm64) },
      { offset: 8192, slice: electronLike(x86_64) },
    ];
    const binary = Buffer.alloc(8192 + 4096);
    binary.writeUInt32BE(0xcafebabe, 0);
    binary.writeUInt32BE(slices.length, 4);
    slices.forEach(({ offset, slice }, index) => {
      binary.writeUInt32BE(offset, 8 + index * 20 + 8);
      binary.writeUInt32BE(slice.length, 8 + index * 20 + 12);
      slice.copy(binary, offset);
    });

    replaceMachOUuid(binary, uuidFor);

    const arm64Uuid = uuidAt(binary, 4096 + 32 + 72 + 8);
    const x86Uuid = uuidAt(binary, 8192 + 32 + 72 + 8);
    expect(arm64Uuid).toEqual(uuidFor(`${arm64}:0`));
    expect(x86Uuid).toEqual(uuidFor(`${x86_64}:0`));
    expect(arm64Uuid).not.toEqual(x86Uuid);
  });

  it("refuses binaries without exactly one UUID", () => {
    expect(() =>
      replaceMachOUuid(
        thinMachO([{ command: loadCommandSegment64, size: 72 }]),
        uuidFor,
      ),
    ).toThrow("found 0");
    expect(() =>
      replaceMachOUuid(Buffer.from("#!/bin/sh\n".padEnd(64)), uuidFor),
    ).toThrow("Mach-O");
  });
});
