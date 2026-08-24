import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  CURRENT_OPERATIONAL_LOG_FILE,
  createOperationalEventLog,
} from "../../src/main/operational-events";

it("validates and persists bounded safe User Configuration reload outcomes", async () => {
  const root = await mkdtemp(
    path.join(tmpdir(), "omxterm-reload-events-test-"),
  );
  const log = createOperationalEventLog({
    environment: { XDG_STATE_HOME: root },
    homeDirectory: root,
    now: () => new Date("2026-08-24T12:00:00.000Z"),
  });
  expect(
    log.write({
      name: "configuration.reload.requested",
      trigger: "manual",
      durationMs: 0,
    }),
  ).toBe(true);
  expect(
    log.write({
      name: "configuration.reload.succeeded",
      trigger: "manual",
      durationMs: 12,
    }),
  ).toBe(true);
  expect(
    log.write({
      name: "configuration.reload.rejected",
      trigger: "manual",
      durationMs: 13,
      reason: "theme-invalid",
    }),
  ).toBe(true);
  log.flush();

  const text = await readFile(
    path.join(root, "omxterm", "logs", CURRENT_OPERATIONAL_LOG_FILE),
    "utf8",
  );
  const records = text
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(
    records.map(({ name, trigger, durationMs, reason }) => ({
      name,
      trigger,
      durationMs,
      ...(reason ? { reason } : {}),
    })),
  ).toEqual([
    {
      name: "configuration.reload.requested",
      trigger: "manual",
      durationMs: 0,
    },
    {
      name: "configuration.reload.succeeded",
      trigger: "manual",
      durationMs: 12,
    },
    {
      name: "configuration.reload.rejected",
      trigger: "manual",
      durationMs: 13,
      reason: "theme-invalid",
    },
  ]);
  expect(text).not.toContain(root);
});
