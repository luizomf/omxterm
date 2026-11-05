import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { productionFixtureArguments } from "../fixtures/supported-fixture-chromium-arguments";

// Explicit built-production lane, serialized on an assigned Linux ARM64 desktop.
// Portable unit/native fixtures do not imply this opt-in production qualification.
const source = process.env.OMXTERM_FILES_PRODUCTION_SOURCE;
const https = process.env.OMXTERM_FILES_HTTPS === "1";
const consumer070 = process.env.OMXTERM_FILES_CONSUMER_070 === "1";
const archive = process.env.OMXTERM_FILES_PRODUCTION_ARCHIVE;
it.skipIf(process.platform !== "linux" || process.arch !== "arm64" || !source)(
  "installs separate Files through production Settings, uses real operations and joins normal Quit",
  { timeout: 180_000 },
  async (testContext) => {
    if (consumer070) {
      expect(https, "prepared consumer is separate from the HTTPS lane").toBe(
        false,
      );
      expect(
        archive,
        "prepared consumer needs an explicit retained archive",
      ).toBeTruthy();
      expect(path.isAbsolute(archive!)).toBe(true);
    }
    const root = await mkdtemp(
      path.join(tmpdir(), "omxterm-files-production-"),
    );
    const evidence = process.env.OMXTERM_FILES_PRODUCTION_EVIDENCE;
    const previousCA = process.env.NODE_EXTRA_CA_CERTS;
    if (https) {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          path.join(root, "key.pem"),
          "-out",
          path.join(root, "cert.pem"),
          "-days",
          "1",
          "-subj",
          "/CN=localhost",
          "-addext",
          "subjectAltName=DNS:localhost",
        ],
        { stdio: "pipe", timeout: 10_000 },
      );
      process.env.NODE_EXTRA_CA_CERTS = path.join(root, "cert.pem");
    }
    const execution = await runNativeFixture({
      executable: createRequire(import.meta.url)("electron") as string,
      // Keep this selected consumer in the initial owned process, avoiding the
      // Wayland-to-X11 detached production relaunch. Not default-backend evidence.
      args: [
        ...(consumer070 ? ["--ozone-platform=x11"] : []),
        ...productionFixtureArguments(root),
      ],
      root,
      timeout: 120_000,
      testContext,
      prepare: async () => {
        if (evidence) await mkdir(evidence, { recursive: true });
        const metadata = JSON.parse(
          await readFile(path.join(source!, "package.json"), "utf8"),
        ) as { version: string };
        await writeFile(
          path.join(root, "package.json"),
          JSON.stringify({
            name: "omxterm",
            version: metadata.version,
            type: "module",
            main: "main.mjs",
          }),
        );
        await writeFile(
          path.join(root, "fixture.json"),
          JSON.stringify({
            source: path.resolve(source!),
            evidence,
            https,
            archive,
            consumer070,
          }),
        );
        await cp(
          "test/fixtures/files-production.mjs",
          path.join(root, "main.mjs"),
        );
        await cp(
          "test/fixtures/files-070-consumer.mjs",
          path.join(root, "files-070-consumer.mjs"),
        );
      },
    }).finally(() => {
      if (previousCA === undefined) delete process.env.NODE_EXTRA_CA_CERTS;
      else process.env.NODE_EXTRA_CA_CERTS = previousCA;
    });
    if (evidence)
      await writeFile(
        path.join(evidence, "supervisor.json"),
        JSON.stringify(execution, null, 2),
      );
    expect(
      execution,
      `stdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
    ).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
      cleanupAssistance: "none",
    });
    const prefix = "__FILES_PRODUCTION__";
    const lines = execution.stdout
      .split("\n")
      .filter((line) => line.startsWith(prefix));
    expect(lines).toHaveLength(1);
    const result: unknown = JSON.parse(lines[0]!.slice(prefix.length));
    expect(result).toMatchObject({
      failed: false,
      approved: https ? 2 : 1,
      quit: "joined",
      checks: https
        ? [
            "HTTPS-cancellation-before-trust",
            "HTTPS-malformed-before-trust",
            "HTTPS-redirect-captured-trust-dormant-no-backend",
            "HTTPS-local-replacement-same-PTY",
          ]
        : consumer070
          ? [
              "Settings-captured-trust-dormant-no-backend",
              "selected-visible-toggle-header-close-destroy-empty-reveal-noop-fresh-view-same-backend-PTY",
              "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
              "menu-palette-hidden-reveal-settings-retain-same-terminal",
              "loaded-filter-retains-ancestor-clears-selection-no-recursive-search",
              "Chromium-Tab-End-F2-Cancel-focus-hide-reveal-query-retained",
              "confirmed-directory-conflict-no-clobber-source-destination-preserved",
              "one-explicit-confirmed-directory-move-same-inode-and-bytes",
              "Close-reset-Disable-Uninstall-normal-backend-exit-same-PTY",
            ]
          : [
              "Settings-captured-trust-dormant-no-backend",
              "selected-visible-toggle-header-close-destroy-empty-reveal-noop-fresh-view-same-backend-PTY",
              "explicit-hide-independent-panel-toggle-exact-view-directory-draft",
              "menu-palette-hidden-reveal-settings-retain-same-terminal",
              "real-create-folder-no-clobber-move-trash-confirmed-delete",
              "backend-loss-retires-companion-core-survives",
              "explicit-reopen-fresh-view-and-backend",
              "disable-uninstall-real-settlement-retained-draft-same-PTY",
            ],
    });
  },
);
