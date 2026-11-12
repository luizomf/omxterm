import type { LayoutSaveOutcome } from "../shared/terminal-contract";
import type { StateMarks } from "./state-marks";

/**
 * Save layout has no other visible result, so success flashes one sentence
 * (ADR 0050). A failure waits for the user; the next save clears it first.
 */
export function createLayoutSaveNotice(
  marks: Pick<StateMarks, "flash" | "notify">,
) {
  let clearFailure = () => {};
  return (outcome: LayoutSaveOutcome) => {
    clearFailure();
    clearFailure = () => {};
    if (outcome === "saved") marks.flash((t) => t("layout.saved"));
    else
      clearFailure = marks.notify((t) =>
        t(outcome === "unknown" ? "layout.saveUnknown" : "layout.saveFailed"),
      );
  };
}
