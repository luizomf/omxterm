import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";

// CJS fixtures execute in Electron's inspector context. Their Node controls use
// in-memory OS/filesystem adapters: no display, SSH client or guest is invoked.
// Keep the runnable controls in the repository and in ordinary test/unit CI.
it.each(["validator", "ownership", "correction"])(
  "companion shortcut %s controls pass without native input",
  (name) => {
    const output = execFileSync(
      process.execPath,
      [
        "--test",
        "--test-reporter=tap",
        `test/fixtures/companion-shortcut-${name}-controls.cjs`,
      ],
      { encoding: "utf8", timeout: 10_000, maxBuffer: 1024 * 1024 },
    );
    expect(output).toMatch(/# fail 0/u);
  },
);
