// @vitest-environment jsdom
import { runInNewContext } from "node:vm";
import { createLocalImagePreview } from "../../src/renderer/local-image-preview";
import {
  installResttyVisibleLinks,
  requestVisibleLink,
} from "../../src/terminal-surface/restty-visible-links";
import type { LocalImageRequest } from "../../src/shared/local-image";
import type { BrowserWindow, MouseInputEvent } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { loadResttyWasm } from "restty/internal";
import {
  exerciseResttyLinks,
  terminalCellPoint,
} from "../fixtures/restty-link-gestures";
import { snapshotLocalImageCoreCells } from "../fixtures/restty-local-image-core-probe";
import { createLinkDestinationObserver } from "../fixtures/restty-link-readiness-probe";

// Only the Electron/renderer/PTY ports are modeled. Run the real caller and its
// real renderer observer snippets; no fixture or point helper is mocked.
// Core observations are synthetic: this proves fixture ordering, not real
// parsing, native layout, pixels or link recognition.
function retilingRenderer(
  mutation?:
    | "replacement"
    | "after-first-click"
    | "invalid-backing"
    | "wrong-destination",
) {
  const finalGeometry = {
    canvas: { x: 8, y: 31.59375, width: 1656, height: 828.90625 },
    backing: { width: 3312, height: 1657 },
    viewport: { width: 1672, height: 908 },
    dpr: 2,
    cols: 194,
    rows: 41,
    cellWidth: 17,
    cellHeight: 40,
  };
  const intermediate = {
    ...finalGeometry,
    canvas: { x: 8, y: 32, width: 739.5, height: 460 },
    backing: { width: 1479, height: 920 },
    cols: 87,
    rows: 23,
  };
  let geometry = finalGeometry;
  let canvasId = 2;
  let text = "";
  let emitted = false;
  let rendererReturnQueued = false;
  let returned = false;
  const resizes = [
    { cols: 174, rows: 36 },
    { cols: 194, rows: 41 },
  ];
  const externalLinks: string[] = [];
  const inputs: string[] = [];
  const events: MouseInputEvent[] = [];
  const downstream = new Error("Local-path delivery is outside this probe");
  const returnToTile = () => {
    if (returned) return;
    returned = true;
    geometry = finalGeometry;
    resizes.push({ cols: 194, rows: 41 });
    if (mutation === "replacement") canvasId = 3;
    if (mutation === "invalid-backing")
      geometry = { ...finalGeometry, backing: { width: 3311, height: 1657 } };
  };
  const canvas = {
    getBoundingClientRect: () => geometry.canvas,
    __resttyHoverFixture: () => ({ canvasId, geometry }),
    __resttyLinkDestinationFixture: createLinkDestinationObserver(),
    __localImageFixtureCoreCells: () => ({
      cols: geometry.cols,
      rows: geometry.rows,
      text,
    }),
  };
  const window = {
    setSize() {
      resizes.push({ cols: 87, rows: 23 });
      setTimeout(returnToTile, 1);
    },
    webContents: {
      async executeJavaScript(script: string) {
        // Readiness can complete on a matching transient packet. The queued
        // compositor return is serviced by the next renderer operation, before
        // actual input. This models external event ordering, not private call
        // counts or a guessed quiet interval.
        if (rendererReturnQueued) returnToTile();
        return runInNewContext(script, {
          document: {
            querySelectorAll: () => [canvas],
            __resttyLinkPreviewFixture: () => false,
          },
        }) as unknown;
      },
      sendInputEvent(event: MouseInputEvent) {
        events.push(event);
        if (event.type !== "mouseUp") return;
        if (
          event.button === "left" &&
          event.modifiers?.includes(
            process.platform === "darwin" ? "meta" : "control",
          )
        )
          externalLinks.push(
            mutation === "wrong-destination"
              ? "https://wrong.test/destination"
              : `https://example.test/漢${"a".repeat(194)}`,
          );
        else inputs.push("unexpected native mouse report");
        if (mutation === "after-first-click") {
          geometry = {
            ...finalGeometry,
            cols: 195,
            canvas: { ...finalGeometry.canvas, width: 1657.5 },
            backing: { width: 3315, height: 1657 },
          };
          resizes.push({ cols: 195, rows: 41 });
        }
      },
    },
  } as unknown as BrowserWindow;
  return {
    events,
    externalLinks,
    downstream,
    options: {
      window,
      resizes,
      externalLinks,
      inputs,
      localImageRequests: [],
      deliverOutput(data: string) {
        if (data.includes("/tmp/") || data.includes("\\tmp\\"))
          throw downstream;
        if (!data.includes("https://example.test/")) return;
        text = data
          .replace(/\u001b\][^\u0007]*\u0007/gu, "")
          .replace(/\u001b\[[?\d;]*[A-Za-z]/gu, "");
        if (emitted) return;
        emitted = true;
        geometry = intermediate;
        resizes.push({ cols: 87, rows: 23 });
      },
      async waitFor(predicate: () => boolean | Promise<boolean>) {
        const deadline = Date.now() + 1000;
        while (!(await predicate())) {
          if (Date.now() >= deadline) throw new Error("Readiness exhausted");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (emitted) rendererReturnQueued = true;
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("activates both soft-wrapped URL rows using the current grid after a transient matching resize", async () => {
  vi.useFakeTimers();
  const fixture = retilingRenderer();
  const outcome = exerciseResttyLinks(fixture.options).catch(
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  // Reaching the next unsupported I/O proves both actual-caller clicks happened;
  // the bounded probe deliberately makes no claim about the remaining scenario.
  expect(await outcome).toBe(fixture.downstream);
  expect(fixture.externalLinks).toEqual([
    `https://example.test/漢${"a".repeat(194)}`,
    `https://example.test/漢${"a".repeat(194)}`,
  ]);
  expect(fixture.events.map(({ type, x, y }) => ({ type, x, y }))).toEqual([
    { type: "mouseDown", x: 46, y: 41 },
    { type: "mouseUp", x: 46, y: 41 },
    { type: "mouseDown", x: 29, y: 61 },
    { type: "mouseUp", x: 29, y: 61 },
  ]);
  expect(fixture.options.inputs).toEqual([]);
});

it("rejects a changed literal destination despite two activation acknowledgements", async () => {
  vi.useFakeTimers();
  const fixture = retilingRenderer("wrong-destination");
  const outcome = exerciseResttyLinks(fixture.options).catch(
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  expect(await outcome).toMatchObject({
    message: "Restty link activation changed the literal destination",
  });
  expect(fixture.events).toHaveLength(4);
  expect(fixture.externalLinks).toEqual([
    "https://wrong.test/destination",
    "https://wrong.test/destination",
  ]);
  expect(fixture.options.inputs).toEqual([]);
});

it("preserves real borrowed WASM views under a selection-allocation trap", async () => {
  const wasm = await loadResttyWasm();
  const handle = wasm.create(80, 20, 10_000_000);
  try {
    wasm.write(handle, "https://cancel.test/visible");
    wasm.renderUpdate(handle);
    const cached = wasm.getRenderState(handle);
    if (!cached?.codepoints) throw new Error("Real render views unavailable");
    const beforeBytes = cached.codepoints.byteLength;
    const memoryBytes = wasm.memory.buffer.byteLength;
    const original = wasm.getSelectionText.bind(wasm);
    let queries = 0;
    // A controlled legal allocation boundary, NOT natural Windows occurrence.
    // The predecessor's actual fixture query detaches the already-borrowed view.
    wasm.getSelectionText = (...args) => {
      if (queries++ === 0) wasm.memory.grow(1);
      return original(...args);
    };
    const canvas = {
      getBoundingClientRect: () => ({ width: 800 }),
      __resttyHoverFixture: () => ({
        canvasId: 1,
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
      __localImageFixtureCoreCells: () =>
        snapshotLocalImageCoreCells(wasm, handle),
    };
    const window = {
      webContents: {
        executeJavaScript: async (script: string) =>
          runInNewContext(script, {
            document: { querySelectorAll: () => [canvas] },
          }) as unknown,
      },
    } as unknown as BrowserWindow;
    expect(
      await terminalCellPoint(window, 0, 3, { cols: 80, rows: 20 }),
    ).toEqual({ x: 35, y: 10 });
    expect(beforeBytes).toBeGreaterThan(0);
    expect(cached.codepoints.byteLength).toBe(beforeBytes);
    expect(wasm.memory.buffer.byteLength).toBe(memoryBytes);
    expect(queries).toBe(0);
  } finally {
    wasm.destroy(handle);
  }
});

it.each([
  ["replacement", "geometry-changed", 0],
  ["after-first-click", "geometry-changed", 2],
  ["invalid-backing", "preparation", 0],
] as const)(
  "rejects %s at the actual gesture boundary",
  async (mutation, category, events) => {
    vi.useFakeTimers();
    const fixture = retilingRenderer(mutation);
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toMatchObject({ category });
    expect(fixture.events).toHaveLength(events);
    expect(fixture.externalLinks).toHaveLength(events / 2);
    expect(fixture.options.inputs).toEqual([]);
  },
);

// Real gesture controller, destination routing and preview owner; only drawing,
// Electron transport and the image-loader reply are controlled. No native proof.
function cancellingPreviewRenderer(
  options: {
    priorReplyDelay?: number;
    destinationDelay?: number;
    mutation?:
      | "never-current"
      | "stale-current"
      | "late-invalidation"
      | "extra-request"
      | "late-extra-request"
      | "local-geometry"
      | "wrong-literal";
  } = {},
) {
  document.body.replaceChildren();
  const root = document.createElement("main");
  root.className = "restty-terminal-surface";
  const canvas = document.createElement("canvas");
  const input = document.createElement("textarea");
  root.append(canvas, input);
  document.body.append(root);
  const geometry = {
    canvas: { x: 0, y: 0, width: 800, height: 400 },
    backing: { width: 800, height: 400 },
    viewport: { width: 800, height: 400 },
    dpr: 1,
    cols: 80,
    rows: 20,
    cellWidth: 10,
    cellHeight: 20,
  };
  let canvasId = 1;
  const destinationObserver = createLinkDestinationObserver();
  Object.assign(canvas, {
    __resttyLinkDestinationFixture: destinationObserver,
    getBoundingClientRect: () => geometry.canvas,
    __resttyHoverFixture: () => ({ canvasId, geometry }),
  });
  const localImageRequests: LocalImageRequest[] = [];
  const externalLinks: string[] = [];
  const inputs: string[] = [];
  const events: MouseInputEvent[] = [];
  const openings: Promise<void>[] = [];
  let destination = "";
  let expectedDestination = "";
  let clickedBeforeDestination = false;
  let invalidateBeforeNextOperation = false;
  const presentDestination = (next: string) => {
    destination = next;
    const codepoints = new Uint32Array(80 * 20);
    codepoints.set(Array.from(next, (char) => char.codePointAt(0)!));
    destinationObserver.present(
      destinationObserver.capture({ cols: 80, rows: 20, codepoints }),
    );
  };
  let firstReplyCompleted = false;
  let clickedWhileOpening = false;
  const preview = createLocalImagePreview(document, {
    async loadImage(source) {
      localImageRequests.push(
        options.mutation === "wrong-literal"
          ? { source: "native-path", path: "/tmp/wrong.png" }
          : source!,
      );
      if (options.mutation === "extra-request")
        localImageRequests.push(source!);
      if (localImageRequests.length === 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.priorReplyDelay ?? 0),
        );
        firstReplyCompleted = true;
        if (options.mutation === "late-extra-request")
          localImageRequests.push(source!);
      }
      return null;
    },
    focusTerminal: () => input.focus(),
  });
  Object.assign(document, {
    __resttyLinkPreviewFixture: () => preview.isActive(),
  });
  const controller = installResttyVisibleLinks(
    canvas,
    {
      getVisibleLinkAtClientPoint: () => ({
        id: destination,
        url: destination,
        cells: [3],
      }),
      setVisibleLinkHover() {},
    },
    (url) =>
      requestVisibleLink(url, {
        onExternalLink: (link) => externalLinks.push(link),
        onLocalImageActivation: (source) => openings.push(preview.open(source)),
      }),
    process.platform === "darwin" ? "MacIntel" : "Windows",
  );
  for (const type of ["pointerdown", "pointerup"])
    canvas.addEventListener(type, () => inputs.push("unowned mouse report"));
  const downstream = new Error(
    "Post-local-path scenario is outside this probe",
  );
  const window = {
    webContents: {
      async executeJavaScript(script: string) {
        if (invalidateBeforeNextOperation) {
          destinationObserver.invalidate();
          invalidateBeforeNextOperation = false;
        }
        return runInNewContext(script, { document }) as unknown;
      },
      sendInputEvent(event: MouseInputEvent) {
        events.push(event);
        if (preview.isActive()) clickedWhileOpening = true;
        if (destination !== expectedDestination)
          clickedBeforeDestination = true;
        canvas.dispatchEvent(
          new PointerEvent(
            event.type === "mouseDown" ? "pointerdown" : "pointerup",
            {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              clientX: event.x,
              clientY: event.y,
              button: 0,
              buttons: event.type === "mouseDown" ? 1 : 0,
              metaKey: event.modifiers?.includes("meta") ?? false,
              ctrlKey: event.modifiers?.includes("control") ?? false,
            },
          ),
        );
      },
    },
  } as unknown as BrowserWindow;
  return {
    downstream,
    events,
    localImageRequests,
    clickedWhileOpening: () => clickedWhileOpening,
    firstReplyCompleted: () => firstReplyCompleted,
    clickedBeforeDestination: () => clickedBeforeDestination,
    destinationObserver,
    options: {
      window,
      resizes: [{ cols: 80, rows: 20 }],
      externalLinks,
      inputs,
      localImageRequests,
      deliverOutput(data: string) {
        if (data.includes("https://one.test")) throw downstream;
        expectedDestination = data
          .replace(/\u001b\][^\u0007]*\u0007/gu, "")
          .replace(/\u001b\[[?\d;]*[A-Za-z]/gu, "")
          .replace(/^漢e\u0301 /u, "");
        const local =
          !expectedDestination.startsWith("https://") &&
          !expectedDestination.startsWith("alternate");
        if (local && options.mutation === "local-geometry") canvasId = 2;
        if (local && options.mutation === "never-current") {
          destinationObserver.invalidate();
          return;
        }
        if (local && options.mutation === "stale-current") {
          presentDestination(destination);
          return;
        }
        if (options.destinationDelay && local) {
          const next = expectedDestination;
          destinationObserver.invalidate();
          setTimeout(() => {
            presentDestination(next);
          }, options.destinationDelay);
        } else presentDestination(expectedDestination);
      },
      async waitFor(
        predicate: () => boolean | Promise<boolean>,
        label: string,
      ) {
        const deadline = Date.now() + 1000;
        while (!(await predicate())) {
          if (Date.now() >= deadline)
            throw new Error(`Readiness exhausted: ${label}`);
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        if (
          options.mutation === "late-invalidation" &&
          label.includes("current destination")
        )
          invalidateBeforeNextOperation = true;
      },
    },
    async dispose() {
      controller.dispose();
      preview.dispose();
      await Promise.all(openings);
      delete (document as Document & { __resttyLinkPreviewFixture?: unknown })
        .__resttyLinkPreviewFixture;
      root.remove();
    },
  };
}

it("waits for prior preview cancellation before each single local-image gesture", async () => {
  vi.useFakeTimers();
  const fixture = cancellingPreviewRenderer({ priorReplyDelay: 350 });
  try {
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toBe(fixture.downstream);
    expect(fixture.firstReplyCompleted()).toBe(true);
    expect(fixture.clickedWhileOpening()).toBe(false);
    expect(fixture.localImageRequests).toHaveLength(4);
    expect(fixture.events).toHaveLength(12); // two web + four local, one down/up each
    const modifiers = process.platform === "darwin" ? ["meta"] : ["control"];
    expect(fixture.events.slice(4)).toEqual(
      Array.from({ length: 4 }, () => [
        {
          type: "mouseDown",
          x: 35,
          y: 10,
          button: "left",
          clickCount: 1,
          modifiers,
        },
        {
          type: "mouseUp",
          x: 35,
          y: 10,
          button: "left",
          clickCount: 1,
          modifiers,
        },
      ]).flat(),
    );
    const path =
      process.platform === "win32"
        ? `C:\\tmp\\${"local".repeat(80)}%23#fixture.data`
        : `/tmp/${"local".repeat(80)}%23#fixture.data`;
    expect(fixture.localImageRequests).toEqual([
      { source: "native-path", path },
      { source: "path-reference", path: "~/image.png:1" },
      { source: "path-reference", path: "../image.png" },
      { source: "path-reference", path: `'${path} space.png':12:3` },
    ]);
    expect(fixture.options.inputs).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});

it("waits for the expected CURRENT destination rather than a previous recognized destination", async () => {
  vi.useFakeTimers();
  const fixture = cancellingPreviewRenderer({ destinationDelay: 250 });
  try {
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    expect(await outcome).toBe(fixture.downstream);
    expect(fixture.clickedBeforeDestination()).toBe(false);
    expect(fixture.localImageRequests).toHaveLength(4);
    expect(fixture.events).toHaveLength(12);
    expect(fixture.options.externalLinks).toHaveLength(2);
    expect(fixture.options.inputs).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});

it.each([
  ["never-current", "current destination", 4, 0],
  ["stale-current", "current destination", 4, 0],
  ["late-invalidation", "preparation invalidated", 4, 0],
  ["extra-request", "activation", 6, 2],
  ["late-extra-request", "excess requests", 6, 2],
  ["local-geometry", "geometry-changed", 4, 0],
  ["wrong-literal", "changed the literal destination", 6, 1],
] as const)(
  "fails boundedly on %s without another gesture and clears its expectation",
  async (mutation, phase, eventCount, requestCount) => {
    vi.useFakeTimers();
    const fixture = cancellingPreviewRenderer({ mutation });
    try {
      const outcome = exerciseResttyLinks(fixture.options).catch(
        (error: unknown) => error,
      );
      await vi.runAllTimersAsync();
      const failure = await outcome;
      expect(failure instanceof Error && failure.message).toContain(phase);
      expect(fixture.events).toHaveLength(eventCount);
      expect(fixture.localImageRequests).toHaveLength(requestCount);
      expect(fixture.destinationObserver.snapshot()).toBeUndefined();
      // A cleared expectation cannot match a later frame after failure.
      expect(
        fixture.destinationObserver.capture({
          cols: 80,
          rows: 20,
          codepoints: new Uint32Array(1600),
        }).matches,
      ).toBe(false);
      expect(fixture.options.inputs).toEqual([]);
    } finally {
      await fixture.dispose();
    }
  },
);

it("times out a pending preview without replacing output or sending the next gesture", async () => {
  vi.useFakeTimers();
  const fixture = cancellingPreviewRenderer({ priorReplyDelay: 1500 });
  try {
    const outcome = exerciseResttyLinks(fixture.options).catch(
      (error: unknown) => error,
    );
    await vi.runAllTimersAsync();
    const failure = await outcome;
    expect(failure instanceof Error && failure.message).toContain(
      "variant 0 preview cancellation (count 1)",
    );
    expect(fixture.events).toHaveLength(6);
    expect(fixture.localImageRequests).toHaveLength(1);
    expect(fixture.firstReplyCompleted()).toBe(true);
    expect(fixture.clickedWhileOpening()).toBe(false);
    expect(fixture.destinationObserver.snapshot()).toBeUndefined();
    expect(fixture.options.inputs).toEqual([]);
  } finally {
    await fixture.dispose();
  }
});
