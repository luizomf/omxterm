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
  validateHoverGeometry,
  type HoverGeometry,
} from "./restty-hover-evidence";

interface CellSnapshot {
  readonly canvasId: number;
  readonly geometry: HoverGeometry;
}
interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
  readonly snapshot?: CellSnapshot;
}

async function readCellSnapshot(window: BrowserWindow): Promise<CellSnapshot> {
  // Geometry must not inspect the core: an allocating selection query can
  // detach the renderer's borrowed WASM views before its legitimate lookup.
  return window.webContents.executeJavaScript(
    `(() => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
      if (!canvas?.__resttyHoverFixture) throw new Error('Cell geometry observer is missing');
      const {canvasId, geometry} = canvas.__resttyHoverFixture();
      return {canvasId, geometry};
    })()`,
    true,
  ) as Promise<CellSnapshot>;
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
  const { geometry } = snapshot;
  if (
    geometry.cols !== size.cols ||
    geometry.rows !== size.rows ||
    (size.snapshot &&
      (snapshot.canvasId !== size.snapshot.canvasId ||
        !sameHoverGeometry(geometry, size.snapshot.geometry)))
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

function sendTerminalCellClick(
  window: BrowserWindow,
  point: { readonly x: number; readonly y: number },
) {
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
  const { window, deliverOutput, inputs, resizes, externalLinks, waitFor } =
    options;
  const size = resizes.at(-1);
  if (!size) throw new Error("Restty link fixture has no grid size");
  const initial = await readCellSnapshot(window);
  const visibleUrl = `https://example.test/漢${"a".repeat(size.cols)}`;
  // Both wide characters occupy two cells; the combining mark adds no column.
  const destinationColumns = Array.from(visibleUrl).length + 1;
  deliverOutput(
    `\u001b[2J\u001b[H\u001b[?25l\u001b[?1000h\u001b[?1006h漢e\u0301 ${visibleUrl}`,
  );
  deliverOutput("\u001b[?1049halternate\u001b[?1049l");
  // The former native resize was followed by clearing and reprinting this URL,
  // so it did not verify retained-output reflow. The local-image layout scenario
  // covers actual shrink/widen of retained output without that reprint.
  deliverOutput(
    `\u001b[2J\u001b[H漢e\u0301 \u001b]8;;https://hidden.test/different\u0007${visibleUrl}\u001b]8;;\u0007`,
  );
  // Retain the original output-presentation opportunity, not a stability test.
  // No geometry is frozen before it; the actual click still validates afresh.
  await new Promise((resolve) => setTimeout(resolve, 100));
  const current = (snapshot: CellSnapshot) => {
    if (
      !Number.isSafeInteger(initial.canvasId) ||
      initial.canvasId <= 0 ||
      snapshot.canvasId !== initial.canvasId
    )
      throw new HoverEvidenceError("geometry-changed");
    const grid = resizes.at(-1);
    return (
      grid?.cols === snapshot.geometry.cols &&
      grid.rows === snapshot.geometry.rows
    );
  };
  await waitFor(
    async () => current(await readCellSnapshot(window)),
    "Restty link current grid",
  );

  const inputBeforeLinks = inputs.join("");
  let prepared: CellSnapshot | undefined;
  for (const [row, col] of [
    [0, 4],
    [1, 2],
  ] as const) {
    // The readiness observation is not the gesture's geometry. Read again at
    // the actual input boundary, freeze the first click, and reject subsequent
    // changes. No output, sleep or IPC await separates validation and sending.
    const snapshot = await readCellSnapshot(window);
    if (!current(snapshot))
      throw new HoverEvidenceError("stimulus-invalidated");
    if (prepared && !sameHoverGeometry(prepared.geometry, snapshot.geometry))
      throw new HoverEvidenceError("geometry-changed");
    validateHoverGeometry(snapshot.geometry);
    const { cols, rows } = snapshot.geometry;
    if (
      4 + destinationColumns <= cols + 2 ||
      4 + destinationColumns > cols * rows
    )
      throw new HoverEvidenceError("preparation");
    prepared ??= snapshot;
    sendTerminalCellClick(window, hoverCellPoint(snapshot.geometry, row, col));
  }
  if (!prepared) throw new HoverEvidenceError("preparation");
  const reflowedSize: TerminalSize = {
    cols: prepared.geometry.cols,
    rows: prepared.geometry.rows,
    snapshot: { canvasId: prepared.canvasId, geometry: prepared.geometry },
  };
  await waitFor(
    () => externalLinks.length === 2,
    "repeated visible link activation",
  );
  if (externalLinks[0] !== visibleUrl || externalLinks[1] !== visibleUrl)
    throw new Error("Restty link activation changed the literal destination");
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

  const named = await exerciseResttyOrdinaryGestures(options, reflowedSize);
  await exerciseScrollbackLinkControls(options, reflowedSize);
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
