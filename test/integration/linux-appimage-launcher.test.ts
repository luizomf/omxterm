import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareLinuxLauncher } from "../../scripts/prepare-linux-launcher.mjs";
import { inspectLinuxAppRun } from "../../scripts/verify-linux-launcher.mjs";

const require = createRequire(import.meta.url);
const installedGenerator =
  require.resolve("app-builder-lib/out/targets/appimage/appImageUtil.js");
const digest = (source: Buffer) =>
  createHash("sha256").update(source).digest("hex");
const installedDigest = digest(readFileSync(installedGenerator));

// Real generated launcher, isolated fake OS probe and application executable.
// The executable reports whether the launch policy needs sandbox prerequisites.
describe("generated Linux AppRun", () => {
  let fixtureRoot: string;
  let launcher: string;
  beforeAll(async () => {
    // Keep the copied package below the repository so its external dependencies
    // resolve normally, without symlinking or modifying the installed package.
    const scratch = fileURLToPath(new URL("../../.scratch/", import.meta.url));
    mkdirSync(scratch, { recursive: true });
    fixtureRoot = mkdtempSync(path.join(scratch, "appimage-launcher-"));
    const fixturePackage = path.join(fixtureRoot, "app-builder-lib");
    cpSync(
      path.dirname(require.resolve("app-builder-lib/package.json")),
      fixturePackage,
      { recursive: true },
    );
    const fixtureGenerator = path.join(
      fixturePackage,
      "out/targets/appimage/appImageUtil.js",
    );
    await prepareLinuxLauncher(fixtureGenerator);
    const { generateAppRunScript } = require(
      fixtureGenerator,
    ) as typeof import("app-builder-lib/out/targets/appimage/appImageUtil.js");
    launcher = generateAppRunScript({
      ExecutableName: "omxterm",
      DesktopFileName: "omxterm.desktop",
      ProductFilename: "OMXTerm",
      ProductName: "OMXTerm",
      ResourceName: "appimagekit-omxterm",
    });
  });
  afterAll(() => {
    if (fixtureRoot) rmSync(fixtureRoot, { recursive: true, force: true });
  });

  it("leaves the installed AppImage generator unchanged", () => {
    expect(digest(readFileSync(installedGenerator))).toBe(installedDigest);
  });

  it
    .skipIf(process.platform === "win32")
    .each(["allowed", "denied", "missing"])(
    "disables the sandbox unconditionally with a %s namespace probe",
    (probe) => {
      const root = mkdtempSync(path.join(tmpdir(), "omxterm-launcher-"));
      try {
        writeFileSync(path.join(root, "AppRun"), launcher);
        if (probe !== "missing")
          writeFileSync(
            path.join(root, "unshare"),
            `#!/bin/sh\nexit ${probe === "allowed" ? 0 : 1}\n`,
            { mode: 0o755 },
          );
        writeFileSync(
          path.join(root, "omxterm"),
          `#!/bin/sh
for arg do
  if [ "$arg" = --no-sandbox ]; then exit 0; fi
done
printf '%s\\n' 'No usable sandbox!' >&2
exit 78
`,
          { mode: 0o755 },
        );
        const result = spawnSync("/bin/bash", [path.join(root, "AppRun")], {
          env: { PATH: root, APPDIR: root },
          encoding: "utf8",
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it("requires exact reviewed launcher bytes before packaged startup", () => {
    expect(() => inspectLinuxAppRun(launcher)).not.toThrow();
    expect(() =>
      inspectLinuxAppRun(launcher + "\nexec omxterm --no-sandbox\n"),
    ).toThrow("reviewed");
  });
  it.skipIf(process.platform === "win32")(
    "preserves literal command arguments without needing an unshare executable",
    () => {
      const root = mkdtempSync(path.join(tmpdir(), "omxterm-launcher-"));
      try {
        writeFileSync(path.join(root, "AppRun"), launcher);
        writeFileSync(
          path.join(root, "omxterm"),
          '#!/bin/sh\nprintf "%s\\n" "$@"\n',
          { mode: 0o755 },
        );
        const args = [
          "-e",
          "/bin/program with spaces",
          "",
          "--literal",
          "$(not-executed)",
          "--no-sandbox",
        ];
        const result = spawnSync(
          "/bin/bash",
          [path.join(root, "AppRun"), ...args],
          {
            env: { PATH: root, APPDIR: root },
            encoding: "utf8",
          },
        );
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(["--no-sandbox", ...args].join("\n") + "\n");
        expect(result.stderr).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
