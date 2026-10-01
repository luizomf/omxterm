import type { BrowserWindow } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import {
  exerciseResttyLinkCancellation,
  type ResttyLinkCancellationEvidence,
} from "./restty-link-cancellation";

interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
}

export interface ResttyLinkGestureOptions {
  readonly window: BrowserWindow;
  readonly deliverOutput: (data: string) => void;
  readonly inputs: string[];
  readonly resizes: TerminalSize[];
  readonly externalLinks: string[];
  readonly localImageRequests: LocalImageRequest[];
  readonly waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}

export interface ResttyLinkGestureEvidence {
  readonly modifiedHoverChangedPixels: number;
  readonly releasedHoverChangedPixels: number;
  readonly validLinkMouseReports: string;
  readonly localPathMouseReports: string;
  readonly ordinaryGestureMouseReports: string;
  readonly wheelMouseReports: string;
  readonly alternateScreenMouseReports: string;
  readonly linkCancellation: ResttyLinkCancellationEvidence;
}

export async function terminalCellPoint(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  return (await window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!canvas) throw new Error('Visible Restty canvas is missing');
      const bounds = canvas.getBoundingClientRect();
      return { x: Math.floor(bounds.left + ((${col} + 0.5) * bounds.width / ${size.cols})), y: Math.floor(bounds.top + ((${row} + 0.5) * bounds.height / ${size.rows})) };
    })()`,
    true,
  )) as { x: number; y: number };
}

async function captureTerminalCanvas(
  window: BrowserWindow,
): Promise<{ bitmap: Buffer; width: number; height: number }> {
  const bounds = (await window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
      if (!canvas) throw new Error('Visible Restty canvas is missing');
      const rect = canvas.getBoundingClientRect();
      return { x: Math.floor(rect.left), y: Math.floor(rect.top), width: Math.floor(rect.width), height: Math.floor(rect.height) };
    })()`,
    true,
  )) as { x: number; y: number; width: number; height: number };
  const image = await window.webContents.capturePage(bounds);
  return { bitmap: Buffer.from(image.toBitmap()), ...image.getSize() };
}

function changedPixels(first: Buffer, second: Buffer): number {
  if (first.length !== second.length)
    throw new Error("Restty hover captures changed dimensions");
  let changed = 0;
  for (let offset = 0; offset < first.length; offset += 4) {
    if (
      first[offset] !== second[offset] ||
      first[offset + 1] !== second[offset + 1] ||
      first[offset + 2] !== second[offset + 2] ||
      first[offset + 3] !== second[offset + 3]
    )
      changed += 1;
  }
  return changed;
}

export async function captureModifiedHoverEvidence(
  window: BrowserWindow,
  point: { readonly x: number; readonly y: number },
  size: TerminalSize,
  destinationColumns: number,
  prefixColumns = 4,
): Promise<{
  readonly modifiedHoverChangedPixels: number;
  readonly releasedHoverChangedPixels: number;
}> {
  const dispatchPointer = (modified: boolean) =>
    window.webContents.executeJavaScript(
      `(() => {
        const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 91, pointerType: 'mouse', clientX: ${point.x}, clientY: ${point.y}, metaKey: ${modified && process.platform === "darwin"}, ctrlKey: ${modified && process.platform !== "darwin"} }));
      })()`,
      true,
    );
  await dispatchPointer(false);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const baseline = await captureTerminalCanvas(window);
  await dispatchPointer(true);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const active = await captureTerminalCanvas(window);
  await window.webContents.executeJavaScript(
    `window.dispatchEvent(new KeyboardEvent('keyup', { key: '${process.platform === "darwin" ? "Meta" : "Control"}' }))`,
    true,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const released = await captureTerminalCanvas(window);
  // Every destination cell, including the wide continuation and soft-wrapped
  // rows, must gain pixels; prefix and unrelated cells must not change.
  const checkedCells =
    Math.ceil((prefixColumns + destinationColumns) / size.cols) * size.cols;
  for (let index = 0; index < checkedCells; index += 1) {
    const row = Math.floor(index / size.cols);
    const col = index % size.cols;
    let count = 0;
    for (
      let y = Math.ceil((row * baseline.height) / size.rows);
      y < Math.floor(((row + 1) * baseline.height) / size.rows);
      y += 1
    ) {
      for (
        let x = Math.ceil((col * baseline.width) / size.cols);
        x < Math.floor(((col + 1) * baseline.width) / size.cols);
        x += 1
      ) {
        const offset = (y * baseline.width + x) * 4;
        if (
          !baseline.bitmap
            .subarray(offset, offset + 4)
            .equals(active.bitmap.subarray(offset, offset + 4))
        )
          count += 1;
      }
    }
    if (
      (index >= prefixColumns && index < prefixColumns + destinationColumns) !==
      count > 0
    )
      throw new Error(`Hover cell geometry mismatch at ${row}:${col}`);
  }
  return {
    modifiedHoverChangedPixels: changedPixels(baseline.bitmap, active.bitmap),
    releasedHoverChangedPixels: changedPixels(baseline.bitmap, released.bitmap),
  };
}

async function exerciseHoverRecognition(
  options: ResttyLinkGestureOptions,
  size: TerminalSize,
): Promise<void> {
  const nativePath =
    process.platform === "win32" ? "C:\\tmp\\漢.png" : "/tmp/漢.png";
  for (const [text, columns] of [
    ["file:///tmp/image.png", 21],
    [nativePath, nativePath.length + 1],
    ["relative.png", 12],
    ["'~/a space.png':1", 17],
    ["'../a space.png'", 16],
    ["HTTPS://example.test", 0],
    ["mailto:person@example.test", 0],
    ["\u001b]8;;https://hidden.test\u0007label\u001b]8;;\u0007", 0],
  ] as const) {
    options.deliverOutput(`\u001b[2J\u001b[H漢e\u0301 ${text}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await captureModifiedHoverEvidence(
      options.window,
      await terminalCellPoint(options.window, 0, 4, size),
      size,
      columns,
    );
  }
}

export async function clickTerminalCell(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  const point = await terminalCellPoint(window, row, col, size);
  const modifiers: Array<"meta" | "control"> =
    process.platform === "darwin" ? ["meta"] : ["control"];
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: point.x,
    y: point.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
}

export async function scrollTerminal(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
  deltaY: number,
): Promise<void> {
  const point = await terminalCellPoint(window, row, col, size);
  await window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: ${point.x}, clientY: ${point.y}, deltaMode: 1, deltaY: ${deltaY} }));
    })()`,
    true,
  );
}

async function exerciseLocalPathActivation(
  options: Pick<
    ResttyLinkGestureOptions,
    "window" | "deliverOutput" | "inputs" | "localImageRequests" | "waitFor"
  >,
  size: TerminalSize,
): Promise<string> {
  const localPath =
    process.platform === "win32"
      ? `C:\\tmp\\${"local".repeat(size.cols)}%23#fixture.data`
      : `/tmp/${"local".repeat(size.cols)}%23#fixture.data`;
  options.deliverOutput(`\u001b[2J\u001b[H${localPath}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const inputStart = options.inputs.join("").length;
  await clickTerminalCell(options.window, 0, 3, size);
  await options.waitFor(
    () => options.localImageRequests.length === 1,
    "soft-wrapped native-path activation",
  );
  const request = options.localImageRequests[0];
  if (request?.source !== "native-path" || request.path !== localPath)
    throw new Error("Native-path activation changed the literal destination");
  for (const reference of [
    "~/image.png:1",
    "../image.png",
    `'${localPath} space.png':12:3`,
  ]) {
    options.deliverOutput(`\u001b[2J\u001b[H${reference}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const count = options.localImageRequests.length;
    await clickTerminalCell(options.window, 0, 3, size);
    await options.waitFor(
      () => options.localImageRequests.length === count + 1,
      "visible image reference activation",
    );
    const request = options.localImageRequests.at(-1);
    if (request?.source !== "path-reference" || request.path !== reference)
      throw new Error("Image reference activation changed its visible text");
  }
  return gestureInputSince(options.inputs, inputStart);
}

function gestureInputSince(inputs: readonly string[], start: number): string {
  // Concurrent native fixtures may change window focus. Ignore only focus
  // reports; duplicate mouse or other unexpected input still fails assertions.
  return inputs
    .join("")
    .slice(start)
    .replaceAll(/\u001b\[[IO]/gu, "");
}

export async function exerciseResttyLinks(
  options: ResttyLinkGestureOptions,
): Promise<ResttyLinkGestureEvidence> {
  const { window, deliverOutput, inputs, resizes, externalLinks, waitFor } =
    options;
  const size = resizes.at(-1);
  if (!size) throw new Error("Restty link fixture has no grid size");
  const visibleUrl = `https://example.test/漢${"a".repeat(size.cols)}`;
  deliverOutput(
    `\u001b[2J\u001b[H\u001b[?25l\u001b[?1000h\u001b[?1006h漢e\u0301 ${visibleUrl}`,
  );
  deliverOutput("\u001b[?1049halternate\u001b[?1049l");
  const resizeCountBeforeReflow = resizes.length;
  window.setSize(760, 600);
  await waitFor(
    () => resizes.length > resizeCountBeforeReflow,
    "Restty link reflow",
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const reflowedSize = resizes.at(-1);
  if (!reflowedSize) throw new Error("Restty reflow returned no grid size");
  const hoverEvidence = await captureModifiedHoverEvidence(
    window,
    await terminalCellPoint(window, 0, 4, reflowedSize),
    reflowedSize,
    visibleUrl.length + 1,
  );
  const { modifiedHoverChangedPixels, releasedHoverChangedPixels } =
    hoverEvidence;
  await exerciseHoverRecognition(options, reflowedSize);
  const modifiers: Array<"meta" | "control"> =
    process.platform === "darwin" ? ["meta"] : ["control"];
  deliverOutput(
    `\u001b[2J\u001b[H漢e\u0301 \u001b]8;;https://hidden.test/different\u0007${visibleUrl}\u001b]8;;\u0007`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));

  const inputBeforeLinks = inputs.join("");
  await clickTerminalCell(window, 0, 4, reflowedSize);
  await clickTerminalCell(window, 1, 2, reflowedSize);
  await waitFor(
    () => externalLinks.length === 2,
    "repeated visible link activation",
  );
  const validLinkMouseReports = gestureInputSince(
    inputs,
    inputBeforeLinks.length,
  );

  const localPathMouseReports = await exerciseLocalPathActivation(
    options,
    reflowedSize,
  );

  deliverOutput("\u001b[2J\u001b[Hhttps://one.test/a,\r\nhttps://two.test/b");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickTerminalCell(window, 0, 3, reflowedSize);
  await clickTerminalCell(window, 1, 3, reflowedSize);
  await waitFor(() => externalLinks.length === 4, "hard-break link separation");

  const ordinaryStart = inputs.join("").length;
  const first = await terminalCellPoint(window, 0, 3, reflowedSize);
  const second = await terminalCellPoint(window, 1, 3, reflowedSize);
  for (const event of [
    {
      type: "mouseDown" as const,
      point: first,
      button: "left" as const,
      modified: true,
    },
    {
      type: "mouseMove" as const,
      point: second,
      button: "left" as const,
      modified: true,
    },
    {
      type: "mouseUp" as const,
      point: second,
      button: "left" as const,
      modified: true,
    },
    {
      type: "mouseDown" as const,
      point: first,
      button: "left" as const,
      modified: false,
    },
    {
      type: "mouseUp" as const,
      point: first,
      button: "left" as const,
      modified: false,
    },
    {
      type: "mouseDown" as const,
      point: first,
      button: "middle" as const,
      modified: true,
    },
    {
      type: "mouseUp" as const,
      point: first,
      button: "middle" as const,
      modified: true,
    },
  ])
    window.webContents.sendInputEvent({
      type: event.type,
      x: event.point.x,
      y: event.point.y,
      button: event.button,
      clickCount: 1,
      ...(event.modified ? { modifiers } : {}),
    });
  await new Promise((resolve) => setTimeout(resolve, 100));

  const sameSpanPoint = await terminalCellPoint(window, 0, 3, reflowedSize);
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: sameSpanPoint.x,
    y: sameSpanPoint.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
  deliverOutput("\u001b[Hhttps://new.test/b");
  await new Promise((resolve) => setTimeout(resolve, 100));
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: sameSpanPoint.x,
    y: sameSpanPoint.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: sameSpanPoint.x,
    y: sameSpanPoint.y,
    button: "left",
    clickCount: 1,
    modifiers,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: sameSpanPoint.x,
    y: sameSpanPoint.y,
    button: "left",
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (externalLinks.length !== 4)
    throw new Error(
      "Changed-target or released-modifier gesture opened a link",
    );
  const ordinaryGestureMouseReports = inputs.join("").slice(ordinaryStart);

  const wheelStart = inputs.join("").length;
  await scrollTerminal(window, 0, 3, reflowedSize, 2);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const wheelMouseReports = inputs.join("").slice(wheelStart);

  const alternateStart = inputs.join("").length;
  deliverOutput("\u001b[?1049h");
  const alternatePoint = await terminalCellPoint(window, 0, 3, reflowedSize);
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: alternatePoint.x,
    y: alternatePoint.y,
    button: "left",
    clickCount: 1,
  });
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: alternatePoint.x,
    y: alternatePoint.y,
    button: "left",
    clickCount: 1,
  });
  await scrollTerminal(window, 0, 3, reflowedSize, -1);
  deliverOutput("\u001b[?1049l");
  await new Promise((resolve) => setTimeout(resolve, 100));
  const alternateScreenMouseReports = inputs.join("").slice(alternateStart);

  deliverOutput("\u001b[?1000l\u001b[?1006l\u001b[3J\u001b[2J\u001b[H");
  const scrollbackUrl = "https://scroll.test/complete";
  deliverOutput(
    `${scrollbackUrl}\r\n${Array.from({ length: reflowedSize.rows }, (_, index) => `scroll-${index}`).join("\r\n")}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await scrollTerminal(window, 1, 1, reflowedSize, -1);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickTerminalCell(window, 0, 3, reflowedSize);
  await waitFor(
    () => externalLinks.length === 5,
    "fully visible scrollback link activation",
  );

  deliverOutput("\u001b[3J\u001b[2J\u001b[H");
  const clippedUrl = `https://clipped.test/${"z".repeat(reflowedSize.cols)}`;
  deliverOutput(
    `${clippedUrl}\r\n${Array.from({ length: reflowedSize.rows - 1 }, (_, index) => `clip-${index}`).join("\r\n")}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickTerminalCell(window, 0, 3, reflowedSize);
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (Number(externalLinks.length) !== 5)
    throw new Error("Destination clipped above the viewport opened a link");

  deliverOutput("\u001b[3J\u001b[2J\u001b[H");
  const clippedEndUrl = `https://clipped-end.test/${"q".repeat(reflowedSize.cols)}`;
  deliverOutput(
    `${Array.from({ length: reflowedSize.rows - 1 }, (_, index) => `lead-${index}`).join("\r\n")}\r\n${clippedEndUrl}\r\n${Array.from({ length: reflowedSize.rows }, (_, index) => `trail-${index}`).join("\r\n")}`,
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  await scrollTerminal(window, 1, 1, reflowedSize, -1_000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickTerminalCell(window, reflowedSize.rows - 1, 3, reflowedSize);
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (Number(externalLinks.length) !== 5)
    throw new Error("Destination clipped below the viewport opened a link");

  const linkCancellation = await exerciseResttyLinkCancellation(
    options,
    reflowedSize,
  );

  return {
    modifiedHoverChangedPixels,
    releasedHoverChangedPixels,
    validLinkMouseReports,
    localPathMouseReports,
    ordinaryGestureMouseReports,
    wheelMouseReports,
    alternateScreenMouseReports,
    linkCancellation,
  };
}
