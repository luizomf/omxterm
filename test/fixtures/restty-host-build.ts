import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { resttyImageEmitterSource } from "./restty-host-images";
import { resttyFontMutationProbe } from "./restty-font-mutation-probe";
import { resttyHoverProbe } from "./restty-hover-observer";
import { resttyLinkCancellationMutation } from "./restty-link-cancellation-mutation";
import { createNativeHostPng } from "./native-host-png";
import {
  resttyHostOracleRendererControl,
  type HostOracleRendererControl,
} from "./restty-host-oracle-controls";

import {
  resttyGestureRoutingMutation,
  type ResttyGestureControl,
} from "./restty-gesture-routing-mutation";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function buildHostFixture(
  root: string,
  {
    focusedCancellation = false,
    cancellation,
    oracleControl,
    gestureControl,
  }: {
    focusedCancellation?: boolean;
    cancellation?: "pointercancel" | "blur";
    oracleControl?: HostOracleRendererControl;
    gestureControl?: ResttyGestureControl;
  } = {},
): Promise<void> {
  await mkdir(path.join(root, "renderer"), { recursive: true });
  const tasks: (() => Promise<unknown>)[] = [
    () =>
      build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ["test/fixtures/restty-host-main.ts"],
        external: ["electron", "node-pty"],
        format: "cjs",
        logLevel: "silent",
        outfile: path.join(root, "main.cjs"),
        platform: "node",
      }),
    () =>
      build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ["src/preload/index.ts"],
        external: ["electron"],
        format: "cjs",
        logLevel: "silent",
        outfile: path.join(root, "preload.cjs"),
        platform: "node",
      }),
    () =>
      build({
        absWorkingDir: projectRoot,
        bundle: true,
        entryPoints: ["src/renderer/index.ts"],
        format: "iife",
        loader: { ".ttf": "binary" },
        plugins: [
          ...(focusedCancellation
            ? [resttyHoverProbe]
            : [resttyFontMutationProbe]),
          ...(cancellation
            ? [resttyLinkCancellationMutation(cancellation)]
            : []),
          ...(oracleControl
            ? [resttyHostOracleRendererControl(oracleControl)]
            : []),
          ...(gestureControl
            ? [resttyGestureRoutingMutation(gestureControl)]
            : []),
        ],
        logLevel: "silent",
        outfile: path.join(root, "renderer", "index.js"),
        platform: "browser",
      }),
    () =>
      cp(
        path.join(projectRoot, "src", "renderer", "index.html"),
        path.join(root, "renderer", "index.html"),
      ),
    () =>
      writeFile(
        path.join(root, "package.json"),
        `${JSON.stringify({ name: "omxterm-restty-host-fixture", main: "main.cjs" })}\n`,
      ),
    ...(!focusedCancellation
      ? [
          () =>
            writeFile(
              path.join(root, "pi-2000.png"),
              createNativeHostPng(2_000, 2_000),
            ),
          () =>
            writeFile(
              path.join(root, "image-emitter.cjs"),
              resttyImageEmitterSource(),
            ),
        ]
      : []),
    () =>
      symlink(
        path.join(projectRoot, "node_modules"),
        path.join(root, "node_modules"),
        "dir",
      ),
  ];
  // Start together, turning synchronous setup errors into joinable rejections.
  const pending = tasks.map((task) => Promise.resolve().then(task));
  try {
    await Promise.all(pending);
  } catch (error) {
    // The caller may remove this unsupervised profile as soon as we reject.
    // Preserve the first failure, but let every started writer finish first.
    await Promise.allSettled(pending);
    throw error;
  }
}
