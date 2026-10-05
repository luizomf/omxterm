import assert from "node:assert/strict";
import { writeSync } from "node:fs";
import {
  boundedHoverStep,
  captureModifiedHoverEvidence,
  readHoverSnapshot,
  type HoverSnapshot,
} from "./restty-hover";
import { hoverCellPoint, HoverEvidenceError } from "./restty-hover-evidence";
import type { ResttyLinkGestureOptions } from "./restty-link-gestures";

export const HOVER_CONTROL_PREFIX = "__OMXTERM_HOVER_CONTROL__";
export const HOVER_FRAME_PREFIX = "__OMXTERM_HOVER_FRAME__";
// Hold actual native continuations until the owning control explicitly releases
// them. There is no expiry timer or cumulative historical readiness counter.
export const HOVER_FRAME_HOLD_SOURCE = `(() => {
  const native = window.requestAnimationFrame.bind(window);
  const pending = [];
  let owner;
  window.requestAnimationFrame = callback => {
    let id;
    id = native(time => {
      if (owner) pending.push({id, callback, time});
      else callback(time);
    });
    return id;
  };
  const state = () => {
    const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0);
    const current = canvas.__resttyHoverFixture();
    return { active: Boolean(owner), canvasId: owner?.canvasId, revision: owner?.revision,
      callbackId: pending[0]?.id, pending: pending.length,
      currentCanvasId: current.canvasId, currentRevision: current.draw.revision, drawRevision: current.draw.drawRevision,
      cellRevision: current.draw.cellRevision, drawCellRevision: current.draw.drawCellRevision };
  };
  globalThis.__hoverFrame = {
    arm(canvasId) { if (owner) throw new Error('Hover frame already owned'); owner = {canvasId}; },
    bind(revision) { if (!owner) throw new Error('Hover frame not owned'); owner.revision = revision; return state(); },
    state,
    release() {
      const before = state();
      owner = undefined;
      const errors = [];
      for (const {callback,time} of pending.splice(0)) {
        try { callback(time); } catch (error) { errors.push(error); }
      }
      if (errors.length) throw new AggregateError(errors, 'Held hover callback failed');
      return {...state(), releasedCallbackId: before.callbackId};
    }
  };
})()`;
interface HoverFrameState {
  readonly active: boolean;
  readonly canvasId?: number;
  readonly revision?: number;
  readonly callbackId?: number;
  readonly releasedCallbackId?: number;
  readonly pending: number;
  readonly currentCanvasId: number;
  readonly currentRevision: number;
  readonly drawRevision: number;
  readonly cellRevision: number;
  readonly drawCellRevision: number;
}
async function frameOperation(
  window: ResttyLinkGestureOptions["window"],
  operation: string,
): Promise<HoverFrameState> {
  return boundedHoverStep(
    () =>
      window.webContents.executeJavaScript(
        operation,
        true,
      ) as Promise<HoverFrameState>,
    "cue-not-drawn",
  );
}
function requireHeldFrame(
  state: HoverFrameState,
  stimulus: HoverSnapshot,
): boolean {
  if (state.currentCanvasId !== stimulus.canvasId)
    throw new HoverEvidenceError("geometry-changed");
  if (state.cellRevision !== stimulus.draw.cellRevision)
    throw new HoverEvidenceError("stimulus-invalidated");
  if (
    !state.active ||
    state.canvasId !== stimulus.canvasId ||
    state.revision !== stimulus.draw.revision
  )
    throw new HoverEvidenceError("cue-not-drawn");
  return (
    state.pending > 0 &&
    state.callbackId !== undefined &&
    Number.isSafeInteger(state.callbackId) &&
    state.drawCellRevision < stimulus.draw.cellRevision
  );
}
function recordFrame(
  stage: "held" | "checkpoint" | "captured" | "released" | "cleanup",
  state: HoverFrameState,
): void {
  writeSync(1, HOVER_FRAME_PREFIX + JSON.stringify({ stage, ...state }) + "\n");
}
async function releaseFrame(
  window: ResttyLinkGestureOptions["window"],
  stage: "released" | "cleanup",
): Promise<void> {
  recordFrame(
    stage,
    await frameOperation(window, "globalThis.__hoverFrame.release()"),
  );
}
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
    ${HOVER_FRAME_HOLD_SOURCE};
  })()`,
    true,
  );
  await waitFor(
    () => options.resizes.length > count,
    "hover fractional content refit",
  );
  const size = options.resizes.at(-1)!;
  const frameControl = control === "late-frame" || control === "early-capture";
  let heldCallbackId: number | undefined;
  let failure: unknown;
  let evidence: Awaited<ReturnType<typeof captureModifiedHoverEvidence>>;
  try {
    evidence = await captureModifiedHoverEvidence({
      window,
      deliverOutput: options.deliverOutput,
      input: () => options.inputs.join(""),
      size,
      text,
      destinationColumns: url.length + 1,
      ...(control === "early-capture"
        ? { control: "early-capture" as const }
        : {}),
      beforeStimulus: async (prepared) => {
        if (frameControl)
          await boundedHoverStep(
            () =>
              window.webContents.executeJavaScript(
                `globalThis.__hoverFrame.arm(${prepared.canvasId})`,
                true,
              ),
            "cue-not-drawn",
          );
      },
      afterStimulus: async (stimulus) => {
        if (!frameControl) return;
        await frameOperation(
          window,
          `globalThis.__hoverFrame.bind(${stimulus.draw.revision})`,
        );
        await waitFor(async () => {
          const state = await frameOperation(
            window,
            "globalThis.__hoverFrame.state()",
          );
          if (!requireHeldFrame(state, stimulus)) return false;
          heldCallbackId = state.callbackId;
          recordFrame("held", state);
          return true;
        }, "current stimulus actual held native continuation");
        writeSync(1, HOVER_CONTROL_PREFIX + control + "\n");
        if (control === "late-frame") {
          // Delay AFTER the intended stimulus and retained real callback exist.
          await new Promise((resolve) => setTimeout(resolve, 150));
          const state = await frameOperation(
            window,
            "globalThis.__hoverFrame.state()",
          );
          assert.ok(requireHeldFrame(state, stimulus));
          assert.equal(state.callbackId, heldCallbackId);
          recordFrame("checkpoint", state);
          await releaseFrame(window, "released");
        }
      },
      afterCapture: async (stimulus) => {
        if (control !== "early-capture") return;
        const state = await frameOperation(
          window,
          "globalThis.__hoverFrame.state()",
        );
        assert.ok(requireHeldFrame(state, stimulus));
        assert.equal(state.callbackId, heldCallbackId);
        recordFrame("captured", state);
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
            current.draw.cellRevision > prior.draw.cellRevision &&
            current.draw.cells === 0 &&
            current.draw.drawCellRevision === current.draw.cellRevision &&
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
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    if (frameControl) {
      try {
        await releaseFrame(window, "cleanup");
      } catch (cleanupError) {
        if (failure !== undefined)
          throw new AggregateError(
            [failure, cleanupError],
            "Hover frame cleanup failed",
            { cause: failure },
          );
        throw cleanupError;
      }
    }
  }
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
