import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import {
  captureModifiedHoverEvidence,
  readHoverSnapshot,
} from "./restty-hover";
import { hoverCellPoint } from "./restty-hover-evidence";
import type { ResttyLinkGestureOptions } from "./restty-link-gestures";

export const HOVER_CONTROL_PREFIX = "__OMXTERM_HOVER_CONTROL__";
export type HoverControl =
  | "ordinary"
  | "late-frame"
  | "early-capture"
  | "output-invalidation"
  | "native-invalidation";
export function selectHoverControl(
  argv: readonly string[],
): HoverControl | undefined {
  const value = argv
    .find((arg) => arg.startsWith("--hover-control="))
    ?.slice("--hover-control=".length);
  if (
    value !== undefined &&
    ![
      "ordinary",
      "late-frame",
      "early-capture",
      "output-invalidation",
      "native-invalidation",
    ].includes(value)
  )
    throw new Error("Unknown hover fixture control");
  return value as HoverControl | undefined;
}

async function exerciseHoverRecognition(
  options: Pick<
    ResttyLinkGestureOptions,
    "window" | "deliverOutput" | "inputs"
  >,
  size: { cols: number; rows: number },
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
    options.deliverOutput(`\u001b[3J\u001b[2J\u001b[H漢e\u0301 ${text}`);
    await captureModifiedHoverEvidence({
      window: options.window,
      deliverOutput: options.deliverOutput,
      input: () => options.inputs.join(""),
      size,
      text: `漢e\u0301 ${text.startsWith("\u001b]8;") ? "label" : text}`,
      destinationColumns: columns,
    });
  }
}

export async function completeHoverControl(
  options: Pick<
    ResttyLinkGestureOptions,
    | "window"
    | "deliverOutput"
    | "inputs"
    | "externalLinks"
    | "localImageRequests"
    | "waitFor"
  > & {
    readonly resizes: readonly {
      readonly cols: number;
      readonly rows: number;
    }[];
    readonly control: HoverControl;
    readonly initialOutput: () => string;
    readonly closeSession: () => void;
    readonly ptyExits: () => number;
    readonly complete: (code: number) => Promise<void>;
  },
): Promise<void> {
  const { window, control, waitFor } = options;
  await waitFor(
    () => options.initialOutput().includes("__OMXTERM_CANCELLATION_READY__"),
    "hover non-echoing child readiness",
  );
  const initialSize = options.resizes.at(-1)!;
  const url = `https://example.test/漢${"a".repeat(initialSize.cols)}`;
  const text = `漢e\u0301 ${url}`;
  options.deliverOutput(
    `\u001b[3J\u001b[2J\u001b[H\u001b[?25l\u001b[?1000h\u001b[?1006h${text}`,
  );
  options.deliverOutput("\u001b[?1049halternate\u001b[?1049l");
  await waitFor(
    async () => (await readHoverSnapshot(window)).core.text === text,
    "exact retained hover content before reflow",
  );
  // Exercise native fractional layout, not fabricated geometry or compositor
  // size policy. The profile/window owns this temporary content constraint.
  const count = options.resizes.length;
  await window.webContents.executeJavaScript(
    `(() => {
    const surface = [...document.querySelectorAll('.terminal-surface')].find(s => s.getBoundingClientRect().width > 0);
    const r = surface.getBoundingClientRect();
    surface.style.width = (Math.floor(r.width) - 25.25) + 'px';
    surface.style.height = (Math.floor(r.height) - 11.5) + 'px';
    surface.style.flex = '0 0 auto';
    const native = requestAnimationFrame.bind(window);
    const pending = [];
    globalThis.__hoverFrameHeld = 0;
    globalThis.__hoverFrameHold = false;
    window.requestAnimationFrame = cb => native(time => {
      if (globalThis.__hoverFrameHold) { pending.push(() => cb(time)); globalThis.__hoverFrameHeld++; }
      else cb(time);
    });
    globalThis.__holdHoverFrame = () => {
      globalThis.__hoverFrameHold = true;
      setTimeout(() => {
        globalThis.__hoverFrameHold = false;
        for (const resume of pending.splice(0)) resume();
      },350);
    };
  })()`,
    true,
  );
  await waitFor(
    () => options.resizes.length > count,
    "hover fractional content refit",
  );
  const size = options.resizes.at(-1)!;
  const evidence = await captureModifiedHoverEvidence({
    window,
    deliverOutput: options.deliverOutput,
    input: () => options.inputs.join(""),
    size,
    text,
    destinationColumns: url.length + 1,
    ...(control === "early-capture"
      ? { control: "early-capture" as const }
      : {}),
    beforeStimulus: async () => {
      if (control === "late-frame" || control === "early-capture") {
        await window.webContents.executeJavaScript(
          "globalThis.__holdHoverFrame()",
          true,
        );
        await waitFor(
          () =>
            window.webContents.executeJavaScript(
              "globalThis.__hoverFrameHeld > 0",
              true,
            ),
          "actual held native hover frame",
        );
        writeSync(1, HOVER_CONTROL_PREFIX + control + "\n");
      }
    },
    beforeCapture: async () => {
      if (
        control !== "output-invalidation" &&
        control !== "native-invalidation"
      )
        return;
      const prior = await readHoverSnapshot(window);
      if (control === "output-invalidation") {
        const start = options.inputs.join("").length;
        options.deliverOutput("\u001b[16t");
        await waitFor(
          () =>
            /\u001b\[6;\d+;\d+t/u.test(options.inputs.join("").slice(start)),
          "queued query delivered through Adapter",
        );
      } else {
        const point = hoverCellPoint(prior.geometry, 0, 4);
        window.webContents.sendInputEvent({
          type: "mouseMove",
          x: point.x + 1,
          y: point.y,
          modifiers: [],
        });
      }
      await waitFor(async () => {
        const current = await readHoverSnapshot(window);
        return (
          current.draw.revision > prior.draw.revision &&
          current.draw.cells === 0 &&
          current.draw.drawRevision === current.draw.revision &&
          current.draw.drawCells === 0 &&
          (control === "output-invalidation" ||
            current.events.some(
              (event) =>
                event.type === "pointermove" &&
                event.trusted &&
                !event.modified &&
                event.at >= prior.draw.setAt,
            ))
        );
      }, "legitimate invalidation actually cleared and drew the cue");
      assert.equal(
        options.externalLinks.length,
        0,
        "hover never opens a web destination",
      );
      assert.equal(
        options.localImageRequests.length,
        0,
        "hover never requests an image read",
      );
      writeSync(1, HOVER_CONTROL_PREFIX + control + "\n");
    },
  });
  assert.ok(evidence.modifiedHoverChangedPixels > 0);
  assert.equal(evidence.releasedHoverChangedPixels, 0);
  if (control === "ordinary") {
    const count = options.resizes.length;
    await window.webContents.executeJavaScript(
      `(() => {
      const surface = [...document.querySelectorAll('.terminal-surface')].find(s => s.getBoundingClientRect().width > 0);
      for (const property of ['width','height','flex']) surface.style.removeProperty(property);
    })()`,
      true,
    );
    await waitFor(
      () => options.resizes.length > count,
      "hover original content geometry restored",
    );
    // Same retained output, no reprint after either direction of refit.
    await captureModifiedHoverEvidence({
      window,
      deliverOutput: options.deliverOutput,
      input: () => options.inputs.join(""),
      size: options.resizes.at(-1)!,
      text,
      destinationColumns: url.length + 1,
    });
    if ((await readHoverSnapshot(window)).geometry.dpr === 1)
      await exerciseHoverRecognition(options, options.resizes.at(-1)!);
  }
  await window.webContents.executeJavaScript(
    "window.omxterm.terminal.configuration().then(() => undefined)",
    true,
  );
  assert.equal(
    options.externalLinks.length,
    0,
    "hover never opens a web destination",
  );
  assert.equal(
    options.localImageRequests.length,
    0,
    "hover never requests an image read",
  );
  options.closeSession();
  await waitFor(
    () => options.ptyExits() === 1,
    "hover control native child exit",
  );
  writeSync(1, "__OMXTERM_HOVER_RESULT__" + JSON.stringify(evidence) + "\n");
  await options.complete(0);
}
