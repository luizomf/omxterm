import path from "node:path";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fixtureProcesses,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";
import {
  collectFixtureRegistrations,
  spawnFixtureProcess,
} from "../fixtures/native-fixture-ownership";

const { files } = vi.hoisted(() => ({ files: new Map<string, string>() }));
vi.mock("node:fs", () => ({
  writeFileSync: (name: string, text: string) => {
    files.set(name, text);
  },
  readFileSync: (name: string) => {
    if (!files.has(name)) throw new Error("Missing ownership record");
    return files.get(name)!;
  },
  renameSync: (from: string, to: string) => {
    files.set(to, files.get(from)!);
    files.delete(from);
  },
  readdirSync: () => [...files.keys()].map((name) => path.basename(name)),
}));
vi.mock("../fixtures/native-fixture-processes", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../fixtures/native-fixture-processes")
  >()),
  fixtureProcesses: vi.fn(),
}));
const root = path.resolve("fixture-profile");
const owner: FixtureProcess = { pid: process.pid, parent: 1, identity: "100" };
const child: FixtureProcess = {
  pid: process.pid + 1,
  parent: owner.pid,
  identity: "200",
};
const unrelated: FixtureProcess = {
  pid: process.pid + 2,
  parent: 1,
  identity: "300",
};

beforeEach(() => {
  files.clear();
  vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", root);
  vi.mocked(fixtureProcesses).mockReturnValue([owner, child, unrelated]);
});
afterEach(() => vi.unstubAllEnvs());

describe("native fixture spawn ownership", () => {
  it("recovers an explicitly registered child after its parent disappears, excluding unrelated processes", () => {
    const spawned = { pid: child.pid };
    expect(spawnFixtureProcess(() => spawned)).toBe(spawned);
    vi.mocked(fixtureProcesses).mockReturnValue([
      { ...child, parent: 1 },
      unrelated,
    ]);
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
  });

  it("publishes uncertainty before invoking spawn and preserves it on a spawn exception", () => {
    expect(() =>
      spawnFixtureProcess(() => {
        expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
        throw new Error("partial native spawn failure");
      }),
    ).toThrow("partial native spawn failure");
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });

  it("does not complete registration when the spawned identity cannot be established", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    expect(() => spawnFixtureProcess(() => ({ pid: child.pid }))).toThrow(
      "Cannot establish ownership",
    );
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });

  it("refuses to spawn without a supervised profile", () => {
    vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", undefined);
    const spawn = vi.fn(() => ({ pid: child.pid }));
    expect(() => spawnFixtureProcess(spawn)).toThrow(
      "ownership root is missing",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects ownership records belonging to another leader or a reused leader PID", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    expect(() =>
      collectFixtureRegistrations(root, unrelated.pid, new Map()),
    ).toThrow("Invalid native fixture ownership");
    expect(() =>
      collectFixtureRegistrations(
        root,
        owner.pid,
        new Map([[owner.pid, { ...owner, identity: "999" }]]),
      ),
    ).toThrow("Invalid native fixture ownership");
  });

  it("does not adopt an unrelated process that reused a registered PID", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    vi.mocked(fixtureProcesses).mockReturnValue([
      { ...child, parent: 1, identity: "999" },
    ]);
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect(owned.has(child.pid)).toBe(false);
  });

  it("keeps the live registered incarnation regardless of historical record order", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...child, identity: "999" },
    ]);
    spawnFixtureProcess(() => ({ pid: child.pid }));
    for (const records of [
      [...files.entries()],
      [...files.entries()].reverse(),
    ]) {
      files.clear();
      for (const [name, text] of records) files.set(name, text);
      const owned = new Map([[child.pid, child]]);
      expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
      expect(owned.get(child.pid)?.identity).toBe("999");
    }
  });

  it("rejects malformed and unrelated process records instead of declaring cleanup safe", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    const name = [...files.keys()][0]!;
    for (const processes of [[owner, unrelated], [{ pid: -1 }], "invalid"]) {
      files.set(name, JSON.stringify({ owner, processes }));
      expect(() =>
        collectFixtureRegistrations(root, owner.pid, new Map()),
      ).toThrow();
    }
    files.set(name, "{");
    expect(() =>
      collectFixtureRegistrations(root, owner.pid, new Map()),
    ).toThrow();
  });
});
