import {
  readCellSnapshot,
  sendTerminalCellClick,
  type CellSnapshot,
  type TerminalSize,
} from "./restty-link-input";
import { exerciseInitialWebActivation } from "./restty-web-link-activation";
import type { BrowserWindow } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import {
  createResttyGestureRecorder,
  gestureInputSince,
  type ResttyGestureEvidence,
} from "./restty-gesture-evidence";
import { readLocalImageCoreCells } from "./restty-local-image-core-probe";
import {
  hoverCellPoint,
  HoverEvidenceError,
  sameHoverGeometry,
} from "./restty-hover-evidence";

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
  readonly validLinkMouseReports: string;
  readonly localPathMouseReports: string;
  readonly ordinaryGestures: {
    readonly modifiedDrag: ResttyGestureEvidence;
    readonly plainPrimary: ResttyGestureEvidence;
    readonly modifiedMiddle: ResttyGestureEvidence;
    readonly changedUrl: ResttyGestureEvidence;
    readonly releasedModifier: ResttyGestureEvidence;
  };
  readonly wheel: ResttyGestureEvidence;
  readonly alternateScreen: {
    readonly primaryClick: ResttyGestureEvidence;
    readonly wheel: ResttyGestureEvidence;
  };
}

export async function terminalCellPoint(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  const snapshot = await readCellSnapshot(window);
  return cellPoint(snapshot, row, col, size);
}

function cellPoint(
  snapshot: CellSnapshot,
  row: number,
  col: number,
  size: TerminalSize,
) {
  const { geometry } = snapshot;
  if (
    geometry.cols !== size.cols ||
    geometry.rows !== size.rows ||
    (size.snapshot &&
      (snapshot.canvasId !== size.snapshot.canvasId ||
        !sameHoverGeometry(
          size.allowCanvasTranslation
            ? {
                ...geometry,
                canvas: {
                  ...geometry.canvas,
                  x: size.snapshot.geometry.canvas.x,
                  y: size.snapshot.geometry.canvas.y,
                },
              }
            : geometry,
          size.snapshot.geometry,
        )))
  )
    throw new HoverEvidenceError("geometry-changed");
  return hoverCellPoint(geometry, row, col);
}

export async function clickTerminalCell(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
) {
  sendTerminalCellClick(
    window,
    await terminalCellPoint(window, row, col, size),
  );
}

export async function scrollTerminal(
  window: BrowserWindow,
  row: number,
  col: number,
  size: TerminalSize,
  deltaY: number,
): Promise<void> {
  const snapshot = await readCellSnapshot(window);
  const point = cellPoint(snapshot, row, col, size);
  // Revalidate in the dispatch operation itself: another renderer crossing can
  // expose a replacement canvas or different geometry after point calculation.
  await window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
      const observed = canvas?.__resttyHoverFixture?.();
      if (
        observed?.canvasId !== ${snapshot.canvasId} ||
        JSON.stringify(observed.geometry) !== ${JSON.stringify(JSON.stringify(snapshot.geometry))}
      ) throw new Error('Restty hover geometry-changed');
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
  const { window, waitFor, localImageRequests } = options;
  const canvasExpression = `[...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0)`;
  const observe = () =>
    window.webContents.executeJavaScript(
      `(() => {
      const canvas = ${canvasExpression};
      if (!canvas?.__resttyLinkDestinationFixture || !canvas.__resttyHoverFixture || !document.__resttyLinkPreviewFixture)
        throw new Error('Link activation observer is missing');
      const { canvasId, geometry } = canvas.__resttyHoverFixture();
      return { canvasId, geometry, destination: canvas.__resttyLinkDestinationFixture.snapshot(), previewActive: document.__resttyLinkPreviewFixture() };
    })()`,
      true,
    ) as Promise<
      CellSnapshot & {
        readonly destination?: {
          readonly cols: number;
          readonly rows: number;
          readonly matches: boolean;
        };
        readonly previewActive: boolean;
      }
    >;
  const waitForCancellation = (variant: number) =>
    waitFor(
      async () => (await observe()).previewActive === false,
      `local-image variant ${variant} preview cancellation (count ${localImageRequests.length})`,
    );
  const ready = (snapshot: Awaited<ReturnType<typeof observe>>) =>
    snapshot.previewActive === false &&
    snapshot.destination?.matches === true &&
    snapshot.destination.cols === size.cols &&
    snapshot.destination.rows === size.rows;
  const inputStart = options.inputs.join("").length;
  if (localImageRequests.length !== 0)
    throw new Error("Unexpected prior local-image request");
  try {
    for (const [variant, destination] of [
      localPath,
      "~/image.png:1",
      "../image.png",
      `'${localPath} space.png':12:3`,
    ].entries()) {
      await waitForCancellation(variant);
      await window.webContents.executeJavaScript(
        `(() => {
          const observer = (${canvasExpression})?.__resttyLinkDestinationFixture;
          if (!observer) throw new Error('Link destination observer is missing');
          observer.prepare(${JSON.stringify(destination)});
        })()`,
        true,
      );
      options.deliverOutput(`\u001b[2J\u001b[H${destination}`);
      const count: number = localImageRequests.length;
      await waitFor(
        async () => ready(await observe()),
        `local-image variant ${variant} current destination (count ${count})`,
      );
      // Revalidate without await before the frozen-grid check and single input.
      const snapshot = await observe();
      if (!ready(snapshot))
        throw new Error(`Variant ${variant} preparation invalidated`);
      sendTerminalCellClick(window, cellPoint(snapshot, 0, 3, size));
      await waitFor(
        () => localImageRequests.length === count + 1,
        `local-image variant ${variant} activation (count ${count})`,
      );
      const request = localImageRequests.at(-1);
      if (
        request?.source !==
          (variant === 0 ? "native-path" : "path-reference") ||
        request.path !== destination
      )
        throw new Error(`Variant ${variant} changed the literal destination`);
      // Receipt precedes null cancellation; settle it before advancing.
      await waitForCancellation(variant);
      if (localImageRequests.length !== count + 1)
        throw new Error(`Local-image variant ${variant} excess requests`);
    }
    return gestureInputSince(options.inputs, inputStart);
  } finally {
    await window.webContents.executeJavaScript(
      `(${canvasExpression})?.__resttyLinkDestinationFixture?.clear()`,
      true,
    );
  }
}

async function drainGestureInput(window: BrowserWindow): Promise<void> {
  // Present queued native events in the renderer, then cross the real preload
  // invoke route. Main has received preceding input/external-link sends when
  // this FIFO renderer/main round trip resolves. No PTY sentinel is injected.
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
    true,
  );
  await window.webContents.executeJavaScript(
    `window.omxterm.terminal.configuration().then(() => undefined)`,
    true,
  );
}

export async function exerciseResttyLinks(
  options: ResttyLinkGestureOptions,
): Promise<ResttyLinkGestureEvidence> {
  const { window, deliverOutput, externalLinks, waitFor } = options;
  const { reflowedSize, validLinkMouseReports } =
    await exerciseInitialWebActivation(options);
  const localPathMouseReports = await exerciseLocalPathActivation(
    options,
    reflowedSize,
  );

  deliverOutput("\u001b[2J\u001b[Hhttps://one.test/a,\r\nhttps://two.test/b");
  await new Promise((resolve) => setTimeout(resolve, 100));
  await clickTerminalCell(window, 0, 3, reflowedSize);
  await clickTerminalCell(window, 1, 3, reflowedSize);
  await waitFor(() => externalLinks.length === 4, "hard-break link separation");
  if (
    externalLinks[2] !== "https://one.test/a" ||
    externalLinks[3] !== "https://two.test/b"
  )
    throw new Error(
      "Hard-break link activation changed the literal destinations",
    );

  const named = await exerciseResttyOrdinaryGestures(options, reflowedSize);
  // Scrollback still uses the frozen grid for filler/wrap/clipping, but its
  // inputs target the current origin of that same owned canvas. Reporting and
  // the preceding URL/path controls retain their full historical geometry.
  await exerciseScrollbackLinkControls(options, {
    ...reflowedSize,
    allowCanvasTranslation: true,
  });
  return {
    validLinkMouseReports,
    localPathMouseReports,
    ...named,
  };
}

export async function exerciseResttyOrdinaryGestures(
  options: ResttyLinkGestureOptions,
  reflowedSize: TerminalSize,
) {
  const { window, deliverOutput, inputs, externalLinks, waitFor } = options;
  const modifiers: Array<"meta" | "control"> =
    process.platform === "darwin" ? ["meta"] : ["control"];
  deliverOutput("\u001b[?25l\u001b[?1000h\u001b[?1006h");
  const waitForText = async (text: string) => {
    await waitFor(
      async () =>
        (await readLocalImageCoreCells(window))?.text.startsWith(text) === true,
      `gesture destination core readiness: ${text}`,
    );
    await drainGestureInput(window);
  };
  const ordinaryText = "https://one.test/a\r\nhttps://two.test/b";
  const showOrdinaryDestinations = async () => {
    deliverOutput(`\u001b[2J\u001b[H${ordinaryText}`);
    await waitForText("https://one.test/a\nhttps://two.test/b");
  };
  await showOrdinaryDestinations();
  const record = createResttyGestureRecorder({
    inputs,
    activations: () => externalLinks.length + options.localImageRequests.length,
    drain: () => drainGestureInput(window),
    platform: process.platform,
  });
  const first = await terminalCellPoint(window, 0, 3, reflowedSize);
  const second = await terminalCellPoint(window, 1, 3, reflowedSize);
  const send = (
    type: "mouseDown" | "mouseMove" | "mouseUp",
    point = first,
    modified = true,
    button: "left" | "middle" = "left",
  ) =>
    window.webContents.sendInputEvent({
      type,
      x: point.x,
      y: point.y,
      button,
      clickCount: 1,
      modifiers: modified ? modifiers : [],
    });
  const modifiedDrag = await record("modifiedDrag", async () => {
    send("mouseDown");
    send("mouseMove", second);
    send("mouseUp", second);
  });
  await showOrdinaryDestinations();
  const plainPrimary = await record("plainPrimary", async () => {
    send("mouseDown", first, false);
    send("mouseUp", first, false);
  });
  await showOrdinaryDestinations();
  const modifiedMiddle = await record("modifiedMiddle", async () => {
    send("mouseDown", first, true, "middle");
    send("mouseUp", first, true, "middle");
  });
  await showOrdinaryDestinations();
  const changedUrl = await record("changedUrl", async () => {
    send("mouseDown");
    // Establish the consumed original press before replacing its same-span URL.
    await drainGestureInput(window);
    deliverOutput("\u001b[Hhttps://new.test/b");
    await waitForText("https://new.test/b");
    send("mouseUp");
  });
  await showOrdinaryDestinations();
  const releasedModifier = await record("releasedModifier", async () => {
    send("mouseDown");
    send("mouseUp", first, false);
  });
  const wheel = await record("wheel", () =>
    scrollTerminal(window, 0, 3, reflowedSize, 2),
  );

  deliverOutput("\u001b[?1049h\u001b[2J\u001b[Halternate-mouse");
  await waitForText("alternate-mouse");
  const alternatePrimary = await record("alternatePrimary", async () => {
    send("mouseDown", first, false);
    send("mouseUp", first, false);
  });
  const alternateWheel = await record("alternateWheel", () =>
    scrollTerminal(window, 0, 3, reflowedSize, -1),
  );
  deliverOutput("\u001b[?1049l");
  await waitForText("https://one.test/a");
  // Returning from alternate screen cannot leave an unowned report either.
  if (gestureInputSince(inputs, alternateWheel.inputEnd) !== "")
    throw new Error(
      "Unexpected mouse input after alternate-screen gesture drain",
    );

  return {
    ordinaryGestures: {
      modifiedDrag,
      plainPrimary,
      modifiedMiddle,
      changedUrl,
      releasedModifier,
    },
    wheel,
    alternateScreen: { primaryClick: alternatePrimary, wheel: alternateWheel },
  };
}

async function exerciseScrollbackLinkControls(
  options: ResttyLinkGestureOptions,
  reflowedSize: TerminalSize,
) {
  const { window, deliverOutput, externalLinks, waitFor } = options;
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
  if (externalLinks[4] !== scrollbackUrl)
    throw new Error(
      "Scrollback link activation changed the literal destination",
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
}
