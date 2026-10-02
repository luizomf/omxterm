import type { BrowserWindow } from "electron";
import type { SelectionObservation } from "./restty-appearance-renderer";

export async function exerciseAppearanceSelection(
  window: BrowserWindow,
  geometry: {
    readonly x: number;
    readonly y: number;
    readonly cellWidth: number;
  },
  mixedPointer: boolean,
): Promise<SelectionObservation> {
  const { x, y, cellWidth } = geometry;
  const startX = Math.round(x + cellWidth * 8);
  const endX = Math.round(x + cellWidth * 13);
  await window.webContents.executeJavaScript(
    `(() => {
    globalThis.__omxtermBeginSelection();
    const nextPointer = type => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(type + ' was not delivered')), 3000);
      document.addEventListener(type, event => { clearTimeout(timer); resolve(event.pointerId); }, { capture: true, once: true });
    });
    globalThis.__omxtermNativePointerDown = nextPointer('pointerdown');
    globalThis.__omxtermNativePointerUp = nextPointer('pointerup');
  })()`,
    true,
  );
  const compatibilityMove = `document.querySelector('canvas').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: ${endX}, clientY: ${y} }))`;
  if (mixedPointer) {
    await window.webContents.executeJavaScript(compatibilityMove, true);
    if (
      !(await window.webContents.executeJavaScript(
        "globalThis.__omxtermHasNoSelection()",
        true,
      ))
    )
      throw new Error("Compatibility movement selected without a press");
  }
  window.webContents.sendInputEvent({
    type: "mouseDown",
    x: startX,
    y,
    button: "left",
    clickCount: 1,
  });
  const mousePointerId: unknown = await window.webContents.executeJavaScript(
    "globalThis.__omxtermNativePointerDown",
    true,
  );
  if (typeof mousePointerId !== "number" || !Number.isInteger(mousePointerId))
    throw new Error("Native pointerdown returned an invalid identity");
  if (mixedPointer) {
    // Replay the captured VM stream, retaining a real, capturable mouse press.
    await window.webContents.executeJavaScript(
      `(() => {
      const canvas = document.querySelector('canvas');
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: ${mousePointerId + 1}, pointerType: 'pen', button: -1, buttons: 1, clientX: ${endX}, clientY: ${y} }));
      for (const buttons of [0, 2]) canvas.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, buttons, clientX: ${endX}, clientY: ${y} }));
      const touch = new MouseEvent('mousemove', { bubbles: true, buttons: 1, clientX: ${endX}, clientY: ${y} });
      Object.defineProperty(touch, 'sourceCapabilities', { value: { firesTouchEvents: true } });
      canvas.dispatchEvent(touch);
    })()`,
      true,
    );
    if (
      !(await window.webContents.executeJavaScript(
        "globalThis.__omxtermHasNoSelection()",
        true,
      ))
    )
      throw new Error(
        "Mismatched pointer, released/right button or touch compatibility movement selected text",
      );
    await window.webContents.executeJavaScript(compatibilityMove, true);
  } else {
    window.webContents.sendInputEvent({
      type: "mouseMove",
      x: endX,
      y,
      modifiers: ["leftbuttondown"],
    });
  }
  window.webContents.sendInputEvent({
    type: "mouseUp",
    x: endX,
    y,
    button: "left",
    clickCount: 1,
  });
  await window.webContents.executeJavaScript(
    "globalThis.__omxtermNativePointerUp",
    true,
  );
  // A delivered gesture is not a painted frame. Check public copy results on
  // both sides of real frame boundaries before the appearance fixture captures.
  const observation: unknown = await window.webContents.executeJavaScript(
    "globalThis.__omxtermSelectionAfterFrames()",
    true,
  );
  if (
    typeof observation !== "object" ||
    observation === null ||
    !("beforeFrame" in observation) ||
    typeof observation.beforeFrame !== "boolean" ||
    !("afterFrame" in observation) ||
    typeof observation.afterFrame !== "boolean" ||
    !("deferredFrame" in observation) ||
    typeof observation.deferredFrame !== "boolean" ||
    !("lateFrameArrivalMs" in observation) ||
    typeof observation.lateFrameArrivalMs !== "number" ||
    !Number.isFinite(observation.lateFrameArrivalMs) ||
    observation.lateFrameArrivalMs < 0 ||
    !("focused" in observation) ||
    typeof observation.focused !== "boolean" ||
    !("visibilityState" in observation) ||
    (observation.visibilityState !== "visible" &&
      observation.visibilityState !== "hidden")
  )
    throw new Error("Renderer returned an invalid selection observation");
  return {
    beforeFrame: observation.beforeFrame,
    afterFrame: observation.afterFrame,
    deferredFrame: observation.deferredFrame,
    lateFrameArrivalMs: observation.lateFrameArrivalMs,
    focused: observation.focused,
    visibilityState: observation.visibilityState,
  };
}
