import { spawnSync } from "node:child_process";
import path from "node:path";
import { expect, it } from "vitest";

it.each([0, 7])(
  "joins the spawned process and both output streams for exit %s",
  (code) => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve("test/fixtures/extension-composition-launch.cjs"),
        process.execPath,
        "-e",
        `process.stdout.write('child stdout\\n'); process.stderr.write('child stderr\\n'); process.exitCode = ${code}`,
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(code === 0 ? 0 : 1);
    expect(result.stderr).toContain("child stderr\n");
    expect(result.stdout).toContain("child stdout\n");
    const receipt = result.stdout
      .split("\n")
      .find((line) => line.startsWith("COMPOSITION_LAUNCH_RESULT:"));
    expect(receipt).toBeDefined();
    expect(
      JSON.parse(receipt!.slice("COMPOSITION_LAUNCH_RESULT:".length)),
    ).toEqual({
      exitCode: code,
      signal: null,
      exited: true,
      closed: true,
      stdoutEnded: true,
      stderrEnded: true,
      truncated: false,
    });
  },
);

it("fails on output overflow while still draining both streams", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("test/fixtures/extension-composition-launch.cjs"),
      process.execPath,
      "-e",
      "process.stdout.write('x'.repeat(1024 * 1024 + 1))",
    ],
    { encoding: "utf8", timeout: 5_000, maxBuffer: 2 * 1024 * 1024 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  const receipt = result.stdout
    .split("\n")
    .find((line) => line.startsWith("COMPOSITION_LAUNCH_RESULT:"));
  expect(receipt).toBeDefined();
  expect(
    JSON.parse(receipt!.slice("COMPOSITION_LAUNCH_RESULT:".length)),
  ).toMatchObject({
    exited: true,
    closed: true,
    stdoutEnded: true,
    stderrEnded: true,
    truncated: true,
  });
});

it("does not invent an exit when spawn fails", () => {
  const result = spawnSync(
    process.execPath,
    [
      path.resolve("test/fixtures/extension-composition-launch.cjs"),
      path.resolve(".scratch/nonexistent-composition-executable"),
    ],
    { encoding: "utf8", timeout: 5_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  const receipt = result.stdout
    .split("\n")
    .find((line) => line.startsWith("COMPOSITION_LAUNCH_RESULT:"));
  expect(receipt).toBeDefined();
  expect(
    JSON.parse(receipt!.slice("COMPOSITION_LAUNCH_RESULT:".length)),
  ).toMatchObject({
    exited: false,
    closed: true,
  });
});
