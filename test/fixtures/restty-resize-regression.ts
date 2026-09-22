import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalSessionHandlers } from "../../src/terminal-surface/terminal-session-adapter";

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// A reduced mode-2048 client: like Neovim, it trusts in-band notifications,
// not PTY resize callbacks, for its screen and cursor coordinates.
export async function verifyInBandResize(root: HTMLElement): Promise<void> {
  for (const trigger of ["zoom", "reload", "fullscreen-inset"] as const) {
    const container = document.createElement("main");
    container.className = "terminal-surface";
    root.replaceChildren(container);
    let handlers: TerminalSessionHandlers | undefined;
    let grid = { cols: 0, rows: 0 };
    let client = { cols: 0, rows: 0 };
    let reports = 0;
    let resizes = 0;
    let redraw: (() => void) | undefined;
    let copied = "";
    let cursor = "";
    let starts = 0;
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
        },
        write(data) {
          for (const match of data.matchAll(
            /\u001b\[48;(\d+);(\d+);(\d+);(\d+)t/gu,
          )) {
            reports += 1;
            client = { rows: Number(match[1]), cols: Number(match[2]) };
            if (client.rows !== grid.rows || client.cols !== grid.cols)
              throw new Error("Resize report arrived before Adapter resize");
            // A real TUI reacts to every geometry change, including native
            // layout changes that arrive after the first zoom frame.
            queueMicrotask(() => redraw?.());
          }
          const position = /\u001b\[(\d+);(\d+)R/u.exec(data);
          if (position) cursor = `${position[1]},${position[2]}`;
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
      for (let step = 0; step < 3; step += 1) {
        redraw = undefined;
        const priorReports = reports;
        const priorResizes = resizes;
        if (trigger === "zoom") surface.zoom("in");
        else if (trigger === "fullscreen-inset")
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
      const priorCursor = cursor;
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
      if (copied !== preserved || cursor !== priorCursor)
        throw new Error("Reload changed existing screen content or cursor");
      output("\u001b[?2048l");
      const priorReports = reports;
      surface.zoom("out");
      await frame();
      if (reports !== priorReports)
        throw new Error("Disabled resize mode emitted a notification");
    } finally {
      surface.dispose();
      container.remove();
      document.documentElement.style.setProperty("--native-title-inset", "0px");
    }
  }
}
