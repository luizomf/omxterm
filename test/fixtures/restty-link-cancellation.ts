import type { ResttyLinkGestureOptions } from "./restty-link-gestures";
import { terminalCellPoint } from "./restty-link-gestures";

interface GestureObservation {
  readonly activationsBefore: number;
  readonly activationsAfter: number;
  readonly mouseReports: string;
}

export interface ResttyLinkCancellationEvidence {
  readonly positive: GestureObservation;
  readonly reportingControl: string;
  readonly pointercancel: GestureObservation;
  readonly blur: GestureObservation;
}

export async function exerciseResttyLinkCancellation(
  options: Pick<
    ResttyLinkGestureOptions,
    "window" | "deliverOutput" | "inputs" | "externalLinks" | "waitFor"
  >,
  size: { readonly cols: number; readonly rows: number },
): Promise<ResttyLinkCancellationEvidence> {
  const { window, deliverOutput, inputs, externalLinks, waitFor } = options;
  // Establish a complete destination and live application mouse modes without
  // depending on any broad host gesture, hover or clipping exercise.
  deliverOutput(
    "\u001b[3J\u001b[2J\u001b[H\u001b[?1000h\u001b[?1006hhttps://cancel.test/visible",
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  const point = await terminalCellPoint(window, 0, 3, size);
  // Position the modified pointer and present its cue before the click controls.
  // Present the initial visible-cell lookup/cue instead of relying on a broad
  // host exercise to have already refreshed the interaction snapshot.
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => {
      const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 76, pointerType: 'mouse', clientX: ${point.x}, clientY: ${point.y}, metaKey: ${process.platform === "darwin"}, ctrlKey: ${process.platform !== "darwin"} }));
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    })`,
    true,
  );
  const observe = async (
    pointerId: number,
    cancellation: "none" | "pointercancel" | "blur",
    modified = true,
  ): Promise<GestureObservation> => {
    const activationsBefore = externalLinks.length;
    const inputStart = inputs.join("").length;
    await window.webContents.executeJavaScript(
      `(() => {
        const canvas = [...document.querySelectorAll('.restty-terminal-surface canvas')].find((candidate) => candidate.getBoundingClientRect().width > 0);
        const init = { bubbles: true, cancelable: true, isPrimary: true, pointerId: ${pointerId}, pointerType: 'mouse', button: 0, buttons: 1, clientX: ${point.x}, clientY: ${point.y}, metaKey: ${modified && process.platform === "darwin"}, ctrlKey: ${modified && process.platform !== "darwin"} };
        canvas.dispatchEvent(new PointerEvent('pointerdown', init));
        ${cancellation === "pointercancel" ? "canvas.dispatchEvent(new PointerEvent('pointercancel', init));" : ""}
        ${cancellation === "blur" ? "window.dispatchEvent(new Event('blur'));" : ""}
        canvas.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
      })()`,
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    return {
      activationsBefore,
      activationsAfter: externalLinks.length,
      // Focus notifications are not mouse reports; retain every other byte.
      mouseReports: inputs
        .join("")
        .slice(inputStart)
        .replaceAll(/\u001b\[[IO]/gu, ""),
    };
  };
  // Use the exact same synthetic sequence and coordinates as the negatives.
  const positive = await observe(77, "none");
  await waitFor(
    () => externalLinks.length === positive.activationsBefore + 1,
    "same-coordinate cancellation link activation control",
  );
  const reportingControl = (await observe(78, "none", false)).mouseReports;
  const pointercancel = await observe(79, "pointercancel");
  const blur = await observe(80, "blur");
  return { positive, reportingControl, pointercancel, blur };
}
