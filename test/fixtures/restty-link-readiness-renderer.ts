import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";
import { createFixtureMetricReplyRouter } from "./restty-host-metric-replies";
import { hardRows } from "./restty-link-flow-readiness";
import type { BrowserWindow, MouseInputEvent } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import { createLocalImagePreview } from "../../src/renderer/local-image-preview";
import {
  installResttyVisibleLinks,
  requestVisibleLink,
} from "../../src/terminal-surface/restty-visible-links";
import {
  createLinkDestinationObserver,
  type LinkFixtureViewport,
} from "./restty-link-readiness-probe";
import {
  createLinkCoreRenderer,
  type LinkCoreRendererOptions,
} from "./restty-link-core-renderer";

const preparedRuntime = readFileSync(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
const readRuntimeCluster = runInNewContext(
  `${preparedRuntime.slice(preparedRuntime.indexOf("function readClusterText("), preparedRuntime.indexOf("function classifyCluster("))}\nreadClusterText`,
) as NonNullable<Parameters<typeof createLinkDestinationObserver>[0]>;
export const observer = (
  readViewport?: () => LinkFixtureViewport | undefined,
) =>
  createLinkDestinationObserver(
    readRuntimeCluster,
    ({ text, offset, clippedStart, clippedEnd }) =>
      visibleLinkAtOffset(text, offset, clippedStart, clippedEnd),
    readViewport,
  );

// Real routing with a controlled external consumer. Faults are test-only, not
// a model of native causality. Keep this feedback adapter outside the DOM owner.
function modeledReplyRoute(
  options: PreviewRendererOptions,
  inputs: string[],
  fixture: {
    observer: () => ReturnType<typeof observer>;
    core: () => ReturnType<typeof createLinkCoreRenderer> | undefined;
    replaceCanvas: () => void;
    translateCanvas: () => void;
    deliverOutput: (data: string) => void;
  },
) {
  let armed = false;
  const replies: string[] = [];
  const route = createFixtureMetricReplyRouter(
    {
      write(data: string) {
        if (!armed || !options.flow?.feedback) return;
        replies.push(data);
        if (replies.length !== 2) return;
        armed = false;
        const feedback = options.flow.feedback;
        const destination = fixture.observer();
        const retained = destination.snapshot();
        const output =
          feedback === "mouse-echo"
            ? replies.join("").replaceAll("\u001b", "^[")
            : feedback === "mouse-off"
              ? "\u001b[?1000l"
              : feedback === "scroll-feedback"
                ? "\u001b[20;1H\r\n"
                : "\u001b[?25l";
        if (feedback === "cursor-hide-geometry") fixture.replaceCanvas();
        if (feedback === "cursor-hide-origin") fixture.translateCanvas();
        if (feedback === "cursor-hide-grid")
          fixture.core()!.resizeForFeedback();
        if (feedback === "expectation-reset")
          destination.prepareFrame(
            hardRows(["https://one.test/a", "https://two.test/b"]),
          );
        fixture
          .core()!
          .deliver(
            output,
            feedback === "cursor-hide-delayed"
              ? 100
              : feedback === "cursor-hide-unsubmitted" ||
                  feedback === "cursor-hide-stale"
                ? false
                : 0,
          );
        if (feedback === "cursor-hide-stale" && retained)
          destination.present(retained);
      },
      resize() {},
    },
    fixture.deliverOutput,
    { inputs, resizes: [] },
  );
  return {
    ...route,
    armFeedback() {
      armed = true;
    },
  };
}

// Explicit modeled cell production, not a Unicode renderer. Actual WASM and
// prepared-runtime recognition are checked separately in the probe tests.
export function modeledFrame(text: string, cols: number, rows: number) {
  const codepoints = new Uint32Array(cols * rows);
  const wide = new Uint8Array(cols * rows);
  const graphemeLen = new Uint32Array(cols * rows);
  const graphemeOffset = new Uint32Array(cols * rows);
  const graphemeBuffer = new Uint32Array([0x301]);
  let index = 0;
  for (const char of text) {
    if (char === "\u0301") {
      graphemeLen[index - 1] = 1;
      continue;
    }
    codepoints[index] = char.codePointAt(0)!;
    if (char === "漢") {
      wide[index] = 1;
      wide[++index] = 2;
    }
    index++;
  }
  return {
    cols,
    rows,
    codepoints,
    wide,
    graphemeLen,
    graphemeOffset,
    graphemeBuffer,
  };
}

interface PreviewRendererOptions {
  priorReplyDelay?: number;
  destinationDelay?: number;
  webDestinationDelay?: number;
  stopAfterWeb?: boolean;
  flow?: LinkCoreRendererOptions;
  webMutation?:
    "never-current" | "stale-current" | "late-invalidation" | "extra-request";
  mutation?:
    | "never-current"
    | "stale-current"
    | "late-invalidation"
    | "extra-request"
    | "late-extra-request"
    | "local-geometry"
    | "wrong-literal";
}

// Preserve the existing bounded Unicode/local-preview model. The optional core
// adapter below replaces this producer, not the caller/controller/routing seam.
function modeledProducer(
  options: PreviewRendererOptions,
  destinationObserver: ReturnType<typeof observer>,
  downstream: Error,
  replaceCanvas: () => void,
) {
  let destination = "";
  let expected = "";
  let clickedEarly = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const present = (next: string) => {
    destination = next;
    const text = next.startsWith("https://example.test/")
      ? `漢e\u0301 ${next}`
      : next;
    destinationObserver.present(
      destinationObserver.capture(modeledFrame(text, 80, 20)),
    );
  };
  return {
    clickedEarly: () => clickedEarly,
    beforeInput() {
      if (destination !== expected) clickedEarly = true;
    },
    lookup: () =>
      destination ? { id: destination, url: destination, cells: [3] } : null,
    deliver(data: string) {
      if (data.includes("https://one.test")) throw downstream;
      if (pending) clearTimeout(pending);
      expected = data
        .replace(/\u001b\][^\u0007]*\u0007/gu, "")
        .replace(/\u001b\[[?\d;]*[A-Za-z]/gu, "")
        .replace(/^漢e\u0301 /u, "");
      const local =
        !expected.startsWith("https://") && !expected.startsWith("alternate");
      if (local && options.stopAfterWeb) throw downstream;
      if (local && options.mutation === "local-geometry") replaceCanvas();
      if (
        (local ? options.mutation : options.webMutation) === "never-current"
      ) {
        if (!local) destination = "";
        destinationObserver.invalidate();
        return;
      }
      if (
        (local ? options.mutation : options.webMutation) === "stale-current"
      ) {
        present(
          local ? destination : `https://example.test/漢${"b".repeat(80)}`,
        );
        return;
      }
      const delay = local
        ? options.destinationDelay
        : options.webDestinationDelay;
      if (delay) {
        const next = expected;
        destination = "";
        destinationObserver.invalidate();
        pending = setTimeout(() => present(next), delay);
      } else present(expected);
    },
    dispose() {
      if (pending) clearTimeout(pending);
    },
  };
}

// Real gesture controller, destination routing and preview owner; only drawing,
// Electron transport and the image-loader reply are controlled. No native proof.
export function cancellingPreviewRenderer(
  options: PreviewRendererOptions = {},
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
  const localImageRequests: LocalImageRequest[] = [];
  const externalLinks: string[] = [];
  const inputs: string[] = [];
  const events: MouseInputEvent[] = [];
  const openings: Promise<void>[] = [];
  const route = modeledReplyRoute(options, inputs, {
    observer: () => destinationObserver,
    core: () => core,
    replaceCanvas: () => replaceCanvas(),
    translateCanvas() {
      geometry.canvas.x = 10;
      geometry.viewport.width = 810;
    },
    deliverOutput(data) {
      if (core) {
        if (!core.deliver(data)) throw downstream;
      } else {
        handler.filterOutput(data);
        modeled.deliver(data);
      }
    },
  });
  const handler = createInputHandler({
    sendReply: (data) => route.terminal.write(data),
    getWheelCellMetrics: () => ({
      cellWidth: 10,
      cellHeight: 20,
      rows: 20,
      cols: 80,
    }),
    positionToCell: (event) => ({
      col: Math.floor(event.clientX / 10),
      row: Math.floor(event.clientY / 20),
    }),
  });
  let core: ReturnType<typeof createLinkCoreRenderer> | undefined;
  const destinationObserver = observer(() => core?.viewport());
  Object.assign(canvas, {
    __resttyLinkDestinationFixture: destinationObserver,
    getBoundingClientRect: () => geometry.canvas,
    __resttyHoverFixture: () => ({ canvasId, geometry }),
  });
  const downstream = new Error(
    "Post-local-path scenario is outside this probe",
  );
  const replaceCanvas = () => {
    canvasId++;
  };
  const modeled = modeledProducer(
    options,
    destinationObserver,
    downstream,
    replaceCanvas,
  );
  if (options.flow)
    core = createLinkCoreRenderer(
      options.flow,
      canvas,
      { inputs, events },
      handler,
      destinationObserver,
      replaceCanvas,
    );
  let firstReplyCompleted = false;
  let clickedWhileOpening = false;
  let invalidateBeforeNextOperation = false;
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
      getVisibleLinkAtClientPoint: (x, y) =>
        core ? core.lookup(x, y) : modeled.lookup(),
      setVisibleLinkHover() {},
    },
    (url) =>
      requestVisibleLink(url, {
        onExternalLink: (link) => {
          externalLinks.push(...(core?.activations(link) ?? [link]));
          if (options.webMutation === "extra-request") externalLinks.push(link);
        },
        onLocalImageActivation: (source) => openings.push(preview.open(source)),
      }),
    process.platform === "darwin" ? "MacIntel" : "Linux aarch64",
  );
  for (const [type, kind] of [
    ["pointerdown", "down"],
    ["pointermove", "move"],
    ["pointerup", "up"],
  ] as const)
    canvas.addEventListener(type, (event) => {
      if (kind === "down" && core?.loseReplay(event)) return;
      handler.sendMouseEvent(kind, event);
    });
  let wheels = 0;
  canvas.addEventListener("wheel", (event) => {
    wheels++;
    if (!handler.sendMouseEvent("wheel", event)) core?.scroll(event);
  });
  const window = {
    webContents: {
      async executeJavaScript(script: string) {
        if (invalidateBeforeNextOperation) {
          destinationObserver.invalidate();
          invalidateBeforeNextOperation = false;
        }
        const result = await (runInNewContext(script, {
          document,
          WheelEvent,
          requestAnimationFrame: (callback: () => void) =>
            setTimeout(callback, 0),
          window: {
            omxterm: { terminal: { configuration: async () => undefined } },
          },
        }) as unknown);
        // Electron serializes bridge results. Do not alias mutable geometry or
        // observer metadata between this controlled renderer and its caller.
        return structuredClone(result);
      },
      sendInputEvent(event: MouseInputEvent) {
        events.push(event);
        if (event.type === "mouseDown") core?.nativeDown();
        if (preview.isActive()) clickedWhileOpening = true;
        modeled.beforeInput();
        canvas.dispatchEvent(
          new PointerEvent(
            event.type === "mouseDown"
              ? "pointerdown"
              : event.type === "mouseMove"
                ? "pointermove"
                : "pointerup",
            {
              bubbles: true,
              cancelable: true,
              pointerId: 1,
              pointerType: "mouse",
              isPrimary: true,
              clientX: event.x,
              clientY: event.y,
              button: event.button === "middle" ? 1 : 0,
              buttons:
                event.type === "mouseUp"
                  ? 0
                  : event.button === "middle"
                    ? 4
                    : 1,
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
    destinationObserver,
    wheelCount: () => wheels,
    consumedOriginalBeforeReplacement: () => core?.consumedOriginal() ?? false,
    clickedWhileOpening: () => clickedWhileOpening,
    firstReplyCompleted: () => firstReplyCompleted,
    clickedBeforeDestination: modeled.clickedEarly,
    options: {
      window,
      resizes: [{ cols: 80, rows: 20 }],
      externalLinks,
      inputs,
      localImageRequests,
      deliverOutput: route.deliverOutput,
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
        if (label === "released-modifier current frame") route.armFeedback();
        if (
          (options.flow?.mutation === "hard-break-invalidation" &&
            label === "hard-break current frame") ||
          (options.webMutation === "late-invalidation" &&
            label === "initial web current destination") ||
          (options.mutation === "late-invalidation" &&
            label.startsWith("local-image") &&
            label.includes("current destination"))
        )
          invalidateBeforeNextOperation = true;
      },
    },
    async dispose() {
      controller.dispose();
      core?.dispose();
      modeled.dispose();
      preview.dispose();
      await Promise.all(openings);
      delete (document as Document & { __resttyLinkPreviewFixture?: unknown })
        .__resttyLinkPreviewFixture;
      root.remove();
    },
  };
}
