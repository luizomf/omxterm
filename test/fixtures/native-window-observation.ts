import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { prepareFixture } from "./prepare-fixture";
import { removeFailedFixture } from "./remove-failed-fixture";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "./run-native-fixture";
import {
  nativeWindowDiscoveryTimeout,
  readNativeWindowObservation,
  rejectLegacyNativeWindowDeclarations,
  type NativeWindowKind,
  type ChromeNativeExpectation,
} from "./window-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
export type NativeObservationControl =
  | "missing-report"
  | "duplicate-report"
  | "error"
  | "initial-hidden"
  | "initial-maximized"
  | "held-health"
  | "nonzero-report";

/** Fresh evidence owned by this call, not a desktop capability cache. */
export function observeNativeWindow(
  kind: "cursor",
  dpr?: number,
  control?: NativeObservationControl,
  testContext?: NativeFixtureTestContext,
): Promise<"early-minimize" | "early-hide">;
export function observeNativeWindow(
  kind: "chrome",
  dpr?: number,
  control?: NativeObservationControl,
  testContext?: NativeFixtureTestContext,
): Promise<ChromeNativeExpectation>;
export async function observeNativeWindow(
  kind: NativeWindowKind,
  dpr = kind === "cursor" ? 1 : 0,
  control?: NativeObservationControl,
  testContext?: NativeFixtureTestContext,
) {
  rejectLegacyNativeWindowDeclarations();
  const request = { id: randomUUID(), kind, platform: process.platform, dpr };
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-native-window-"));
  const prepare = () =>
    prepareFixture(root, async (start) => {
      await Promise.all([
        start(() =>
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["test/fixtures/native-window-observation-main.ts"],
            external: ["electron"],
            format: "cjs",
            platform: "node",
            logLevel: "silent",
            outfile: path.join(root, "main.cjs"),
          }),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "omxterm-independent-native-window",
              main: "main.cjs",
            }),
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "index.html"),
            "<!doctype html><title>Independent native window fixture</title><script>globalThis.fixtureResponsive = true;</script>",
          ),
        ),
      ]);
    });
  let supervised = false;
  try {
    const executable = createRequire(import.meta.url)("electron") as string;
    supervised = true;
    const result = await runNativeFixture({
      executable,
      args: [
        ...(process.platform === "linux"
          ? ["--no-sandbox", "--ozone-platform=x11"]
          : []),
        ...(dpr ? [`--force-device-scale-factor=${dpr}`] : []),
        root,
        `--observation-id=${request.id}`,
        `--observation-kind=${kind}`,
        ...(control ? [`--observation-control=${control}`] : []),
      ],
      root,
      timeout: nativeWindowDiscoveryTimeout(kind),
      ...(testContext ? { testContext } : {}),
      prepare,
    });
    let selected: ReturnType<typeof readNativeWindowObservation>;
    try {
      selected = readNativeWindowObservation(result, request);
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Invalid independent native observation",
        { cause: result },
      );
    }
    // The supervisor owns profile removal; file absence alone is not success.
    try {
      await stat(root);
      throw new Error("Independent native observation profile retained");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    return selected;
  } catch (error) {
    if (!supervised) await removeFailedFixture(root, error);
    throw error;
  }
}
