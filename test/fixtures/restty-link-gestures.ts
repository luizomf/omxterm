import {
  cellPoint,
  drainGestureInput,
  scrollTerminal,
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
import type { LinkFixtureFrame } from "./restty-link-readiness-probe";
import {
  createLinkFlowReadiness,
  hardRows,
} from "./restty-link-flow-readiness";
export {
  terminalCellPoint,
  clickTerminalCell,
  scrollTerminal,
} from "./restty-link-input";

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

export async function exerciseResttyLinks(
  options: ResttyLinkGestureOptions,
): Promise<ResttyLinkGestureEvidence> {
  const { externalLinks } = options;
  const { reflowedSize, validLinkMouseReports } =
    await exerciseInitialWebActivation(options);
  const localPathMouseReports = await exerciseLocalPathActivation(
    options,
    reflowedSize,
  );

  const flow = createLinkFlowReadiness(options, reflowedSize);
  try {
    await flow.prepare(
      "hard-break",
      hardRows(["https://one.test/a,", "https://two.test/b"]),
      "\u001b[2J\u001b[Hhttps://one.test/a,\r\nhttps://two.test/b",
    );
    await flow.wait();
    flow.click((await flow.points([[0, 3]]))[0]!);
    flow.click((await flow.points([[1, 3]]))[0]!);
    await flow.count(4);
    if (
      externalLinks[2] !== "https://one.test/a" ||
      externalLinks[3] !== "https://two.test/b"
    )
      throw new Error(
        "Hard-break link activation changed the literal destinations",
      );
  } finally {
    await flow.clear();
  }

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
  const { window, deliverOutput, inputs, externalLinks } = options;
  const flow = createLinkFlowReadiness(options, reflowedSize);
  const modifiers: Array<"meta" | "control"> =
    process.platform === "darwin" ? ["meta"] : ["control"];
  deliverOutput("\u001b[?25l\u001b[?1000h\u001b[?1006h");
  const ordinaryLines = ["https://one.test/a", "https://two.test/b"];
  const showOrdinaryDestinations = async (phase: string) => {
    await flow.prepare(
      phase,
      hardRows(ordinaryLines),
      `\u001b[2J\u001b[H${ordinaryLines.join("\r\n")}`,
    );
    await flow.wait();
  };
  try {
    await showOrdinaryDestinations("modified-drag");
    const record = createResttyGestureRecorder({
      inputs,
      activations: () =>
        externalLinks.length + options.localImageRequests.length,
      drain: () => drainGestureInput(window),
      platform: process.platform,
    });
    const [first, second] = await flow.points([
      [0, 3],
      [1, 3],
    ]);
    const send = (
      type: "mouseDown" | "mouseMove" | "mouseUp",
      point = first!,
      modified = true,
      button: "left" | "middle" = "left",
    ) => {
      window.webContents.sendInputEvent({
        type,
        x: point.x,
        y: point.y,
        button,
        clickCount: 1,
        modifiers: modified ? modifiers : [],
      });
      flow.sent();
    };
    const modifiedDrag = await record("modifiedDrag", async () => {
      await flow.points([
        [0, 3],
        [1, 3],
      ]);
      send("mouseDown");
      send("mouseMove", second);
      send("mouseUp", second);
    });
    await showOrdinaryDestinations("plain-primary");
    const plainPrimary = await record("plainPrimary", async () => {
      await flow.points([[0, 3]]);
      send("mouseDown", first, false);
      send("mouseUp", first, false);
    });
    await showOrdinaryDestinations("modified-middle");
    const modifiedMiddle = await record("modifiedMiddle", async () => {
      await flow.points([[0, 3]]);
      send("mouseDown", first, true, "middle");
      send("mouseUp", first, true, "middle");
    });
    await showOrdinaryDestinations("changed-url-original");
    const changedUrl = await record("changedUrl", async () => {
      await flow.points([[0, 3]]);
      send("mouseDown");
      // Establish the consumed original press before replacing its same-span URL.
      await drainGestureInput(window);
      await flow.prepare(
        "changed-url-replacement",
        hardRows(["https://new.test/b", "https://two.test/b"]),
        "\u001b[Hhttps://new.test/b",
      );
      await flow.wait();
      await flow.points([[0, 3]]);
      send("mouseUp");
    });
    await showOrdinaryDestinations("released-modifier");
    const releasedModifier = await record("releasedModifier", async () => {
      await flow.points([[0, 3]]);
      send("mouseDown");
      send("mouseUp", first, false);
    });
    const wheel = await record("wheel", async () => {
      await flow.points([[0, 3]]);
      await scrollTerminal(window, 0, 3, reflowedSize, 2);
    });

    await flow.prepare(
      "alternate-screen",
      hardRows(["alternate-mouse"], {
        offset: "bottom",
        mouseActive: true,
        alternate: true,
      }),
      "\u001b[?1049h\u001b[2J\u001b[Halternate-mouse",
    );
    await flow.wait();
    const alternatePrimary = await record("alternatePrimary", async () => {
      await flow.points([[0, 3]]);
      send("mouseDown", first, false);
      send("mouseUp", first, false);
    });
    const alternateWheel = await record("alternateWheel", async () => {
      await flow.points([[0, 3]]);
      await scrollTerminal(window, 0, 3, reflowedSize, -1);
    });
    await flow.prepare(
      "restored-main",
      hardRows(ordinaryLines),
      "\u001b[?1049l",
    );
    await flow.wait();
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
      alternateScreen: {
        primaryClick: alternatePrimary,
        wheel: alternateWheel,
      },
    };
  } finally {
    await flow.clear();
  }
}

async function exerciseScrollbackLinkControls(
  options: ResttyLinkGestureOptions,
  reflowedSize: TerminalSize,
) {
  const { window, externalLinks } = options;
  const { cols, rows } = reflowedSize;
  const flow = createLinkFlowReadiness(options, reflowedSize);
  // All producers here are known ASCII at column zero, on cleared history.
  // This is an explicit fixture layout, never a generic soft-wrap oracle.
  const split = (text: string) =>
    Array.from({ length: Math.ceil(text.length / cols) }, (_, index) =>
      text.slice(index * cols, (index + 1) * cols),
    );
  const filler = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  const frame = (
    lines: readonly string[],
    offset: number,
    total: number,
    targets: LinkFixtureFrame["targets"] = [],
  ): LinkFixtureFrame => ({
    lines,
    viewport: { offset, total, alternate: false, mouseActive: false },
    targets,
  });
  const target = (
    row: number,
    lastRow: number,
    url: string | null,
    clipping = { clippedStart: false, clippedEnd: false },
  ) => ({
    row,
    col: 3,
    firstRow: row,
    lastRow,
    url,
    ...clipping,
  });
  const reset = "\u001b[3J\u001b[2J\u001b[H";
  try {
    const scrollbackUrl = "https://scroll.test/complete";
    const scrollParts = split(scrollbackUrl);
    const scrollFiller = filler("scroll", rows);
    await flow.prepare(
      "scrollback-populated",
      frame(scrollFiller, scrollParts.length, rows + scrollParts.length),
      `\u001b[?1000l\u001b[?1006l${reset}${scrollbackUrl}\r\n${scrollFiller.join("\r\n")}`,
    );
    await flow.wait();
    // Prepare the post-scroll expectation before the one viewport mutation.
    await flow.points([[1, 1]]);
    await flow.prepare(
      "scrollback-visible",
      frame(
        [...scrollParts, ...scrollFiller].slice(0, rows),
        0,
        rows + scrollParts.length,
        [target(0, scrollParts.length - 1, scrollbackUrl)],
      ),
    );
    await scrollTerminal(window, 1, 1, reflowedSize, -1);
    await flow.wait();
    flow.click((await flow.points([[0, 3]]))[0]!);
    await flow.count(5);
    if (externalLinks[4] !== scrollbackUrl)
      throw new Error(
        "Scrollback link activation changed the literal destination",
      );

    const clippedUrl = `https://clipped.test/${"z".repeat(cols)}`;
    const clippedParts = split(clippedUrl);
    const clippedFiller = filler("clip", rows - 1);
    await flow.prepare(
      "clipped-above",
      frame(
        [clippedParts.at(-1)!, ...clippedFiller],
        clippedParts.length - 1,
        rows + clippedParts.length - 1,
        [target(0, 0, null, { clippedStart: true, clippedEnd: false })],
      ),
      `${reset}${clippedUrl}\r\n${clippedFiller.join("\r\n")}`,
    );
    await flow.wait();
    flow.click((await flow.points([[0, 3]]))[0]!);
    await drainGestureInput(window);
    flow.settled(5);

    const clippedEndUrl = `https://clipped-end.test/${"q".repeat(cols)}`;
    const clippedEndParts = split(clippedEndUrl);
    const lead = filler("lead", rows - 1);
    const trail = filler("trail", rows);
    const history = rows + clippedEndParts.length - 1;
    await flow.prepare(
      "clipped-below-populated",
      frame(trail, history, rows + history),
      `${reset}${lead.join("\r\n")}\r\n${clippedEndUrl}\r\n${trail.join("\r\n")}`,
    );
    await flow.wait();
    await flow.points([[1, 1]]);
    await flow.prepare(
      "clipped-below",
      frame([...lead, clippedEndParts[0]!], 0, rows + history, [
        target(rows - 1, rows - 1, null, {
          clippedStart: false,
          clippedEnd: true,
        }),
      ]),
    );
    await scrollTerminal(window, 1, 1, reflowedSize, -1_000);
    await flow.wait();
    flow.click((await flow.points([[rows - 1, 3]]))[0]!);
    await drainGestureInput(window);
    flow.settled(5);
  } finally {
    await flow.clear();
  }
}
