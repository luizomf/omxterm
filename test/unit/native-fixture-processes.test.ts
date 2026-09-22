import { describe, expect, it } from "vitest";
import {
  collectFixtureDescendants,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";

describe("native fixture process ownership", () => {
  it.each([
    ["300000000", "100000000", "400000000"],
    ["639256395335108210", "639256395335108209", "639256395335108211"],
  ])(
    "rejects stale Windows parent IDs using exact creation times (%s)",
    (parentBirth, orphanBirth, childBirth) => {
      const parent: FixtureProcess = {
        pid: 100,
        parent: 50,
        identity: parentBirth,
      };
      const orphan: FixtureProcess = {
        pid: 700,
        parent: 100,
        identity: orphanBirth,
      };
      const unrelatedChild: FixtureProcess = {
        pid: 701,
        parent: 700,
        identity: childBirth,
      };
      const child: FixtureProcess = {
        pid: 200,
        parent: 100,
        identity: childBirth,
      };
      const owned = new Map([[parent.pid, parent]]);

      collectFixtureDescendants([parent, orphan, unrelatedChild, child], owned);

      expect([...owned.keys()]).toEqual([100, 200]);
    },
  );

  it("keeps genuine descendants born in the same clock tick", () => {
    const parent: FixtureProcess = { pid: 100, parent: 50, identity: "300" };
    const child: FixtureProcess = { pid: 200, parent: 100, identity: "300" };
    const grandchild: FixtureProcess = {
      pid: 300,
      parent: 200,
      identity: "301",
    };
    const owned = new Map([[parent.pid, parent]]);

    collectFixtureDescendants([grandchild, parent, child], owned);

    expect([...owned.keys()]).toEqual([100, 200, 300]);
  });

  it("does not adopt children through a replaced parent identity", () => {
    const original: FixtureProcess = { pid: 100, parent: 50, identity: "100" };
    const replacement = { ...original, identity: "200" };
    const child: FixtureProcess = { pid: 300, parent: 100, identity: "300" };
    const owned = new Map([[original.pid, original]]);

    collectFixtureDescendants([replacement, child], owned);

    expect([...owned.values()]).toEqual([original]);
  });
});
