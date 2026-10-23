import type { Translator } from "../shared/i18n";

export interface BroadcastIndicator {
  show(targetCount: number): void;
  dispose(): void;
}

// A persistent pill while input is mirrored, visible even without a tab
// strip, with a one-click way to stop.
export function createBroadcastIndicator(
  document: Document,
  options: {
    readonly translator: Translator;
    readonly stop: () => void;
    readonly onChange?: (active: boolean) => void;
  },
): BroadcastIndicator {
  const element = document.createElement("div");
  element.className = "broadcast-indicator";
  element.setAttribute("role", "status");
  element.hidden = true;
  const label = document.createElement("span");
  const stop = document.createElement("button");
  stop.type = "button";
  stop.textContent = options.translator.t("broadcast.stop");
  stop.addEventListener("click", () => options.stop());
  element.append(label, stop);
  document.body.append(element);
  return {
    show(targetCount) {
      element.hidden = targetCount < 1;
      options.onChange?.(targetCount > 0);
      label.textContent =
        targetCount < 1
          ? ""
          : options.translator.t("broadcast.active", { count: targetCount });
    },
    dispose() {
      element.remove();
    },
  };
}
