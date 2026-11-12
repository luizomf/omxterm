import { describe, expect, it } from "vitest";
import {
  executableUuid,
  replaceMachOUuid,
} from "../../scripts/macos-executable-uuid.mjs";

const loadCommandUuid = 0x1b;
const loadCommandSegment64 = 0x19;

function thinMachO(commands: Array<{ command: number; size: number }>) {
  const size = 32 + commands.reduce((total, { size }) => total + size, 0);
  const binary = Buffer.alloc(size);
  binary.writeUInt32LE(0xfeedfacf, 0);
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

const electronLike = () =>
  thinMachO([
    { command: loadCommandSegment64, size: 72 },
    { command: loadCommandUuid, size: 24 },
  ]);

const uuidAt = (binary: Buffer, offset: number) =>
  binary.subarray(offset, offset + 16);

describe("macOS executable UUID", () => {
  const omxterm = "com.otaviomiranda.omxterm";
  const main = "Contents/MacOS/OMXTerm";
  const uuid = executableUuid(omxterm, main, "build-a");

  it("is a name-based UUID unique to the app, executable and build", () => {
    expect(uuid).toHaveLength(16);
    expect(uuid.readUInt8(6) >> 4).toBe(5);
    expect(uuid.readUInt8(8) >> 6).toBe(2);
    expect(executableUuid(omxterm, main, "build-a")).toEqual(uuid);
    expect(executableUuid(omxterm, main, "build-b")).not.toEqual(uuid);
    expect(
      executableUuid(
        omxterm,
        "Contents/Frameworks/OMXTerm Helper.app/Contents/MacOS/OMXTerm Helper",
        "build-a",
      ),
    ).not.toEqual(uuid);
    expect(executableUuid("com.example.fork", main, "build-a")).not.toEqual(
      uuid,
    );
  });

  it("replaces only the UUID of a thin Mach-O", () => {
    const binary = electronLike();
    const original = Buffer.from(binary);

    replaceMachOUuid(binary, uuid);

    expect(uuidAt(binary, 32 + 72 + 8)).toEqual(uuid);
    binary.set(original.subarray(32 + 72 + 8, 32 + 72 + 24), 32 + 72 + 8);
    expect(binary).toEqual(original);
  });

  it("replaces the UUID of every slice in a universal binary", () => {
    const slice = electronLike();
    const sliceOffsets = [4096, 8192];
    const binary = Buffer.alloc(8192 + slice.length);
    binary.writeUInt32BE(0xcafebabe, 0);
    binary.writeUInt32BE(sliceOffsets.length, 4);
    sliceOffsets.forEach((offset, index) => {
      binary.writeUInt32BE(offset, 8 + index * 20 + 8);
      binary.writeUInt32BE(slice.length, 8 + index * 20 + 12);
      slice.copy(binary, offset);
    });

    replaceMachOUuid(binary, uuid);

    for (const offset of sliceOffsets)
      expect(uuidAt(binary, offset + 32 + 72 + 8)).toEqual(uuid);
  });

  it("refuses binaries without exactly one UUID", () => {
    expect(() =>
      replaceMachOUuid(
        thinMachO([{ command: loadCommandSegment64, size: 72 }]),
        uuid,
      ),
    ).toThrow("found 0");
    expect(() =>
      replaceMachOUuid(Buffer.from("#!/bin/sh\n".padEnd(64)), uuid),
    ).toThrow("Mach-O");
  });
});
