import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

interface ResizeObservation {
  readonly grid: { readonly cols: number; readonly rows: number };
  readonly client: { readonly cols: number; readonly rows: number };
  readonly cursor: string;
  readonly reports: number;
  readonly resizes: number;
}

function assertReloadPreserved(
  before: ResizeObservation,
  after: ResizeObservation,
  preserved: string,
  copied: string,
): void {
  // This compares protocol CPR, not an independent Ghostty cursor read.
  // A no-op reload must also preserve geometry and emit no resize report.
  if (
    copied !== preserved ||
    after.cursor !== before.cursor ||
    after.grid.cols !== before.grid.cols ||
    after.grid.rows !== before.grid.rows ||
    after.reports !== before.reports ||
    after.resizes !== before.resizes
  )
    throw new Error(
      `Reload changed existing screen content or cursor: ${JSON.stringify({
        before,
        after,
        preserved: preserved.slice(0, 4096),
        copied: copied.slice(0, 4096),
        lengths: [preserved.length, copied.length],
      })}`,
    );
}

// A reduced mode-2048 client: like Neovim, it trusts in-band notifications,
// not PTY resize callbacks, for its screen and cursor coordinates.
export async function verifyInBandResize(root: HTMLElement): Promise<void> {
  for (const trigger of [
    "zoom",
    "reload",
    "fullscreen-inset",
    "host-resize",
  ] as const) {
    const layoutHost = document.createElement("div");
    layoutHost.style.cssText =
      "display:flex;flex:none;width:640px;height:360px";
    const container = document.createElement("main");
    container.className = "terminal-surface";
    // Own the test's geometry, not the native window's eventual allocation.
    // Border-box sizing still lets title inset and font changes refit the grid.
    container.style.cssText = "flex:none;width:640px;height:360px";
    layoutHost.append(container);
    root.replaceChildren(layoutHost);
    let handlers: TerminalSessionHandlers | undefined;
    let grid = { cols: 0, rows: 0 };
    let client = { cols: 0, rows: 0 };
    let reports = 0;
    let resizes = 0;
    let redraw: (() => void) | undefined;
    let copied = "";
    let cursor = "";
    let starts = 0;
    let step = -1;
    const events: Array<Record<string, unknown>> = [];
    const record = (event: Record<string, unknown>) => {
      events.push(event);
      if (events.length > 16) events.shift();
    };
    const surface = await mountResttyTerminalSurface(
      container,
      {
        async start(next) {
          handlers = next;
          starts += 1;
        },
        resize(next) {
          resizes += 1;
          grid = next;
          record({ type: "resize", ...next });
        },
        write(data) {
          for (const match of data.matchAll(
            /\u001b\[48;(\d+);(\d+);(\d+);(\d+)t/gu,
          )) {
            reports += 1;
            client = { rows: Number(match[1]), cols: Number(match[2]) };
            record({ type: "report", ...client });
            if (client.rows !== grid.rows || client.cols !== grid.cols)
              throw new Error("Resize report arrived before Adapter resize");
            // A real TUI reacts to every geometry change, including native
            // layout changes that arrive after the first zoom frame.
            queueMicrotask(() => redraw?.());
          }
          const position = /\u001b\[(\d+);(\d+)R/u.exec(data);
          if (position) {
            cursor = `${position[1]},${position[2]}`;
            record({ type: "cpr", cursor });
          }
        },
        close() {},
      },
      {
        appearance: { fontSize: 16, lineHeight: 1 },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        theme: DEFAULT_TERMINAL_THEME,
        clipboard: {
          readText: async () => "",
          writeText: async (text) => {
            copied = text;
          },
          confirmPaste: async () => true,
          requestContextMenu: () => undefined,
        },
      },
    );
    try {
      await frame();
      const output = (text: string) => handlers?.onOutput(text);
      output("\u001b[?1049h\u001b[?7l\u001b[?2048h");
      for (step = 0; step < 3; step += 1) {
        redraw = undefined;
        const priorReports = reports;
        const priorResizes = resizes;
        if (trigger === "zoom") surface.zoom("in");
        else if (trigger === "host-resize") {
          // Owning geometry must not disable actual Surface layout changes.
          container.style.width = step % 2 === 0 ? "600px" : "640px";
          container.style.height = step % 2 === 0 ? "330px" : "360px";
        } else if (trigger === "fullscreen-inset")
          document.documentElement.style.setProperty(
            "--native-title-inset",
            step % 2 === 0 ? "30px" : "0px",
          );
        else
          surface.applyConfiguration({
            appearance: { fontSize: 17 + step, lineHeight: 1, ligatures: true },
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
            theme: DEFAULT_TERMINAL_THEME,
            scrollbackLines: 10_000,
            optionKeyMode: "none",
          });
        await frame();
        // No application output is supplied to flush a queued resize reply.
        if (
          reports === priorReports ||
          reports - priorReports !== resizes - priorResizes ||
          client.cols !== grid.cols ||
          client.rows !== grid.rows
        )
          throw new Error(
            `${trigger}: missing prompt resize notification: ${JSON.stringify({ client, grid, reports, priorReports, resizes, priorResizes })}`,
          );
        redraw = () => {
          // No application output may be needed to flush a resize notification.
          if (reports - priorReports !== resizes - priorResizes)
            throw new Error("A geometry change has no prompt notification");
          const rows = Array.from(
            { length: client.rows },
            (_, row) => `row-${row + 1}`,
          );
          output(
            "\u001b[2J" +
              rows.map((text, row) => `\u001b[${row + 1};1H${text}`).join(""),
          );
          // Navigation redraws only changed cells, including the right edge.
          output(
            `\u001b[${client.rows};${client.cols}HX\u001b[${client.rows - 1};2HY\u001b[6n`,
          );
        };
        redraw();
        await frame();
        surface.selectAll();
        await surface.copy();
        const screen = copied.trimEnd().split("\n");
        if (
          screen.length !== grid.rows ||
          screen[0] !== "row-1" ||
          screen[grid.rows - 2] !== `rYw-${grid.rows - 1}` ||
          screen[grid.rows - 1] !==
            `row-${grid.rows}`.padEnd(grid.cols - 1) + "X" ||
          cursor !== `${grid.rows - 1},3` ||
          starts !== 1
        )
          throw new Error(
            `${trigger}: screen/cursor corrupted after resize: ${JSON.stringify({ screen, cursor, grid, starts })}`,
          );
      }
      redraw = undefined;
      surface.selectAll();
      await surface.copy();
      const preserved = copied;
      const before = {
        grid: { ...grid },
        client: { ...client },
        cursor,
        reports,
        resizes,
      };
      // Deterministically deliver unrelated parent layout during the no-op
      // reload, as a native window-manager allocation can do after showing.
      layoutHost.style.width = "700px";
      layoutHost.style.height = "420px";
      if (
        layoutHost.getBoundingClientRect().width !== 700 ||
        layoutHost.getBoundingClientRect().height !== 420
      )
        throw new Error("Parent layout perturbation did not take effect");
      surface.applyConfiguration({
        appearance: {
          fontSize: trigger === "reload" ? 19 : 16,
          lineHeight: 1,
          ligatures: true,
        },
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        theme: DEFAULT_TERMINAL_THEME,
        scrollbackLines: 10_000,
        optionKeyMode: "none",
      });
      output("\u001b[6n");
      await frame();
      surface.selectAll();
      await surface.copy();
      assertReloadPreserved(
        before,
        { grid, client, cursor, reports, resizes },
        preserved,
        copied,
      );
      output("\u001b[?2048l");
      const priorReports = reports;
      surface.zoom("out");
      await frame();
      if (reports !== priorReports)
        throw new Error("Disabled resize mode emitted a notification");
    } catch (cause) {
      throw new Error(
        `${String(cause)}; resize evidence: ${JSON.stringify({
          trigger,
          step,
          grid,
          client,
          cursor,
          reports,
          resizes,
          starts,
          dpr: window.devicePixelRatio,
          events,
        })}`,
        { cause },
      );
    } finally {
      surface.dispose();
      layoutHost.remove();
      document.documentElement.style.setProperty("--native-title-inset", "0px");
    }
  }
}
