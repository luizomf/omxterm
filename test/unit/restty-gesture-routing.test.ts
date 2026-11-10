// @vitest-environment jsdom
import { createInputHandler } from "restty/internal";
import { describe, expect, it } from "vitest";
import { installResttyVisibleLinks } from "../../src/terminal-surface/restty-visible-links";
import {
  createResttyGestureRecorder,
  type ResttyGestureName,
} from "../fixtures/restty-gesture-evidence";

function harness(platform: string) {
  const canvas = document.createElement("canvas");
  const inputs: string[] = [];
  const activations: string[] = [];
  let changed = false;
  const handler = createInputHandler({
    sendReply(data) {
      inputs.push(data);
    },
    positionToCell: (event) => ({ col: event.clientX, row: event.clientY }),
    getWheelCellMetrics: () => ({
      cellWidth: 10,
      cellHeight: 20,
      cols: 80,
      rows: 24,
    }),
  });
  // Modes come from the real OutputFilter, never an always-on mouse substitute.
  handler.filterOutput("\u001b[?1000h\u001b[?1006h");
  const controller = installResttyVisibleLinks(
    canvas,
    {
      // Deterministic visible destination/cell geometry is the only supplied
      // renderer adapter; capture/replay and encoding are production code.
      getVisibleLinkAtClientPoint: (_x, y) =>
        handler.isAltScreen()
          ? null
          : {
              id: String(y),
              url: changed ? "https://new.test/b" : `https://example.test/${y}`,
              cells: [0],
            },
      setVisibleLinkHover() {},
    },
    (url) => activations.push(url),
    platform === "darwin" ? "MacIntel" : "Linux aarch64",
  );
  for (const [type, kind] of [
    ["pointerdown", "down"],
    ["pointermove", "move"],
    ["pointerup", "up"],
  ] as const)
    canvas.addEventListener(type, (event) =>
      handler.sendMouseEvent(kind, event),
    );
  canvas.addEventListener("wheel", (event) =>
    handler.sendMouseEvent("wheel", event),
  );
  const send = (
    type: "pointerdown" | "pointermove" | "pointerup",
    row = 0,
    modified = true,
    button = 0,
  ) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button,
        buttons: type === "pointerup" ? 0 : button === 1 ? 4 : 1,
        metaKey: modified && platform === "darwin",
        ctrlKey: modified && platform !== "darwin",
        clientX: 3,
        clientY: row,
      }),
    );
  const record = createResttyGestureRecorder({
    inputs,
    activations: () => activations.length,
    drain: async () => {},
    platform,
  });
  return {
    inputs,
    record,
    controller,
    async run(name: ResttyGestureName) {
      return record(name, async () => {
        if (name === "alternatePrimary" || name === "alternateWheel") {
          handler.filterOutput("\u001b[?1049h");
          expect(handler.isAltScreen()).toBe(true);
        }
        if (name === "wheel" || name === "alternateWheel") {
          canvas.dispatchEvent(
            new WheelEvent("wheel", {
              clientX: 3,
              clientY: 0,
              deltaMode: 1,
              deltaY: name === "wheel" ? 2 : -1,
            }),
          );
          return;
        }
        const modified = name !== "plainPrimary" && name !== "alternatePrimary";
        const button = name === "modifiedMiddle" ? 1 : 0;
        send("pointerdown", 0, modified, button);
        if (name === "modifiedDrag") send("pointermove", 1);
        if (name === "changedUrl") changed = true;
        send(
          "pointerup",
          name === "modifiedDrag" ? 1 : 0,
          modified && name !== "releasedModifier",
          button,
        );
      });
    },
  };
}

const gestures = [
  "modifiedDrag",
  "plainPrimary",
  "modifiedMiddle",
  "changedUrl",
  "releasedModifier",
  "wheel",
  "alternatePrimary",
  "alternateWheel",
] as const;

// Product code branches only on macOS (Meta) versus other platforms (Ctrl).
for (const platform of ["darwin", "linux"]) {
  describe(`exact ${platform} gesture routing`, () => {
    for (const name of gestures) {
      it(`routes ${name} with exact coordinates, modifiers, button and zero activation`, async () => {
        const fixture = harness(platform);
        try {
          const evidence = await fixture.run(name);
          expect(evidence.activationsAfter - evidence.activationsBefore).toBe(
            0,
          );
          expect(evidence.unattributedInput).toBe("");
          expect(evidence.inputEnd - evidence.inputStart).toBe(
            evidence.mouseReports.length,
          );
          if (name === "releasedModifier" && platform !== "darwin")
            expect(evidence.mouseReports).toBe("\u001b[<16;4;1M\u001b[<0;4;1m");
          if (name === "wheel")
            expect(evidence.mouseReports).toBe(
              "\u001b[<65;4;1M\u001b[<65;4;1M",
            );
        } finally {
          fixture.controller.dispose();
        }
      });
    }
  });
}
