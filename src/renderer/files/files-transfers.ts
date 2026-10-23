import type { TransferEvent } from "../../shared/file-browser";
import type { Translator } from "../../shared/i18n";
import { formatSize } from "./files-list";

const FINISHED_VISIBLE_MS = 5_000;

// Uploads and downloads in progress, each with a progress bar and Cancel;
// finished ones stay briefly with their outcome.
export function createTransfersView(
  document: Document,
  translator: Translator,
  cancel: (id: string) => void,
) {
  const t = translator.t.bind(translator);
  const element = document.createElement("div");
  element.className = "files-transfers";
  element.setAttribute("aria-label", t("files.transfers"));
  element.setAttribute("aria-live", "polite");
  element.hidden = true;
  const rows = new Map<string, HTMLElement>();

  const update = (event: TransferEvent) => {
    let row = rows.get(event.id);
    if (!row) {
      row = document.createElement("div");
      row.className = "files-transfer";
      const label = document.createElement("span");
      label.className = "files-transfer-label";
      const bar = document.createElement("progress");
      bar.max = 1;
      const stop = document.createElement("button");
      stop.type = "button";
      stop.className = "omx-icon-button";
      stop.textContent = "×";
      stop.title = t("common.cancel");
      stop.setAttribute("aria-label", `${t("common.cancel")}: ${event.name}`);
      stop.addEventListener("click", () => cancel(event.id));
      row.append(label, bar, stop);
      rows.set(event.id, row);
      element.append(row);
    }
    const [label, bar, stop] = row.children as unknown as [
      HTMLElement,
      HTMLProgressElement,
      HTMLButtonElement,
    ];
    const arrow = event.direction === "download" ? "↓" : "↑";
    if (event.state === "running") {
      const amount = event.total
        ? `${formatSize(event.transferred, translator)} / ${formatSize(event.total, translator)}`
        : formatSize(event.transferred, translator);
      label.textContent = `${arrow} ${event.name} · ${amount}`;
      if (event.total) bar.value = event.transferred / event.total;
      else bar.removeAttribute("value");
    } else {
      label.textContent = `${arrow} ${event.name} · ${
        event.state === "done"
          ? t("files.transferDone")
          : event.state === "cancelled"
            ? t("files.transferCancelled")
            : (event.error ?? t("files.transferFailed"))
      }`;
      row.classList.toggle("failed", event.state === "failed");
      bar.value = event.state === "done" ? 1 : 0;
      stop.hidden = true;
      const finished = row;
      document.defaultView?.setTimeout(() => {
        finished.remove();
        rows.delete(event.id);
        element.hidden = rows.size === 0;
      }, FINISHED_VISIBLE_MS);
    }
    element.hidden = false;
  };
  return { element, update };
}
