import { createRequire } from "node:module";
import { build } from "esbuild";
import { createInputHandler } from "restty/internal";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { installResttyVisibleLinks } from "../../src/terminal-surface/restty-visible-links";
import {
  createResttyGestureRecorder,
  type ResttyGestureName,
} from "../fixtures/restty-gesture-evidence";
import { resttyGestureReplayMutation } from "../fixtures/restty-gesture-routing-mutation";

type Install = typeof installResttyVisibleLinks;
let withoutMoveReplay: Install;
let withoutUpReplay: Install;
// Keep Node's typed-array realm for esbuild; supply only browser DOM globals.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (
    html: string,
    options: { pretendToBeVisual: boolean },
  ) => { window: typeof window };
};
const dom = new JSDOM("<body></body>", { pretendToBeVisual: true });

beforeAll(async () => {
  for (const key of [
    "window",
    "document",
    "Node",
    "PointerEvent",
    "WheelEvent",
    "MutationObserver",
  ] as const)
    vi.stubGlobal(key, key === "window" ? dom.window : dom.window[key]);
  for (const fallback of ["move", "up"] as const) {
    const result = await build({
      entryPoints: ["src/terminal-surface/restty-visible-links.ts"],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
      plugins: [resttyGestureReplayMutation(fallback)],
    });
    const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0]!.text).toString("base64")}`;
    const mutant = (await import(/* @vite-ignore */ url)) as {
      installResttyVisibleLinks: Install;
    };
    if (fallback === "move")
      withoutMoveReplay = mutant.installResttyVisibleLinks;
    else withoutUpReplay = mutant.installResttyVisibleLinks;
  }
});

afterAll(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

function harness(
  platform: string,
  install = installResttyVisibleLinks,
  dropMiddle = false,
  drain: () => Promise<void> = async () => {},
) {
  const canvas = document.createElement("canvas");
  const inputs: string[] = [];
  const activations: string[] = [];
  let changed = false;
  let dropped = false;
  const handler = createInputHandler({
    sendReply(data) {
      // Remove one real emitted middle-button release at the encoder sink,
      // not a made-up evidence string or a mocked encoder result.
      const middleRelease =
        platform === "darwin" ? "\u001b[<1;4;1m" : "\u001b[<17;4;1m";
      if (dropMiddle && !dropped && data === middleRelease) {
        dropped = true;
        return;
      }
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
  const controller = install(
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
    platform === "darwin"
      ? "MacIntel"
      : platform === "win32"
        ? "Win32"
        : "Linux aarch64",
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
    drain,
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

for (const platform of ["darwin", "linux", "win32"]) {
  describe(`exact ${platform} gesture routing`, () => {
    for (const name of gestures) {
      it(`routes ${name} with exact coordinates, modifiers, button and zero activation`, async () => {
        // An explicit headless RED command applies the same real mutant to the
        // positive contract tests. Permanent negative controls below stay cheap.
        const mutant = process.env.OMXTERM_GESTURE_MUTANT;
        const install =
          mutant === "move"
            ? withoutMoveReplay
            : mutant === "up"
              ? withoutUpReplay
              : installResttyVisibleLinks;
        const fixture = harness(platform, install, mutant === "middle");
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
    for (const [mutant, affected] of [
      ["move", ["modifiedDrag"]],
      ["up", ["changedUrl", "releasedModifier"]],
      ["middle", ["modifiedMiddle"]],
    ] as const) {
      it(`rejects actual ${mutant} report loss only for the affected named gestures`, async () => {
        for (const name of gestures) {
          const fixture = harness(
            platform,
            mutant === "move"
              ? withoutMoveReplay
              : mutant === "up"
                ? withoutUpReplay
                : installResttyVisibleLinks,
            mutant === "middle",
          );
          try {
            if (affected.some((entry) => entry === name))
              await expect(fixture.run(name)).rejects.toThrow(
                `${name} mouse reports`,
              );
            else
              await expect(fixture.run(name)).resolves.toMatchObject({
                unattributedInput: "",
                activationsBefore: 0,
                activationsAfter: 0,
              });
          } finally {
            fixture.controller.dispose();
          }
        }
      });
    }
  });
}

it("does not attribute an actual late encoder report to the next gesture", async () => {
  const fixture = harness("linux");
  try {
    await fixture.run("plainPrimary");
    // Real encoder bytes arrive outside the recorded gesture interval.
    const handler = createInputHandler({
      sendReply: (data) => fixture.inputs.push(data),
      positionToCell: () => ({ row: 0, col: 3 }),
    });
    handler.filterOutput("\u001b[?1000h\u001b[?1006h");
    handler.sendMouseEvent(
      "down",
      new PointerEvent("pointerdown", { button: 0 }),
    );
    await expect(fixture.run("modifiedMiddle")).rejects.toThrow(
      "modifiedMiddle has leftover input before dispatch",
    );
  } finally {
    fixture.controller.dispose();
  }
});

it("rejects a real report arriving only at the post-gesture drain", async () => {
  let drains = 0;
  const fixture = harness(
    "linux",
    installResttyVisibleLinks,
    false,
    async () => {
      drains += 1;
      if (drains !== 3) return;
      const handler = createInputHandler({
        sendReply: (data) => fixture.inputs.push(data),
        positionToCell: () => ({ row: 0, col: 3 }),
      });
      handler.filterOutput("\u001b[?1000h\u001b[?1006h");
      handler.sendMouseEvent(
        "up",
        new PointerEvent("pointerup", { button: 0 }),
      );
    },
  );
  try {
    await expect(fixture.run("plainPrimary")).rejects.toThrow(
      "plainPrimary has unattributed input",
    );
  } finally {
    fixture.controller.dispose();
  }
});
