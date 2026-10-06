import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";
import type { BrowserWindow, MouseInputEvent } from "electron";
import type { LocalImageRequest } from "../../src/shared/local-image";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import { createLocalImagePreview } from "../../src/renderer/local-image-preview";
import {
  installResttyVisibleLinks,
  requestVisibleLink,
} from "../../src/terminal-surface/restty-visible-links";
import { createLinkDestinationObserver } from "./restty-link-readiness-probe";

const preparedRuntime = readFileSync(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
const readRuntimeCluster = runInNewContext(
  `${preparedRuntime.slice(preparedRuntime.indexOf("function readClusterText("), preparedRuntime.indexOf("function classifyCluster("))}\nreadClusterText`,
) as NonNullable<Parameters<typeof createLinkDestinationObserver>[0]>;
export const observer = () =>
  createLinkDestinationObserver(
    readRuntimeCluster,
    ({ text, offset, clippedStart, clippedEnd }) =>
      visibleLinkAtOffset(text, offset, clippedStart, clippedEnd),
  );

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

// Real gesture controller, destination routing and preview owner; only drawing,
// Electron transport and the image-loader reply are controlled. No native proof.
export function cancellingPreviewRenderer(
  options: {
    priorReplyDelay?: number;
    destinationDelay?: number;
    webDestinationDelay?: number;
    stopAfterWeb?: boolean;
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
  const destinationObserver = observer();
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
    const text = next.startsWith("https://example.test/")
      ? `漢e\u0301 ${next}`
      : next;
    destinationObserver.present(
      destinationObserver.capture(modeledFrame(text, 80, 20)),
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
      getVisibleLinkAtClientPoint: () =>
        destination ? { id: destination, url: destination, cells: [3] } : null,
      setVisibleLinkHover() {},
    },
    (url) =>
      requestVisibleLink(url, {
        onExternalLink: (link) => {
          externalLinks.push(link);
          if (options.webMutation === "extra-request") externalLinks.push(link);
        },
        onLocalImageActivation: (source) => openings.push(preview.open(source)),
      }),
    process.platform === "darwin" ? "MacIntel" : "Linux aarch64",
  );
  const handler = createInputHandler({
    sendReply: (data) => inputs.push(data),
    positionToCell: (event) => ({
      col: Math.floor(event.clientX / 10),
      row: Math.floor(event.clientY / 20),
    }),
  });
  for (const [type, kind] of [
    ["pointerdown", "down"],
    ["pointerup", "up"],
  ] as const)
    canvas.addEventListener(type, (event) =>
      handler.sendMouseEvent(kind, event),
    );
  let pendingFrame: ReturnType<typeof setTimeout> | undefined;
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
        handler.filterOutput(data);
        if (pendingFrame) clearTimeout(pendingFrame);
        expectedDestination = data
          .replace(/\u001b\][^\u0007]*\u0007/gu, "")
          .replace(/\u001b\[[?\d;]*[A-Za-z]/gu, "")
          .replace(/^漢e\u0301 /u, "");
        const local =
          !expectedDestination.startsWith("https://") &&
          !expectedDestination.startsWith("alternate");
        if (local && options.stopAfterWeb) throw downstream;
        if (local && options.mutation === "local-geometry") canvasId = 2;
        if (local && options.mutation === "never-current") {
          destinationObserver.invalidate();
          return;
        }
        if (local && options.mutation === "stale-current") {
          presentDestination(destination);
          return;
        }
        if (!local && options.webMutation === "never-current") {
          destination = "";
          destinationObserver.invalidate();
          return;
        }
        if (!local && options.webMutation === "stale-current") {
          presentDestination(`https://example.test/漢${"b".repeat(80)}`);
          return;
        }
        const delay = local
          ? options.destinationDelay
          : options.webDestinationDelay;
        if (delay) {
          const next = expectedDestination;
          destination = "";
          destinationObserver.invalidate();
          pendingFrame = setTimeout(() => {
            presentDestination(next);
          }, delay);
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
          options.webMutation === "late-invalidation" &&
          label === "initial web current destination"
        )
          invalidateBeforeNextOperation = true;
        if (
          options.mutation === "late-invalidation" &&
          label.startsWith("local-image") &&
          label.includes("current destination")
        )
          invalidateBeforeNextOperation = true;
      },
    },
    async dispose() {
      if (pendingFrame) clearTimeout(pendingFrame);
      controller.dispose();
      preview.dispose();
      await Promise.all(openings);
      delete (document as Document & { __resttyLinkPreviewFixture?: unknown })
        .__resttyLinkPreviewFixture;
      root.remove();
    },
  };
}
