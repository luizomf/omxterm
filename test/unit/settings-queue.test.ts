import { expect, it } from "vitest";
import { createSettingsQueue } from "../../src/main/settings-queue";
import type {
  SettingsChange,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";

const snapshot: SettingsSnapshot = {
  configurationPath: "/synthetic/config.json",
  platform: "linux",
  revision: "r1",
  text: null,
  values: {},
};
const saved = (change: SettingsChange): SettingsResult => ({
  status: "saved",
  snapshot: { ...snapshot, values: { [change.path]: change.value } },
  application: { applied: true, notices: [] },
  lifetimes: [],
});

it("keeps a running adjustment and only the latest consecutive waiting value", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const calls: SettingsChange[] = [];
  const queue = createSettingsQueue(async (change) => {
    calls.push(change);
    if (calls.length === 1) await gate;
    return saved(change);
  });
  const first = queue.change({ path: "window.transparency", value: 0.1 });
  await Promise.resolve();
  const skipped = queue.change({ path: "window.transparency", value: 0.2 });
  const last = queue.change({ path: "window.transparency", value: 0.9 });
  const reopened = queue.run(async () => snapshot);
  release();
  expect(await first).toMatchObject({
    status: "saved",
    snapshot: { values: { "window.transparency": 0.1 } },
  });
  expect(await skipped).toMatchObject({
    status: "superseded",
    snapshot: { values: { "window.transparency": 0.9 } },
  });
  expect(await last).toMatchObject({
    status: "saved",
    snapshot: { values: { "window.transparency": 0.9 } },
  });
  await reopened;
  expect(calls.map((change) => change.value)).toEqual([0.1, 0.9]);
});

it.each(["read", "blur", "theme", "field"])(
  "never coalesces across an intervening %s",
  async (barrier) => {
    const calls: (SettingsChange | "read")[] = [];
    const queue = createSettingsQueue(async (change) => {
      calls.push(change);
      return saved(change);
    });
    const before = queue.change({ path: "window.transparency", value: 0.2 });
    const middle =
      barrier === "read"
        ? queue.run(async () => {
            calls.push("read");
            return snapshot;
          })
        : queue.change({
            path:
              barrier === "blur"
                ? "window.blur"
                : barrier === "theme"
                  ? "theme.path"
                  : "confirmClose",
            value: barrier === "theme" ? null : true,
          });
    const after = queue.change({ path: "window.transparency", value: 0.8 });
    expect(await before).toMatchObject({ status: "saved" });
    await middle;
    expect(await after).toMatchObject({ status: "saved" });
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual({ path: "window.transparency", value: 0.2 });
    expect(calls[2]).toEqual({ path: "window.transparency", value: 0.8 });
  },
);

it.each(["conflict", "failed", "rejected"] as const)(
  "preserves the winning adjustment's %s outcome",
  async (status) => {
    const queue = createSettingsQueue(async () => ({
      status,
      snapshot,
      message: { kind: "conflict" },
    }));
    const skipped = queue.change({ path: "window.transparency", value: 0.2 });
    const winner = queue.change({ path: "window.transparency", value: 0.7 });
    expect(await skipped).toEqual({ status: "superseded", snapshot });
    expect(await winner).toEqual({
      status,
      snapshot,
      message: { kind: "conflict" },
    });
  },
);
