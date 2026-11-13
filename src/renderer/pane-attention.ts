import type { StateMarks } from "./state-marks";
import type { TerminalPane } from "./terminal-panes";

/**
 * The "working" and "attention" State Marks of terminal panes (ADR 0053).
 *
 * Working follows the program's OSC 9;4 progress report: it shows while a
 * report is active and clears when the program clears it, when the same pane
 * asks for attention (a finished or waiting program), or when its session
 * ends. There is no timeout: agents report progress once per state change.
 * Attention is main's verdict, since main knows when the pane was seen.
 */
export function createPaneAttention(marks: Pick<StateMarks, "set">) {
  const working = new WeakSet<TerminalPane>();
  const pending = new WeakSet<TerminalPane>();
  return {
    progress(pane: TerminalPane, active: boolean) {
      if (working.has(pane) === active) return;
      if (active) working.add(pane);
      else working.delete(pane);
      marks.set(
        pane,
        "working",
        active
          ? { glyph: "working", label: (t) => t("attention.working") }
          : undefined,
      );
    },
    pending(pane: TerminalPane, value: boolean) {
      if (pending.has(pane) === value) return;
      if (value) pending.add(pane);
      else pending.delete(pane);
      marks.set(
        pane,
        "attention",
        value
          ? { glyph: "attention", label: (t) => t("attention.pending") }
          : undefined,
      );
    },
    ended(pane: TerminalPane) {
      this.progress(pane, false);
      this.pending(pane, false);
    },
  };
}
