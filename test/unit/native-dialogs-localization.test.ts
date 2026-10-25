import { expect, it, vi } from "vitest";
import { translatorFor, type SupportedLanguage } from "../../src/shared/i18n";
import { createNativeDialogs } from "../../src/main/native-dialogs";
import type { BrowserWindow } from "electron";

const dialogs = vi.hoisted(() => ({
  showMessageBox: vi.fn(async () => ({ response: 1 })),
  showErrorBox: vi.fn(),
}));
vi.mock("electron", () => ({ dialog: dialogs }));

it("uses the current language and native owner for singular pane/plural tab close, keeping Cancel safe", async () => {
  let language: SupportedLanguage = "en-US";
  const native = createNativeDialogs(() => translatorFor(language));
  const owner = { isDestroyed: () => false } as BrowserWindow;
  for (const tag of ["en-US", "pt-BR"] as const) {
    language = tag;
    const { t } = translatorFor(tag);
    expect(await native.confirmClosePane(owner)).toBe(false);
    expect(dialogs.showMessageBox).toHaveBeenLastCalledWith(owner, {
      type: "question",
      title: t("dialog.closePane.title"),
      message: t("dialog.closePane.message"),
      detail: t("dialog.closePane.detail"),
      buttons: [t("common.close"), t("common.cancel")],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
    expect(await native.confirmCloseTab(owner)).toBe(false);
    expect(dialogs.showMessageBox).toHaveBeenLastCalledWith(
      owner,
      expect.objectContaining({
        detail:
          tag === "en-US"
            ? "All of its Live Terminal Sessions will end."
            : "Todas as sessões de terminal dela serão encerradas.",
        defaultId: 1,
        cancelId: 1,
      }),
    );
  }
  dialogs.showMessageBox.mockResolvedValueOnce({ response: 0 });
  expect(await native.confirmClosePane(owner)).toBe(true);
});
