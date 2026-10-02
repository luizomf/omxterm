import { runInNewContext } from "node:vm";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { exerciseResttyLinkCancellation } from "../fixtures/restty-link-cancellation";

// Execute the fixture's renderer snippets at the browser boundary. This models
// delayed IPC observation, not production link recognition or native input.
function delayedRenderer(externalLinks: string[], inputs: string[]) {
  let pending: "link" | "report" | undefined;
  class FixtureEvent {
    constructor(
      readonly type: string,
      init = {},
    ) {
      Object.assign(this, init);
    }
  }
  const canvas = {
    // The actual cell-targeting helper now reads the fixture observer. Supply
    // coherent external geometry only; this adapter models no draw or pixels.
    __resttyHoverFixture: () => ({
      geometry: {
        canvas: { x: 0, y: 0, width: 800, height: 400 },
        backing: { width: 800, height: 400 },
        viewport: { width: 800, height: 400 },
        dpr: 1,
        cols: 80,
        rows: 20,
        cellWidth: 10,
        cellHeight: 20,
      },
    }),
    __localImageFixtureCoreCells: () => ({ cols: 80, rows: 20, text: "" }),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 400 }),
    dispatchEvent(
      event: FixtureEvent & { metaKey?: boolean; ctrlKey?: boolean },
    ) {
      if (event.type === "pointerdown")
        pending = event.metaKey || event.ctrlKey ? "link" : "report";
      if (event.type === "pointercancel") pending = undefined;
      if (event.type !== "pointerup") return;
      if (pending === "link")
        setTimeout(
          () => externalLinks.push("https://cancel.test/visible"),
          150,
        );
      if (pending === "report") inputs.push("\u001b[<0;4;1M\u001b[<0;4;1m");
      pending = undefined;
    },
  };
  return {
    webContents: {
      executeJavaScript: async (script: string) =>
        runInNewContext(script, {
          document: { querySelectorAll: () => [canvas] },
          window: {
            dispatchEvent: () => {
              pending = undefined;
            },
          },
          Event: FixtureEvent,
          PointerEvent: FixtureEvent,
          requestAnimationFrame: (callback: () => void) =>
            setTimeout(callback, 1),
        }) as unknown,
    },
  } as unknown as BrowserWindow;
}

afterEach(() => vi.useRealTimers());

it("captures the positive cancellation control after its delayed activation is ready", async () => {
  vi.useFakeTimers();
  const externalLinks: string[] = [];
  const inputs: string[] = [];
  const result = exerciseResttyLinkCancellation(
    {
      window: delayedRenderer(externalLinks, inputs),
      externalLinks,
      inputs,
      deliverOutput() {},
      async waitFor(predicate) {
        const deadline = Date.now() + 1000;
        while (!(await predicate())) {
          if (Date.now() >= deadline)
            throw new Error("Control never became ready");
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      },
    },
    { cols: 80, rows: 20 },
  );
  await vi.runAllTimersAsync();
  const evidence = await result;
  expect(externalLinks).toEqual(["https://cancel.test/visible"]);
  expect(evidence.positive).toEqual({
    activationsBefore: 0,
    activationsAfter: 1,
    mouseReports: "",
  });
  expect(evidence.reportingControl).toBe("\u001b[<0;4;1M\u001b[<0;4;1m");
  for (const gesture of [evidence.pointercancel, evidence.blur])
    expect(gesture).toEqual({
      activationsBefore: 1,
      activationsAfter: 1,
      mouseReports: "",
    });
});
