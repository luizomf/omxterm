import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

it("placement fixture controls pass without a display or native execution", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "test/fixtures/companion-placement-controls.cjs",
    ],
    { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 },
  );
  expect(output).toMatch(/# fail 0/u);
});
