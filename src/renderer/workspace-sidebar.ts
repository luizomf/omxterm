import type { MessageKey, Translator } from "../shared/i18n";

export interface WorkspacePanel {
  readonly element: HTMLElement;
  activate(): void;
  dispose(): void;
}

export interface WorkspacePanelDefinition {
  readonly id: string;
  readonly label: MessageKey;
  readonly create: () => WorkspacePanel;
}

export interface WorkspaceSidebar {
  // Shows the given panel; toggling the visible panel hides the sidebar.
  toggle(panelId: string): void;
  isOpen(): boolean;
  dispose(): void;
}

// The optional left sidebar hosting Sessions and future panels. It is hidden
// by default, and panels are created only when first opened.
export function createWorkspaceSidebar(
  root: HTMLElement,
  options: {
    readonly translator: Translator;
    readonly panels: readonly WorkspacePanelDefinition[];
    readonly focusTerminal: () => void;
    // The visible panel, or undefined once the sidebar hides.
    readonly onChange?: (panelId: string | undefined) => void;
  },
): WorkspaceSidebar {
  const document = root.ownerDocument;
  const t = options.translator.t.bind(options.translator);
  const created = new Map<string, WorkspacePanel>();
  let current: string | undefined;

  root.hidden = true;
  // Built on first open: a never-opened sidebar adds no DOM or listeners.
  let chrome:
    | {
        readonly body: HTMLElement;
        readonly tabs: ReadonlyMap<string, HTMLButtonElement>;
      }
    | undefined;
  const build = () => {
    const header = document.createElement("div");
    header.className = "workspace-sidebar-header";
    const switcher = document.createElement("div");
    switcher.className = "workspace-sidebar-tabs";
    switcher.setAttribute("role", "tablist");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "omx-icon-button";
    close.textContent = "×";
    close.title = t("sidebar.close");
    close.setAttribute("aria-label", t("sidebar.close"));
    close.addEventListener("click", () => hide());
    header.append(switcher, close);
    const body = document.createElement("div");
    body.className = "workspace-sidebar-body";
    root.replaceChildren(header, body);

    // A single panel shows a plain title; several get a tab switcher.
    if (options.panels.length < 2) {
      const title = document.createElement("h2");
      title.className = "workspace-sidebar-title";
      title.textContent = options.panels[0] ? t(options.panels[0].label) : "";
      switcher.replaceWith(title);
    }
    const tabs = new Map(
      options.panels.length < 2
        ? []
        : options.panels.map((panel) => {
            const button = document.createElement("button");
            button.type = "button";
            button.setAttribute("role", "tab");
            button.textContent = t(panel.label);
            button.addEventListener("click", () => show(panel.id));
            switcher.append(button);
            return [panel.id, button] as const;
          }),
    );

    return { body, tabs };
  };

  const show = (id: string) => {
    const definition = options.panels.find((panel) => panel.id === id);
    if (!definition) return;
    chrome ??= build();
    const { body, tabs } = chrome;
    let panel = created.get(id);
    if (!panel) {
      panel = definition.create();
      created.set(id, panel);
      body.append(panel.element);
    }
    current = id;
    for (const [panelId, item] of created) item.element.hidden = panelId !== id;
    for (const [panelId, button] of tabs)
      button.setAttribute("aria-selected", String(panelId === id));
    root.setAttribute("aria-label", t(definition.label));
    root.hidden = false;
    document.body.classList.add("workspace-sidebar-open");
    options.onChange?.(id);
    panel.activate();
  };
  const hide = () => {
    root.hidden = true;
    document.body.classList.remove("workspace-sidebar-open");
    options.onChange?.(undefined);
    options.focusTerminal();
  };
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      hide();
    }
  });

  return {
    toggle(panelId) {
      if (!root.hidden && current === panelId) hide();
      else show(panelId);
    },
    isOpen: () => !root.hidden,
    dispose() {
      for (const panel of created.values()) panel.dispose();
      created.clear();
      root.replaceChildren();
      root.hidden = true;
    },
  };
}

// Short, polite status messages for sidebar results (imports, errors).
export function createToaster(document: Document): {
  notify(message: string): void;
  dispose(): void;
} {
  // The live region is created on first use.
  let region: HTMLElement | undefined;
  return {
    notify(message) {
      if (!region) {
        region = document.createElement("div");
        region.className = "omx-toasts";
        region.setAttribute("role", "status");
        region.setAttribute("aria-live", "polite");
        document.body.append(region);
      }
      const toast = document.createElement("div");
      toast.className = "omx-toast";
      toast.textContent = message;
      region.append(toast);
      document.defaultView?.setTimeout(() => toast.remove(), 5000);
    },
    dispose() {
      region?.remove();
      region = undefined;
    },
  };
}
