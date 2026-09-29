import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { completedFixture } from "../fixtures/native-fixture-completion";
import {
  collectFixtureRegistrations,
  FIXTURE_PROCESS_DIRECTORY,
} from "../fixtures/native-fixture-ownership";
import type { FixtureProcess } from "../fixtures/native-fixture-processes";

it("requires registered producer exit, retaining failed outcomes and rejecting unknown identities", () => {
  const root = mkdtempSync(path.join(tmpdir(), "omxterm-completion-"));
  try {
    const producer = { pid: 200, parent: 100, identity: "300" };
    const owned = new Map([[producer.pid, producer]]);
    const result = { producer, exitCode: 3, stdout: "observations" };
    expect(completedFixture(root, "result", owned, [])).toBeUndefined();
    writeFileSync(path.join(root, "result"), JSON.stringify(result));
    expect(completedFixture(root, "result", owned, [producer])).toBeUndefined();
    expect(completedFixture(root, "result", owned, [])).toEqual(result);
    expect(
      completedFixture(root, "result", owned, [
        { ...producer, identity: "400" },
      ]),
    ).toEqual(result);
    expect(() => completedFixture(root, "result", new Map(), [])).toThrow(
      "identity",
    );
    writeFileSync(
      path.join(root, "result"),
      JSON.stringify({ ...result, producer: {} }),
    );
    expect(() => completedFixture(root, "result", owned, [])).toThrow(
      "identity",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("retains historical registered relaunch ownership without adopting a reused live PID", () => {
  const root = mkdtempSync(path.join(tmpdir(), "omxterm-registration-"));
  try {
    const owner = { pid: 100, parent: 50, identity: "200" };
    const child = { pid: 200, parent: 100, identity: "300" };
    const directory = path.join(root, FIXTURE_PROCESS_DIRECTORY);
    mkdirSync(directory);
    writeFileSync(
      path.join(directory, "registered.json"),
      JSON.stringify({ owner, processes: [owner, child] }),
    );
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned, [])).toBe(0);
    expect(owned.get(child.pid)).toEqual(child);
    const replacement = { ...child, identity: "400" };
    owned.set(child.pid, replacement);
    collectFixtureRegistrations(root, owner.pid, owned, [replacement]);
    expect(owned.get(child.pid)).toEqual(replacement);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
