import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it("acknowledges only the exact composition input line", () => {
  const result = spawnSync(
    process.execPath,
    [path.resolve("test/fixtures/extension-composition-probe.cjs")],
    {
      input:
        "not-COMPOSITION_INPUT\r\nCOMPOSITION_INPUT\r\nCOMPOSITION_INPUT-extra\n",
      encoding: "utf8",
      timeout: 5_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.signal).toBeNull();
  expect(result.stderr).toBe("");
  expect(result.stdout).toBe("COMPOSITION_PROBE_READY\nCOMPOSITION_ACK\n");
});
