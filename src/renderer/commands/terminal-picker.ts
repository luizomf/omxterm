import type { Translator } from "../../shared/i18n";
import type { PaneTarget } from "../terminal-tabs";
import { checkbox } from "../ui/form";
import { openModal } from "../ui/modal";

// AshyTerm's "Run in Multiple Terminals": every terminal of the window,
// all checked; the user unchecks the ones to leave alone. Resolves the
// checked terminals, or undefined when cancelled.
export async function chooseTerminals(
  document: Document,
  translator: Translator,
  command: string,
  targets: readonly PaneTarget[],
): Promise<PaneTarget[] | undefined> {
  const t = translator.t.bind(translator);
  const body = document.createElement("div");
  body.className = "omx-form terminal-picker";
  const hint = document.createElement("p");
  hint.className = "omx-field-hint";
  hint.textContent = t("commands.chooseTerminalsHint");
  const preview = document.createElement("code");
  preview.className = "terminal-picker-command";
  preview.textContent = command;
  const all = checkbox(document, t("commands.selectAll"), true);
  all.element.classList.add("terminal-picker-all");
  const list = document.createElement("div");
  list.className = "terminal-picker-list";
  const boxes = targets.map((target) => {
    // Panes of one tab often share a title; their numbers tell them apart.
    const label =
      target.paneCount > 1
        ? t("commands.paneTarget", {
            tab: target.tabNumber,
            pane: target.paneNumber,
            title: target.paneLabel || target.tabLabel,
          })
        : t("commands.tabTarget", {
            tab: target.tabNumber,
            title: target.tabLabel,
          });
    const box = checkbox(
      document,
      target.busy ? `${label} ${t("commands.busyTarget")}` : label,
      !target.busy,
    );
    if (target.current) box.element.classList.add("current");
    list.append(box.element);
    return box.input;
  });
  body.append(hint, preview, all.element, list);

  let run: HTMLButtonElement | null = null;
  const sync = () => {
    const checked = boxes.filter((box) => box.checked).length;
    all.input.checked = checked === boxes.length;
    all.input.indeterminate = checked > 0 && checked < boxes.length;
    if (run) run.disabled = checked === 0;
  };
  all.input.addEventListener("change", () => {
    for (const box of boxes) box.checked = all.input.checked;
    sync();
  });
  list.addEventListener("change", sync);

  const opened = openModal(document, {
    title: t("commands.chooseTerminals"),
    className: "terminal-picker-dialog",
    body,
    initialFocus: all.input,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("commands.runChecked"), value: true, kind: "primary" },
    ],
  });
  run = document.querySelector<HTMLButtonElement>(
    ".terminal-picker-dialog .omx-button-primary",
  );
  sync();
  if ((await opened) !== true) return undefined;
  return targets.filter((_target, index) => boxes[index]!.checked);
}
