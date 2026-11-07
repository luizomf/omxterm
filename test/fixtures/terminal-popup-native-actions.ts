import assert from "node:assert/strict";
import type { MenuItemConstructorOptions } from "electron";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { Translator } from "../../src/shared/i18n";

// Export and Close Pane coexist. Resolve the offered localized action, never a
// positional slot that can silently become a different command.
export function popupClosePaneIndex(
  items: readonly { readonly label?: string }[],
  t: Translator["t"],
): number {
  const matches = items.flatMap((item, index) =>
    item.label === t("menu.closePane") ? [index] : [],
  );
  assert.equal(
    matches.length,
    1,
    "Expected exactly one localized Close Pane action",
  );
  return matches[0]!;
}

// Deliberate old-routing controls alter only the fixture's installed callbacks.
export function installPopupRoutingControl(
  template: MenuItemConstructorOptions[],
  control: string,
  closePane: boolean,
  application: Pick<
    TerminalApplication,
    "closeSelectedPane" | "clipboardSelectedWindow"
  >,
  t: Translator["t"],
): void {
  if (control === "close-retarget" && closePane)
    template[popupClosePaneIndex(template, t)]!.click = () => {
      void application.closeSelectedPane();
    };
  if (control === "clipboard-retarget")
    template[1]!.click = () => application.clipboardSelectedWindow("paste");
}
