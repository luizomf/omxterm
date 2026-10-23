import type { MessageKey, Translator } from "../shared/i18n";
import type { TerminalActionName } from "../shared/terminal-keybinds";
import type { MenuPosition } from "./tab-strip";

// Toolbar buttons that reflect a state owned elsewhere in the window.
export type HeaderToolbarToggle = "sessions" | "commands" | "broadcast";

export interface HeaderToolbarOptions {
  readonly translator: Translator;
  // Buttons run the same named actions as keyboard shortcuts: main decides
  // what each does, so the toolbar gains nothing a key press could not do.
  readonly runAction: (action: TerminalActionName) => void;
  readonly openMainMenu: (position: MenuPosition) => void;
  readonly hasCommands: boolean;
}

export interface HeaderToolbar {
  readonly leading: HTMLElement;
  readonly trailing: HTMLElement;
  setPressed(toggle: HeaderToolbarToggle, pressed: boolean): void;
  dispose(): void;
}

// 24-unit stroke icons drawn for OMXTerm; one path string per stroke.
const ICONS = {
  sessions: [
    "M4 5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    "M4 15a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    "M8 7h.01",
    "M8 17h.01",
  ],
  commands: ["M5 17l5-5-5-5", "M12 18h7"],
  find: ["M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z", "M20 20l-4-4"],
  splitRight: ["M4 5h16v14H4z", "M12 5v14"],
  splitDown: ["M4 5h16v14H4z", "M4 12h16"],
  broadcast: [
    "M12 12h.01",
    "M8.5 8.5a5 5 0 0 0 0 7",
    "M15.5 8.5a5 5 0 0 1 0 7",
    "M5.6 5.6a9 9 0 0 0 0 12.8",
    "M18.4 5.6a9 9 0 0 1 0 12.8",
  ],
  newTab: ["M12 5v14", "M5 12h14"],
  menu: ["M4 7h16", "M4 12h16", "M4 17h16"],
} as const;

type IconName = keyof typeof ICONS;

function icon(document: Document, name: IconName): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  for (const data of ICONS[name]) {
    const path = document.createElementNS(namespace, "path");
    path.setAttribute("d", data);
    svg.append(path);
  }
  return svg;
}

// The AshyTerm-style header controls: panels and terminal actions before
// the title, a new-tab button and the main menu after it.
export function createHeaderToolbar(
  document: Document,
  options: HeaderToolbarOptions,
): HeaderToolbar {
  const t = (key: MessageKey) => options.translator.t(key);
  let disposed = false;
  const toggles = new Map<HeaderToolbarToggle, HTMLButtonElement>();
  const button = (
    name: IconName,
    label: MessageKey,
    activate: (element: HTMLButtonElement) => void,
  ) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "header-toolbar-button";
    element.title = t(label);
    element.setAttribute("aria-label", t(label));
    element.append(icon(document, name));
    // Pointer clicks keep the terminal focused, like the window controls.
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", () => {
      if (!disposed) activate(element);
    });
    return element;
  };
  const action = (
    name: IconName,
    label: MessageKey,
    actionName: TerminalActionName,
    toggle?: HeaderToolbarToggle,
  ) => {
    const element = button(name, label, () => options.runAction(actionName));
    if (toggle) {
      element.setAttribute("aria-pressed", "false");
      toggles.set(toggle, element);
    }
    return element;
  };
  const group = (label: MessageKey, ...buttons: HTMLElement[]) => {
    const element = document.createElement("div");
    element.className = "header-toolbar-group";
    element.setAttribute("role", "toolbar");
    element.setAttribute("aria-label", t(label));
    element.append(...buttons);
    return element;
  };

  const leading = group(
    "toolbar.panels",
    action("sessions", "sidebar.sessions", "toggleSessions", "sessions"),
    ...(options.hasCommands
      ? [action("commands", "sidebar.commands", "toggleCommands", "commands")]
      : []),
    action("find", "action.find", "find"),
    separator(document),
    action("splitRight", "action.splitRight", "splitRight"),
    action("splitDown", "action.splitDown", "splitDown"),
    action(
      "broadcast",
      "action.toggleBroadcast",
      "toggleBroadcast",
      "broadcast",
    ),
  );
  const menu = button("menu", "toolbar.mainMenu", (element) => {
    const rectangle = element.getBoundingClientRect();
    options.openMainMenu({
      x: Math.round(rectangle.left),
      y: Math.round(rectangle.bottom),
    });
  });
  menu.setAttribute("aria-haspopup", "menu");
  const trailing = group(
    "toolbar.window",
    action("newTab", "action.newTab", "newTab"),
    menu,
  );

  return {
    leading,
    trailing,
    setPressed(toggle, pressed) {
      toggles.get(toggle)?.setAttribute("aria-pressed", String(pressed));
    },
    dispose() {
      disposed = true;
      leading.remove();
      trailing.remove();
    },
  };
}

function separator(document: Document): HTMLElement {
  const element = document.createElement("span");
  element.className = "header-toolbar-separator";
  element.setAttribute("aria-hidden", "true");
  return element;
}
