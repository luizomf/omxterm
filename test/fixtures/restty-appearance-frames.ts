export const nativeFrame = requestAnimationFrame.bind(window);
const nativeCancelFrame = cancelAnimationFrame.bind(window);
const gateFrames =
  new URLSearchParams(location.search).get("gateFrames") === "true";
let gateHeld = false;
let releasedCallbacks = 0;
const releasedFrameTimes: number[] = [];
const frameTimes: number[] = [];
const heldCallbacks = new Set<number>();
const queuedFrames = new Map<
  number,
  { callback: FrameRequestCallback; nativeId: number }
>();
let holdNextFrame: (() => void) | undefined;
// Executed-script errors reach the main process only as "Script failed to
// execute"; keep the gate's own failure readable in the capture state.
let gateError: string | null = null;
if (gateFrames) {
  let nextId = 0;
  window.requestAnimationFrame = (callback) => {
    const id = ++nextId;
    if (holdNextFrame) {
      queuedFrames.set(id, { callback, nativeId: 0 });
      heldCallbacks.add(id);
      holdNextFrame();
      return id;
    }
    const nativeId = nativeFrame((time) => {
      queuedFrames.delete(id);
      callback(time);
    });
    queuedFrames.set(id, { callback, nativeId });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const entry = queuedFrames.get(id);
    if (entry) nativeCancelFrame(entry.nativeId);
    queuedFrames.delete(id);
    heldCallbacks.delete(id);
  };
}

export function releaseSelectionFrames(): void {
  gateHeld = false;
  for (const id of heldCallbacks) {
    const entry = queuedFrames.get(id);
    if (!entry) continue;
    releasedCallbacks += 1;
    entry.nativeId = nativeFrame((time) => {
      queuedFrames.delete(id);
      releasedFrameTimes.push(time);
      entry.callback(time);
    });
  }
  heldCallbacks.clear();
}

export const selectionFrame = () =>
  new Promise<void>((resolve) =>
    nativeFrame((time) => {
      frameTimes.push(time);
      resolve();
    }),
  );

export async function beginSelectionFrameGate(): Promise<void> {
  if (!gateFrames) return;
  // Only the live Surface's frames are held. New fixture RAF boundaries keep
  // running: their completion is not render readiness. Track queue
  // identities, never callback source or production internals.
  gateHeld = true;
  for (const [id, entry] of queuedFrames) {
    nativeCancelFrame(entry.nativeId);
    heldCallbacks.add(id);
  }
  if (heldCallbacks.size > 0) return;
  // A quiet Surface leaves vsync and sleeps on a timer (#868), so nothing is
  // queued. Hold the frame its next wake requests: nothing else in the page
  // requests one before the gesture starts.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      holdNextFrame = undefined;
      gateError = "Selection gate found no Surface frame to hold";
      reject(new Error(gateError));
    }, 3000);
    holdNextFrame = () => {
      holdNextFrame = undefined;
      clearTimeout(timer);
      resolve();
    };
  });
}

export const waitForLayout = (observeSelectionFrames = false) =>
  new Promise<void>((resolve) =>
    requestAnimationFrame((firstTime) => {
      if (observeSelectionFrames) frameTimes.push(firstTime);
      requestAnimationFrame((secondTime) => {
        if (observeSelectionFrames) frameTimes.push(secondTime);
        resolve();
      });
    }),
  );

export function selectionFrameDiagnostics() {
  return {
    gateHeld,
    heldCallbacks: [...heldCallbacks],
    queuedCallbacks: [...queuedFrames.keys()],
    releasedCallbacks,
    releasedFrameTimes: [...releasedFrameTimes],
    frameCount: frameTimes.length,
    frameTimes: [...frameTimes],
    lastFrameAt: frameTimes.at(-1) ?? null,
    gateError,
  };
}
