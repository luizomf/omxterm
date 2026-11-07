import { expect, it, vi } from "vitest";
import type { TerminalApplication } from "../../src/main/terminal-application";
import { terminalContextMenuTemplate } from "../../src/main/terminal-context-menu";
import { translatorFor, type SupportedLanguage } from "../../src/shared/i18n";
import {
  installPopupRoutingControl,
  popupClosePaneIndex,
} from "../fixtures/terminal-popup-native-actions";

function fixture(
  language: SupportedLanguage = "en-US",
  hasSelection = false,
  accelerator: string | null = "Control+Shift+K",
  closePane = true,
) {
  const application = {
    closePane: vi.fn(async () => {}),
    closeSelectedPane: vi.fn(async () => {}),
    clipboardPane: vi.fn(),
    clipboardSelectedWindow: vi.fn(),
    exportPane: vi.fn(),
  };
  const window = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: vi.fn() },
  };
  const request = {
    sessionId: "s1",
    menuId: 3,
    hasSelection,
    ...(closePane ? { closePane: true as const } : {}),
  };
  const t = translatorFor(language).t;
  const template = terminalContextMenuTemplate(
    window as never,
    application as unknown as TerminalApplication,
    request,
    accelerator,
    t,
  );
  function activate(index: number) {
    const callback = template[index]!.click;
    expect(callback).toBeTypeOf("function");
    callback!({} as never, window as never, {} as never);
  }
  return { application, window, request, t, template, activate };
}

const offers = (["en-US", "pt-BR"] as const).flatMap((language) =>
  [false, true].flatMap((hasSelection) =>
    [null, "Control+Shift+K", "Control+Alt+K"].map((accelerator) => ({
      language,
      hasSelection,
      accelerator,
    })),
  ),
);

it.each(offers)(
  "targets only Close Pane for $language selection=$hasSelection accelerator=$accelerator",
  ({ language, hasSelection, accelerator }) => {
    const f = fixture(language, hasSelection, accelerator);
    const original = f.template.map((item) => item.click);
    const index = popupClosePaneIndex(f.template, f.t);
    expect(index).toBe(7);
    expect(f.template[index]!.label).toBe(
      language === "en-US" ? "Close Pane" : "Fechar Painel",
    );
    if (accelerator === null)
      expect(f.template[index]).not.toHaveProperty("accelerator");
    else expect(f.template[index]!.accelerator).toBe(accelerator);
    expect(f.template[5]!.label).toBe(
      language === "en-US"
        ? hasSelection
          ? "Export Selection…"
          : "Export Terminal Content…"
        : hasSelection
          ? "Exportar Seleção…"
          : "Exportar Conteúdo do Terminal…",
    );
    installPopupRoutingControl(
      f.template,
      "close-retarget",
      true,
      f.application,
      f.t,
    );
    for (const [position, item] of f.template.entries())
      if (position !== index) expect(item.click).toBe(original[position]);
    f.activate(index);
    expect(f.application.closeSelectedPane).toHaveBeenCalledOnce();
    expect(f.application.closePane).not.toHaveBeenCalled();
    expect(f.application.exportPane).not.toHaveBeenCalled();
    f.activate(5);
    expect(f.application.exportPane).toHaveBeenCalledExactlyOnceWith(f.window, {
      kind: hasSelection ? "selection" : "content",
      target: { sessionId: "s1", menuId: 3 },
    });
  },
);

it.each(["none", "clipboard-retarget"])(
  "preserves source Close Pane and Export while installing %s",
  (control) => {
    const f = fixture("pt-BR", true, null);
    const original = f.template.map((item) => item.click);
    installPopupRoutingControl(f.template, control, true, f.application, f.t);
    for (const [index, item] of f.template.entries())
      if (control === "none" || index !== 1)
        expect(item.click).toBe(original[index]);
    f.activate(popupClosePaneIndex(f.template, f.t));
    expect(f.application.closePane).toHaveBeenCalledExactlyOnceWith(f.window, {
      sessionId: "s1",
      menuId: 3,
    });
    expect(f.application.closeSelectedPane).not.toHaveBeenCalled();
    f.activate(1);
    if (control === "none") {
      expect(f.application.clipboardPane).toHaveBeenCalledExactlyOnceWith(
        f.window,
        "paste",
        { sessionId: "s1", menuId: 3 },
      );
      expect(f.application.clipboardSelectedWindow).not.toHaveBeenCalled();
    } else {
      expect(
        f.application.clipboardSelectedWindow,
      ).toHaveBeenCalledExactlyOnceWith("paste");
      expect(f.application.clipboardPane).not.toHaveBeenCalled();
    }
    f.activate(5);
    expect(f.application.exportPane).toHaveBeenCalledExactlyOnceWith(f.window, {
      kind: "selection",
      target: { sessionId: "s1", menuId: 3 },
    });
  },
);

it("does not install Close Pane when it was not offered", () => {
  const f = fixture("en-US", false, null, false);
  const original = f.template.map((item) => item.click);
  installPopupRoutingControl(
    f.template,
    "close-retarget",
    false,
    f.application,
    f.t,
  );
  expect(f.template.map((item) => item.click)).toEqual(original);
  expect(() => popupClosePaneIndex(f.template, f.t)).toThrow(
    "exactly one localized Close Pane",
  );
  f.activate(5);
  expect(f.application.exportPane).toHaveBeenCalledOnce();
  expect(f.application.closeSelectedPane).not.toHaveBeenCalled();
});

it.each(["en-US", "pt-BR"] as const)(
  "rejects missing or ambiguous %s Close Pane instead of adopting another action",
  (language) => {
    const f = fixture(language);
    const close = f.template[popupClosePaneIndex(f.template, f.t)]!;
    expect(() => popupClosePaneIndex([...f.template, close], f.t)).toThrow(
      "exactly one localized Close Pane",
    );
    expect(() => popupClosePaneIndex(f.template.slice(0, 6), f.t)).toThrow(
      "exactly one localized Close Pane",
    );
    expect(() => popupClosePaneIndex([], f.t)).toThrow(
      "exactly one localized Close Pane",
    );
  },
);
