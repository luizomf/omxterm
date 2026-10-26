import { vi } from "vitest";
import type { RendererLanguage } from "../../src/renderer/renderer-language";
import { createSettingsView as createSettingsDialog } from "../../src/renderer/settings/settings-dialog";
import type {
  SettingsBridge,
  SettingsChange,
  SettingsLifetime,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";

export const base: SettingsSnapshot = {
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "r1",
  text: '{\n  "version": 1\n}\n',
  values: {
    language: "en-US",
    confirmClose: true,
    logLevel: "info",
    "font.family": "",
    "font.size": 16,
    "font.lineHeight": 1,
    "font.ligatures": true,
    "theme.path": "",
    "scrollback.lines": 10_000,
    "terminal.padding.top": 0,
    "terminal.padding.right": 8,
    "terminal.padding.bottom": 8,
    "terminal.padding.left": 8,
    "window.showTitleBar": true,
    "window.showTabBar": true,
    "window.alwaysOnTop": false,
  },
};

export function installSettingsDom() {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
}

export function saved(
  snapshot: SettingsSnapshot,
  application: Extract<SettingsResult, { status: "saved" }>["application"] = {
    applied: true,
    notices: [],
  },
  lifetimes: readonly Exclude<SettingsLifetime, "live">[] = [],
): Extract<SettingsResult, { status: "saved" }> {
  return { status: "saved", snapshot, application, lifetimes };
}

export async function open(
  overrides: Partial<SettingsBridge> = {},
  language?: RendererLanguage,
) {
  const bridge: SettingsBridge = {
    snapshot: vi.fn(async () => base),
    change: vi.fn(async (change: SettingsChange) =>
      saved(
        {
          ...base,
          values: { ...base.values, [change.path]: change.value },
        },
        undefined,
        change.path.startsWith("window.")
          ? ["new-windows"]
          : change.path === "font.family"
            ? ["restart"]
            : [],
      ),
    ),
    saveText: vi.fn(async () => saved({ ...base, revision: "r2" })),
    changeKeybind: vi.fn(),
    captureShortcut: vi.fn(() => () => {}),
    onOpen: () => () => {},
    ...overrides,
  };
  const focusTerminal = vi.fn();
  const onActivityChange = vi.fn();
  const dialog = createSettingsDialog(document, bridge, {
    focusTerminal,
    onActivityChange,
    ...(language ? { language } : {}),
  });
  await dialog.open();
  const query = <Element extends HTMLElement>(selector: string) =>
    document.querySelector<Element>(selector)!;
  const field = (label: string) =>
    [...document.querySelectorAll("label")]
      .find((row) => row.textContent?.startsWith(label))!
      .querySelector<HTMLInputElement & HTMLSelectElement>("input, select")!;
  const status = () => query(".settings-status").textContent;
  const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    bridge,
    dialog,
    focusTerminal,
    onActivityChange,
    query,
    field,
    status,
    settle,
  };
}

export function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<Value>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function button(text: string): HTMLButtonElement {
  return [...document.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  )!;
}
