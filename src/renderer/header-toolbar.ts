import type { MessageKey, Translator } from "../shared/i18n";
import type { TerminalActionName } from "../shared/terminal-keybinds";
import type { MenuPosition } from "./tab-strip";
import { icon, type IconName } from "./ui/icons";

// Toolbar buttons that reflect a state owned elsewhere in the window.
export type HeaderToolbarToggle =
  "sessions" | "commands" | "files" | "assistant" | "broadcast";

export interface HeaderToolbarOptions {
  readonly translator: Translator;
  // Buttons run the same named actions as keyboard shortcuts: main decides
  // what each does, so the toolbar gains nothing a key press could not do.
  readonly runAction: (action: TerminalActionName) => void;
  readonly openMainMenu: (position: MenuPosition) => void;
  // Lists every tab below the button; absent hides the button.
  readonly openTabs?: (position: MenuPosition) => void;
  readonly hasCommands: boolean;
  readonly hasFiles?: boolean;
  readonly hasAssistant?: boolean;
}

export interface HeaderToolbar {
  readonly leading: HTMLElement;
  readonly trailing: HTMLElement;
  setPressed(toggle: HeaderToolbarToggle, pressed: boolean): void;
  dispose(): void;
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
    ...(options.hasFiles
      ? [action("files", "sidebar.files", "toggleFiles", "files")]
      : []),
    ...(options.hasAssistant
      ? [
          action(
            "assistant",
            "sidebar.assistant",
            "toggleAssistant",
            "assistant",
          ),
        ]
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
  const below = (element: HTMLElement) => {
    const rectangle = element.getBoundingClientRect();
    return { x: Math.round(rectangle.left), y: Math.round(rectangle.bottom) };
  };
  const tabsButton = options.openTabs
    ? button("openTabs", "toolbar.openTabs", (element) =>
        options.openTabs?.(below(element)),
      )
    : undefined;
  tabsButton?.setAttribute("aria-haspopup", "menu");
  const trailing = group(
    "toolbar.window",
    action("newTab", "action.newTab", "newTab"),
    ...(tabsButton ? [tabsButton] : []),
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
