import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import {
  captureModifiedHoverEvidence,
  clickTerminalCell,
  terminalCellPoint,
} from "./restty-link-gestures";

export interface LocalImageLinkEvidence {
  control: string;
  activations: number;
  grids?: Array<{ cols: number; rows: number }>;
  destinationColumns?: number;
  boundarySpaceColumn?: number;
}

export async function verifyLocalImageReference(options: {
  readonly window: BrowserWindow;
  readonly localImageRequests: LocalImageRequest[];
  readonly size: { cols: number; rows: number };
  readonly control: string;
  readonly reference: string;
  readonly name: string;
  readonly prefixColumns: number;
  readonly rootCellDelta: number;
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}): Promise<LocalImageLinkEvidence> {
  const {
    window,
    localImageRequests,
    size,
    control,
    reference,
    name,
    prefixColumns,
    rootCellDelta,
    waitFor,
  } = options;
  const destinationColumns = reference.length + rootCellDelta;
  assert.ok(
    prefixColumns + destinationColumns <= size.cols * size.rows,
    `${control} complete reference must be visible`,
  );
  if (control === "soft-wrapped PNG")
    assert.ok(
      destinationColumns > size.cols,
      "soft-wrapped PNG must actually wrap",
    );
  if (control === "space at soft-wrap boundary") {
    assert.ok(
      destinationColumns > size.cols,
      "boundary reference must actually wrap",
    );
    assert.equal(
      (reference.lastIndexOf(" ") + rootCellDelta) % size.cols,
      size.cols - 1,
      "literal filename space must occupy the final column",
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  const beforeHover = localImageRequests.length;
  const hover = await captureModifiedHoverEvidence(
    window,
    await terminalCellPoint(window, 0, prefixColumns + 2, size),
    size,
    destinationColumns,
    prefixColumns,
  ).catch((cause: unknown) => {
    throw new Error(
      `Local image hover failed: ${JSON.stringify({ control, size, destinationColumns, rootCellDelta })}: ${String(cause)}`,
      { cause },
    );
  });
  assert.ok(hover.modifiedHoverChangedPixels > 0, control);
  assert.equal(hover.releasedHoverChangedPixels, 0, control);
  assert.equal(
    localImageRequests.length,
    beforeHover,
    "hover does not request a read",
  );
  const cells = [
    ...new Set([
      prefixColumns + 2,
      prefixColumns + reference.lastIndexOf(" ") + rootCellDelta,
      prefixColumns + reference.lastIndexOf("photo") + rootCellDelta,
      ...(prefixColumns + destinationColumns > size.cols
        ? [size.cols + 2]
        : []),
    ]),
  ];
  for (const cell of cells) {
    const before = localImageRequests.length;
    await clickTerminalCell(
      window,
      Math.floor(cell / size.cols),
      cell % size.cols,
      size,
    );
    await waitFor(
      () => localImageRequests.length === before + 1,
      `${control} activation`,
    );
    const request = localImageRequests.at(-1)!;
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
  return {
    control,
    activations: cells.length,
    grids: [size],
    destinationColumns,
    ...(control === "space at soft-wrap boundary"
      ? { boundarySpaceColumn: size.cols - 1 }
      : {}),
  };
}
