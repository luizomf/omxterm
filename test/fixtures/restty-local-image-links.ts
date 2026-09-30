import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { nativeImage, type BrowserWindow } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";
import { createNativeHostPng } from "./native-host-png";
import { withTmuxImageOutput } from "./restty-image-tmux";
import {
  captureModifiedHoverEvidence,
  clickTerminalCell,
  terminalCellPoint,
  scrollTerminal,
} from "./restty-link-gestures";

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
  readonly resizes: Array<{ cols: number; rows: number }>;
  readonly localImageRequests: LocalImageRequest[];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const { window, root, deliverOutput, waitFor } = options;
  const directory = path.join(root, "preview images", "long".repeat(25));
  await mkdir(directory, { recursive: true });
  const png = createNativeHostPng(2, 2);
  const shortPath = path.join(root, "a photo.png");
  const longPath = path.join(directory, "a photo.png");
  const jpegPath = path.join(root, "a photo.jpg");
  const columns = options.resizes.at(-1)!.cols;
  const boundaryPath = path.join(
    root,
    `${"b".repeat((columns - 2 - (root.length % columns) + columns) % columns)} photo.png`,
  );
  await writeFile(boundaryPath, png);
  await writeFile(shortPath, png);
  await writeFile(longPath, png);
  await writeFile(
    jpegPath,
    nativeImage.createFromBuffer(Buffer.from(png)).toJPEG(90),
  );
  const results: Array<{ control: string; activations: number }> = [];

  async function verify(
    control: string,
    reference: string,
    name: string,
    prefixColumns = 0,
  ) {
    const size = options.resizes.at(-1)!;
    await new Promise((resolve) => setTimeout(resolve, 100));
    const beforeHover = options.localImageRequests.length;
    const hover = await captureModifiedHoverEvidence(
      window,
      await terminalCellPoint(window, 0, prefixColumns + 2, size),
      size,
      reference.length,
      prefixColumns,
    );
    assert.ok(hover.modifiedHoverChangedPixels > 0, control);
    assert.equal(hover.releasedHoverChangedPixels, 0, control);
    assert.equal(
      options.localImageRequests.length,
      beforeHover,
      "hover does not request a read",
    );
    const cells = [
      ...new Set([
        prefixColumns + 2,
        prefixColumns + reference.indexOf(" "),
        prefixColumns + reference.indexOf("photo"),
        ...(reference.length > size.cols ? [size.cols + 2] : []),
      ]),
    ];
    for (const cell of cells) {
      const before = options.localImageRequests.length;
      await clickTerminalCell(
        window,
        Math.floor(cell / size.cols),
        cell % size.cols,
        size,
      );
      await waitFor(
        () => options.localImageRequests.length === before + 1,
        `${control} activation`,
      );
      const request = options.localImageRequests.at(-1)!;
      assert.ok(
        request.source === "native-path" || request.source === "path-reference",
      );
      assert.equal(request.path, reference, `${control} complete destination`);
      await waitFor(
        () =>
          window.webContents.executeJavaScript(
            `(() => {
        const dialog = document.querySelector('.local-image-preview');
        const image = dialog?.querySelector('img');
        return dialog?.open && !image?.hidden && image?.naturalWidth === 2 && image?.naturalHeight === 2;
      })()`,
            true,
          ),
        `${control} real loaded and decoded preview`,
      );
      assert.equal(
        await window.webContents.executeJavaScript(
          `(() => {
        const image = document.querySelector('.local-image-preview img');
        const rect = image.getBoundingClientRect();
        return image.alt === ${JSON.stringify(name)} && rect.width > 0 && rect.height > 0 && getComputedStyle(image).visibility === 'visible';
      })()`,
          true,
        ),
        true,
        `${control} visible image`,
      );
      await window.webContents.executeJavaScript(
        "document.querySelector('.local-image-preview-close').click()",
        true,
      );
      assert.equal(
        await window.webContents.executeJavaScript(
          `!document.querySelector('.local-image-preview').open && !document.querySelector('.local-image-preview img').hasAttribute('src') && document.activeElement?.closest('.restty-terminal-surface') !== null`,
          true,
        ),
        true,
        "dismissal releases source and restores focus",
      );
    }
    results.push({ control, activations: cells.length });
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
    if (control === "soft-wrapped PNG") {
      const before = options.resizes.length;
      window.setSize(640, 600);
      await waitFor(
        () => options.resizes.length > before,
        "spaced image native resize/reflow",
      );
    }
    await verify(control, reference, name, prefixColumns);
    if (control === "soft-wrapped PNG") {
      const before = options.resizes.length;
      window.setSize(760, 600);
      await waitFor(
        () => options.resizes.length > before,
        "spaced image restore/refit",
      );
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

  const beforeWide = options.resizes.length;
  window.setSize(1600, 600);
  await waitFor(
    () => options.resizes.length > beforeWide,
    "clipping control wide native refit",
  );
  size = options.resizes.at(-1)!;
  assert.ok(shortPath.length < size.cols);
  const bottomLine = `${shortPath}${" ".repeat(size.cols - shortPath.length)}continuation.png`;
  deliverOutput(
    `\u001b[3J\u001b[2J\u001b[H${Array.from({ length: size.rows - 1 }, (_, index) => `lead-${index}`).join("\r\n")}\r\n${bottomLine}\r\n${Array.from({ length: size.rows }, (_, index) => `trail-${index}`).join("\r\n")}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await scrollTerminal(window, 1, 1, size, -1000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const beforeBottomClip = options.localImageRequests.length;
  await clickTerminalCell(window, size.rows - 1, 2, size);
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(
    options.localImageRequests.length,
    beforeBottomClip,
    "literal spaces at viewport bottom must not activate an incomplete whole line",
  );
  results.push({ control: "space clipped below viewport", activations: 0 });
  const beforeRestore = options.resizes.length;
  window.setSize(760, 600);
  await waitFor(
    () => options.resizes.length > beforeRestore,
    "clipping control restore/refit",
  );

  // A printed trailing space is not blank cell padding: keep the old token
  // grammar here rather than silently opening the existing full spaced file.
  deliverOutput(`\u001b[3J\u001b[2J\u001b[H${shortPath} `);
  await new Promise((resolve) => setTimeout(resolve, 100));
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
}
