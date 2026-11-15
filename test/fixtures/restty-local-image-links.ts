import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativeImage, type BrowserWindow } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";
import { createNativeHostPng } from "./native-host-png";
import { withTmuxImageOutput } from "./restty-image-tmux";
import { localImageFixturePaths } from "./restty-local-image-paths";
import { withLocalImageFixtureLayout } from "./restty-local-image-layout";
import { readResttyImageCellSize } from "./restty-host-images";
import {
  measureLocalImageRoot,
  type LocalImageCoreCells,
} from "./restty-local-image-root";
import {
  localImageClippingReady,
  planLocalImageClipping,
} from "./restty-local-image-clipping";
import { readCellSnapshot } from "./restty-link-input";
import { readLocalImageCoreCells } from "./restty-local-image-core-probe";
import { exerciseUnicodeLocalImageRoots } from "./restty-local-image-unicode";
import {
  verifyLocalImageReference,
  type LocalImageLinkEvidence,
} from "./restty-local-image-reference";
import { clickTerminalCell, scrollTerminal } from "./restty-link-gestures";

// Clicks resolve against the last rendered cells, and a busy renderer can draw
// after any fixed delay. Deliver ASCII output at cell zero and wait until a
// submitted frame shows it.
async function deliverUntilRendered(
  {
    window,
    deliverOutput,
    waitFor,
  }: Pick<
    Parameters<typeof exerciseResttyLocalImageLinks>[0],
    "window" | "deliverOutput" | "waitFor"
  >,
  text: string,
  label: string,
) {
  const destination = `[...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0)?.__resttyLinkDestinationFixture`;
  await window.webContents.executeJavaScript(
    `${destination}.prepare(${JSON.stringify(text)})`,
    true,
  );
  deliverOutput(`\u001b[3J\u001b[2J\u001b[H${text}`);
  try {
    await waitFor(
      () =>
        window.webContents.executeJavaScript(
          `${destination}.snapshot()?.matches === true`,
          true,
        ),
      label,
    );
  } finally {
    await window.webContents.executeJavaScript(`${destination}?.clear()`, true);
  }
}

export function fixtureLocalImageLoader(
  window: BrowserWindow,
  root: string,
  requests: LocalImageRequest[],
) {
  return async (request: LocalImageRequest, signal: AbortSignal) => {
    requests.push(request);
    // Gesture-only references cancel; owned synthetic files use the real reader.
    if (
      (request.source === "native-path" ||
        request.source === "path-reference") &&
      (request.path.startsWith(root) || request.path.startsWith(`'${root}`))
    )
      return loadLocalImageForWindow(window, request, signal);
    return null;
  };
}

export async function exerciseResttyLocalImageLinks(options: {
  readonly window: BrowserWindow;
  readonly root: string;
  readonly deliverOutput: (data: string) => void;
  readonly input: () => string;
  readonly resizes: Array<{ cols: number; rows: number }>;
  readonly localImageRequests: LocalImageRequest[];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const { window, root, deliverOutput, waitFor } = options;
  const deviceCellSize = await readResttyImageCellSize(
    deliverOutput,
    options.input,
    waitFor,
  );
  const dpr = (await window.webContents.executeJavaScript(
    "devicePixelRatio",
    true,
  )) as number;
  const cellSize = deviceCellSize.map((value) => value / dpr) as [
    number,
    number,
  ];
  return withLocalImageFixtureLayout(
    { ...options, cellSize, dpr },
    async (refit) => {
      const baseGrid = await refit("base");
      const rootPrefix = path.join(root, "x").slice(0, -1);
      const rootPrefixColumns = await measureLocalImageRoot({
        ...options,
        rootPrefix,
        size: baseGrid,
        readCells: () => readLocalImageCoreCells(window),
      });
      const rootCellDelta = rootPrefixColumns - rootPrefix.length;
      const { shortPath, longPath, jpegPath, boundaryPath } =
        localImageFixturePaths(root, baseGrid.cols, rootPrefixColumns);
      await mkdir(path.dirname(longPath), { recursive: true });
      await mkdir(path.dirname(boundaryPath), { recursive: true });
      const png = createNativeHostPng(2, 2);
      await writeFile(boundaryPath, png);
      await writeFile(shortPath, png);
      await writeFile(longPath, png);
      await writeFile(
        jpegPath,
        nativeImage.createFromBuffer(Buffer.from(png)).toJPEG(90),
      );
      const results: LocalImageLinkEvidence[] = [];
      async function verify(
        control: string,
        reference: string,
        name: string,
        prefixColumns = 0,
        afterRestore = false,
      ) {
        const evidence = await verifyLocalImageReference({
          ...options,
          control,
          reference,
          name,
          prefixColumns,
          rootCellDelta,
          deviceCellSize,
          size: options.resizes.at(-1)!,
        });
        if (afterRestore) {
          const prior = results.at(-1)!;
          assert.equal(prior.control, control);
          prior.activations += evidence.activations;
          prior.grids!.push(...evidence.grids!);
        } else results.push(evidence);
      }
      for (const [control, reference, name, prefixColumns] of [
        ["unquoted PNG", shortPath, "a photo.png", 0],
        ["unquoted JPEG", jpegPath, "a photo.jpg", 0],
        ["soft-wrapped PNG", longPath, "a photo.png", 0],
        [
          "space at soft-wrap boundary",
          boundaryPath,
          path.basename(boundaryPath),
          0,
        ],
        [
          "quoted Unicode prefix and location",
          `'${longPath}':12:3`,
          "a photo.png",
          4,
        ],
      ] as const) {
        const prefix = prefixColumns ? "漢e\u0301 " : "";
        deliverOutput(
          `\u001b[?1000l\u001b[?1006l\u001b[3J\u001b[2J\u001b[H\u001b[?25l${prefix}${reference}`,
        );
        if (control === "soft-wrapped PNG") await refit("shrunk");
        await verify(control, reference, name, prefixColumns);
        if (control === "soft-wrapped PNG") {
          await refit("base");
          // Check the same output after widening, without clearing/reprinting.
          await verify(control, reference, name, prefixColumns, true);
        }
      }
      let size = options.resizes.at(-1)!;
      deliverOutput(
        `\u001b[3J\u001b[2J\u001b[H${boundaryPath}\r\n${Array.from({ length: size.rows - 1 }, (_, index) => `neighbor-${index}`).join("\r\n")}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const beforeTopClip = options.localImageRequests.length;
      await clickTerminalCell(window, 0, 2, size);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(
        options.localImageRequests.length,
        beforeTopClip,
        "row-end space above viewport must not activate the suffix",
      );
      results.push({ control: "space clipped above viewport", activations: 0 });

      size = await refit("wide");
      let shortPathColumns: number | undefined;
      let clipping: ReturnType<typeof planLocalImageClipping> | undefined;
      let clippingCells: LocalImageCoreCells | null = null;
      let clippingReady = false;
      async function recordClipping(stage: "ready" | "failed") {
        const { geometry } = await readCellSnapshot(window);
        const content = (await window.webContents.executeJavaScript(
          `(() => {
            const { width, height } = document.querySelector('#terminal-window-content').getBoundingClientRect();
            return { width, height };
          })()`,
          true,
        )) as { width: number; height: number };
        // Fixture-only bounded geometry; never emit the root, path or core text.
        process.stdout.write(
          `__OMXTERM_IMAGE_CLIPPING__${JSON.stringify({
            stage,
            grid: size,
            pathColumns: shortPathColumns,
            prefixRows: clipping?.prefixRows,
            paddingCells: clipping?.paddingCells,
            leadRows: clipping?.leadRows,
            click: clipping && {
              row: clipping.clickRow,
              col: clipping.clickCol,
            },
            observedGrid: clippingCells && {
              cols: clippingCells.cols,
              rows: clippingCells.rows,
            },
            ready: clippingReady,
            selectedCodeUnits: clippingCells?.text.length,
            requests: options.localImageRequests.length,
            geometry,
            content,
            deviceCellSize,
          })}\n`,
        );
      }
      try {
        // A wide-wrap spacer can appear/disappear on refit: the base-grid root
        // delta is NOT a width for this grid. Measure the complete path here.
        shortPathColumns = await measureLocalImageRoot({
          ...options,
          rootPrefix: shortPath,
          size,
          readCells: () => readLocalImageCoreCells(window),
        });
        const plan = planLocalImageClipping(shortPath, shortPathColumns, size);
        clipping = plan;
        deliverOutput(plan.output);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await scrollTerminal(window, 1, 1, size, -1000);
        await new Promise((resolve) => setTimeout(resolve, 100));
        await waitFor(async () => {
          clippingCells = await readLocalImageCoreCells(window);
          clippingReady = localImageClippingReady(
            clippingCells,
            shortPath,
            plan,
          );
          return clippingReady;
        }, "complete visible clipping prefix and literal bottom-edge spaces in actual core");
        await recordClipping("ready");
        const beforeBottomClip = options.localImageRequests.length;
        await clickTerminalCell(window, plan.clickRow, plan.clickCol, size);
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          options.localImageRequests.length,
          beforeBottomClip,
          "literal spaces at viewport bottom must not activate an incomplete whole line",
        );
      } catch (cause) {
        await recordClipping("failed");
        throw cause;
      }
      results.push({ control: "space clipped below viewport", activations: 0 });
      await refit("base");

      // A printed trailing space is not blank cell padding: retain token grammar
      // rather than silently opening the existing full spaced file.
      await deliverUntilRendered(options, `${shortPath} `, "trailing path");
      const beforeTrailing = options.localImageRequests.length;
      await clickTerminalCell(window, 0, 2, options.resizes.at(-1)!);
      await waitFor(
        () => options.localImageRequests.length === beforeTrailing + 1,
        "trailing-space token activation",
      );
      const trailingRequest = options.localImageRequests.at(-1)!;
      assert.ok(trailingRequest.source === "native-path");
      assert.equal(
        trailingRequest.path,
        shortPath.split(" ")[0],
        "trailing space must not expand to the full spaced filename",
      );
      await waitFor(
        () =>
          window.webContents.executeJavaScript(
            "document.querySelector('.local-image-preview').open && !document.querySelector('.local-image-preview-error').hidden",
            true,
          ),
        "missing token gets fixed failure rather than a different image",
      );
      await window.webContents.executeJavaScript(
        "document.querySelector('.local-image-preview-close').click()",
        true,
      );
      results.push({ control: "trailing-space exclusion", activations: 1 });

      results.push(
        ...(await exerciseUnicodeLocalImageRoots(
          options,
          refit,
          deviceCellSize,
        )),
      );

      if (process.env["OMXTERM_TEST_IMAGE_TMUX"] === "1") {
        for (const reference of [longPath, boundaryPath])
          await withTmuxImageOutput({
            root,
            reference,
            size: options.resizes.at(-1)!,
            deliverOutput,
            waitFor,
            check: (phase) =>
              verify(
                `${phase}${reference === boundaryPath ? " boundary" : ""}`,
                reference,
                path.basename(reference),
              ),
          });
      }
      return results;
    },
  );
}
