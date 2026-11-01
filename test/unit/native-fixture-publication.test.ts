import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  collectFixtureRegistrations,
  FIXTURE_PROCESS_DIRECTORY,
} from "../fixtures/native-fixture-ownership";
import type { FixtureProcess } from "../fixtures/native-fixture-processes";

const owner: FixtureProcess = { pid: 100, parent: 10, identity: "1000" };
const child: FixtureProcess = { pid: 101, parent: 100, identity: "1100" };
const foreign: FixtureProcess = { pid: 102, parent: 10, identity: "1200" };
let root: string;
let directory: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "omxterm-publication-"));
  directory = path.join(root, FIXTURE_PROCESS_DIRECTORY);
  mkdirSync(directory);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function file(name: string, value: unknown): void {
  writeFileSync(path.join(directory, name), JSON.stringify(value));
}

it("accepts a legacy completed base record and retains its descendant", () => {
  file("registration.json", { owner, processes: [owner, child] });
  const owned = new Map<number, FixtureProcess>();
  expect(collectFixtureRegistrations(root, owner.pid, owned, [])).toBe(0);
  expect([...owned.values()]).toEqual([owner, child]);
});

it("does not acquire a completed snapshot from a staged temporary file", () => {
  file("registration.json", { owner });
  file("registration.complete.json.tmp", { owner, processes: [owner, child] });
  const owned = new Map<number, FixtureProcess>();
  expect(collectFixtureRegistrations(root, owner.pid, owned, [])).toBe(1);
  expect([...owned.values()]).toEqual([owner]);
});

it("refuses a completion whose snapshot omits the registered owner", () => {
  file("registration.json", { owner });
  file("registration.complete.json", { owner, processes: [] });
  expect(() =>
    collectFixtureRegistrations(root, owner.pid, new Map(), []),
  ).toThrow();
});

it("refuses a completion with contradictory entries for one process identity", () => {
  file("registration.json", { owner });
  file("registration.complete.json", {
    owner,
    processes: [owner, child, { ...child, parent: 10 }],
  });
  expect(() =>
    collectFixtureRegistrations(root, owner.pid, new Map(), []),
  ).toThrow();
});

it.each([
  "orphan",
  "wrong-registration",
  "malformed-base",
  "malformed-completion",
  "different-owner-pid",
  "different-owner-identity",
  "different-owner-parent",
  "missing-snapshot",
  "contradictory-base",
  "unrelated-process",
  "stale-descendant",
] as const)(
  "refuses %s final files without adopting an unverified descendant",
  (mode) => {
    if (mode !== "orphan") {
      if (mode === "malformed-base")
        writeFileSync(path.join(directory, "registration.json"), "{");
      else
        file("registration.json", {
          owner,
          ...(mode === "contradictory-base"
            ? { processes: [owner, child] }
            : {}),
        });
    }
    const completion =
      mode === "wrong-registration"
        ? "other.complete.json"
        : "registration.complete.json";
    if (mode === "malformed-completion")
      writeFileSync(path.join(directory, completion), "{");
    else
      file(completion, {
        owner:
          mode === "different-owner-pid"
            ? { ...owner, pid: 103 }
            : mode === "different-owner-identity"
              ? { ...owner, identity: "1001" }
              : mode === "different-owner-parent"
                ? { ...owner, parent: 11 }
                : owner,
        ...(mode === "missing-snapshot"
          ? {}
          : {
              processes:
                mode === "unrelated-process"
                  ? [owner, foreign]
                  : mode === "stale-descendant"
                    ? [owner, { ...child, identity: "999" }]
                    : [owner, child],
            }),
      });
    const owned = new Map<number, FixtureProcess>();
    expect(() =>
      collectFixtureRegistrations(root, owner.pid, owned, []),
    ).toThrow();
    expect(owned.has(child.pid)).toBe(false);
    expect(owned.has(foreign.pid)).toBe(false);
  },
);
