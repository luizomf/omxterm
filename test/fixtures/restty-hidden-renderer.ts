import { createTerminalTabs } from "../../src/renderer/terminal-tabs";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import {
  hiddenPresentation,
  hiddenGLMethods,
  instrumentHiddenWebGL,
} from "./restty-hidden-presentation";
import {
  exerciseHiddenImages,
  exerciseSynchronizedReveal,
} from "./restty-hidden-images";
import { hiddenFixtureSession } from "./restty-hidden-session";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

declare global {
  var __hiddenRuntimeRaf: WeakMap<HTMLCanvasElement, number> | undefined;
}

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function hiddenRenderingFixture() {
  const root = document.querySelector<HTMLElement>("#terminal-tabs")!;
  root.replaceChildren();
  const strip = document.createElement("div");
  strip.id = "tab-strip";
  root.parentElement!.before(strip);
  const calls = instrumentHiddenWebGL();
  const sessions: ReturnType<typeof hiddenFixtureSession>[] = [];
  const titles: string[] = [];
  let bells = 0;
  let copied = "";
  const tabs = createTerminalTabs(
    { strip, container: root },
    {
      mount: mountResttyTerminalSurface,
      notifyTitle: (_id, title) => titles.push(title),
      notifyBell: () => {
        bells += 1;
      },
      surfaceOptions: {
        appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        clipboard: {
          requestContextMenu() {},
          async readText() {
            return "";
          },
          async writeText(text) {
            copied = text;
          },
          async confirmPaste() {
            return true;
          },
        },
      },
      createAdapter() {
        const index = sessions.length;
        const session = hiddenFixtureSession(`s${index + 1}`);
        sessions.push(session);
        return session.adapter;
      },
    },
  );
  await tabs.ready;
  tabs.handleCommand({ action: "new" });
  while (!sessions[1]?.state.ready) await nextFrame();
  await nextFrame();
  // Exclude Restty's 180 ms resize-active grace from the idle CPU interval.
  // Reveal below deliberately has no corresponding settling delay.
  await delay(300);
  const canvases = [...root.querySelectorAll("canvas")];
  const snapshot = () => canvases.map((canvas) => ({ ...calls.get(canvas) }));
  const difference = (before: ReturnType<typeof snapshot>) =>
    snapshot().map((counts, index) =>
      Object.fromEntries(
        hiddenGLMethods.map((name) => [
          name,
          (counts[name] ?? 0) - (before[index]?.[name] ?? 0),
        ]),
      ),
    );
  return {
    environment: {
      userAgent: navigator.userAgent,
      dpr: devicePixelRatio,
      visibility: document.visibilityState,
      geometry: canvases.map((canvas) => ({
        width: canvas.width,
        height: canvas.height,
      })),
    },
    async measure(output: boolean) {
      const before = snapshot();
      const start = performance.now();
      const rafBefore = canvases.map(
        (canvas) => globalThis.__hiddenRuntimeRaf?.get(canvas) ?? 0,
      );
      let frames = 0;
      let measuring = true;
      const countFrame = () => {
        frames += 1;
        if (measuring) requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);
      for (let batch = 0; batch < 60; batch += 1) {
        if (output)
          for (const session of sessions)
            session.output(`synthetic-${batch}\r\n`.repeat(20));
        await delay(25);
      }
      measuring = false;
      return {
        hidden: canvases.map(
          (canvas) => canvas.closest<HTMLElement>(".terminal-surface")!.hidden,
        ),
        elapsedMs: performance.now() - start,
        observerRafCallbacks: frames,
        runtimeRafCallbacks: canvases.map(
          (canvas, index) =>
            (globalThis.__hiddenRuntimeRaf?.get(canvas) ?? 0) -
            rafBefore[index]!,
        ),
        outputLinesPerSurface: output ? 1200 : 0,
        surfaces: difference(before),
      };
    },
    async reveal() {
      const canvas = canvases[0]!;
      const container = canvas.closest<HTMLElement>(".terminal-surface")!;
      const baseline = sessions[0]!.sizes.at(-1)!;
      const sizeCount = sessions[0]!.sizes.length;
      sessions[0]!.output(
        `\u001b[?25h\u001b[2 q\u001b[48;2;12;34;56m\u001b[2J\u001b[${baseline.rows};1Hhidden-current`,
      );
      root.style.maxWidth = "480px";
      tabs.zoom("in");
      await nextFrame();
      const hiddenSizes = sessions[0]!.sizes.slice(sizeCount);
      const before = snapshot();
      const start = performance.now();
      tabs.handleCommand({ action: "select", position: 1 });
      const result = {
        ...hiddenPresentation(canvas),
        elapsedMs: performance.now() - start,
        calls: difference(before)[0],
        baseline,
        hiddenSizes,
        revealedSize: sessions[0]!.sizes.at(-1),
        canvasWidth: canvas.width,
        expectedWidth: Math.round(
          canvas.getBoundingClientRect().width * devicePixelRatio,
        ),
        visible: !container.hidden,
        sameCanvas: canvas === container.querySelector("canvas"),
      };
      root.style.maxWidth = "";
      return result;
    },
    async ingestion() {
      tabs.handleCommand({ action: "select", position: 2 });
      const session = sessions[0]!;
      session.writes.length = 0;
      session.output("\u001bcfirst-hidden-line\r\n");
      for (let index = 0; index < 80; index += 1)
        session.output(`ordered-${index}\r\n`);
      const acked = session.output(
        "\u001b]2;hidden-title\u0007\u0007\u001b[6nlast-hidden-line",
      );
      const replies = session.writes.filter((text) =>
        /^\u001b\[\d+;\d+R$/u.test(text),
      ).length;
      tabs.handleCommand({ action: "select", position: 1 });
      tabs.clipboardAction("select-all");
      tabs.clipboardAction("copy");
      const indices = Array.from({ length: 80 }, (_, index) =>
        copied.indexOf(`ordered-${index}\n`),
      );
      const ordered = indices.every(
        (position, index) =>
          position >= 0 && (index === 0 || position > indices[index - 1]!),
      );
      return {
        acked,
        titles: [...titles],
        bells,
        replies,
        retained:
          copied.includes("first-hidden-line") &&
          copied.includes("last-hidden-line"),
        ordered,
      };
    },
    async lifecycle() {
      tabs.handleCommand({ action: "new" });
      tabs.handleCommand({ action: "select", position: 1 });
      while (!sessions[2]?.state.ready) await nextFrame();
      await nextFrame();
      const hiddenCanvas = root.querySelectorAll("canvas")[2]!;
      const mountCalls = { ...calls.get(hiddenCanvas) };
      tabs.applyConfiguration({
        appearance: { fontSize: 19, lineHeight: 1, ligatures: false },
        padding: { top: 4, right: 4, bottom: 4, left: 4 },
        scrollbackLines: 1000,
        optionKeyMode: "both",
        theme: DEFAULT_TERMINAL_THEME,
      });
      sessions[2]!.output("hidden-mount-output");
      let rapidRefreshes = 0;
      for (let index = 0; index < 8; index += 1) {
        const canvas = canvases[index % 2]!;
        const before = calls.get(canvas)?.clear ?? 0;
        tabs.handleCommand({ action: "select", position: (index % 2) + 1 });
        if ((calls.get(canvas)?.clear ?? 0) > before) rapidRefreshes += 1;
      }
      const beforeClose = { ...calls.get(hiddenCanvas) };
      const rafBeforeClose =
        globalThis.__hiddenRuntimeRaf?.get(hiddenCanvas) ?? 0;
      tabs.handleCommand({ action: "close-session", sessionId: "s3" });
      sessions[2]!.output("dead-output");
      await nextFrame();
      const afterClose = { ...calls.get(hiddenCanvas) };
      tabs.injectText("other-tab-usable");
      await nextFrame();
      const usable = sessions[1]!.writes.includes("other-tab-usable");
      tabs.handleCommand({ action: "new" });
      tabs.handleCommand({ action: "close" });
      await nextFrame();
      return {
        rapidRefreshes,
        deadRafCallbacks:
          (globalThis.__hiddenRuntimeRaf?.get(hiddenCanvas) ?? 0) -
          rafBeforeClose,
        mountCalls,
        beforeClose,
        afterClose,
        hiddenClosed: sessions[2]!.state.closed,
        pendingClosed: !sessions[3]!.state.ready && root.children.length === 2,
        usable,
      };
    },
    synchronizedReveal: () =>
      exerciseSynchronizedReveal({
        tabs,
        canvas: canvases[0]!,
        output: sessions[0]!.output,
        counts: () => ({ ...calls.get(canvases[0]!) }),
      }),
    images: () =>
      exerciseHiddenImages({
        tabs,
        canvas: canvases[0]!,
        output: sessions[0]!.output,
        counts: () => ({ ...calls.get(canvases[0]!) }),
      }),
    dispose() {
      tabs.dispose();
      strip.remove();
    },
  };
}
