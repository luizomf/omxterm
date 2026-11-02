import { runInNewContext } from "node:vm";

export function deferredSettingsRenderer(
  phase: "navigation" | "browse",
  onBrowse: () => void,
) {
  let pending = false;
  return {
    open() {
      document.body.innerHTML = '<section class="settings-dialog"></section>';
      pending = true;
      if (phase === "browse") {
        const panel = document.createElement("section");
        panel.className = "extensions-panel";
        const browse = document.createElement("button");
        browse.textContent = "Browse official extensions";
        browse.disabled = true;
        Object.defineProperty(browse, "getClientRects", {
          value: () => [{ width: 40, height: 20 }],
        });
        browse.addEventListener("click", onBrowse);
        const catalog = document.createElement("section");
        catalog.className = "extension-catalog";
        catalog.append(browse);
        panel.append(catalog);
        document.body.append(panel);
      }
    },
    evaluate(code: string): unknown {
      const result: unknown = runInNewContext(code, { document });
      if (!pending || code.includes(".click()")) return result;
      // Resolve controlled availability after its not-ready state was observed.
      // Navigation models the Settings snapshot; disabled Browse is a generic
      // synthetic condition, not an initial-management-snapshot dependency.
      if (phase === "navigation" && code.includes("#settings-tab-extensions")) {
        const tab = document.createElement("button");
        tab.id = "settings-tab-extensions";
        tab.setAttribute("aria-selected", "false");
        Object.defineProperty(tab, "getClientRects", {
          value: () => [{ width: 40, height: 20 }],
        });
        tab.addEventListener("click", () => {
          tab.setAttribute("aria-selected", "true");
          const panel = document.createElement("section");
          panel.className = "extensions-panel";
          document.body.append(panel);
        });
        document.body.append(tab);
        pending = false;
      }
      if (phase === "browse" && code.includes("Browse official extensions")) {
        document.querySelector<HTMLButtonElement>(
          ".extensions-panel button",
        )!.disabled = false;
        pending = false;
      }
      return result;
    },
    dispose: () => document.body.replaceChildren(),
  };
}

export function catalogTestClock(
  fault: string | undefined,
  catalog: {
    browses: number;
    acquisitionSeen: boolean;
    snapshotApplied: boolean;
  },
) {
  if (
    fault !== "catalog-not-ready" &&
    fault !== "snapshot-before-action" &&
    fault !== "ambiguous-acquisition"
  )
    return undefined;
  let calls = 0;
  return () =>
    (fault === "catalog-not-ready"
      ? catalog.browses >= 2
      : fault === "ambiguous-acquisition"
        ? catalog.acquisitionSeen
        : catalog.snapshotApplied) && ++calls > 2
      ? 70000
      : 0;
}

// Minimal DOM model of a newly constructed Settings catalog; no network runs.
export function freshPublicCatalog(options: {
  browse(openCount: number, label: string): void;
  action(action: "Install" | "Reinstall"): void;
  failLoad?: boolean;
  wrongTitle?: boolean;
  missingCard?: boolean;
  snapshot?: "before-action" | "between-ready-and-click" | undefined;
  ambiguous?: boolean;
}) {
  const doc = document.implementation.createHTMLDocument("controlled catalog");
  Object.defineProperty(doc, "defaultView", { value: window });
  let opens = 0;
  let browses = 0;
  let snapshotApplied = false;
  let acquisitionSeen = false;
  const visible = (element: Element) => {
    Object.defineProperty(element, "getClientRects", {
      value: () => [{ width: 40, height: 20 }],
    });
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({ width: 40, height: 20 }),
    });
  };
  let applySnapshot = () => {};
  const open = () => {
    opens++;
    snapshotApplied = false;
    acquisitionSeen = false;
    doc.body.innerHTML = `<section class="extensions-panel"><section class="extension-catalog"><div role="status">The catalog connects only when you choose Browse or Refresh.</div><button>Browse official extensions</button><div class="extension-catalog-list"></div></section></section>`;
    const browse = doc.querySelector<HTMLButtonElement>("button")!;
    visible(browse);
    if (options.ambiguous && opens === 2) {
      const duplicate = doc.createElement("button");
      duplicate.textContent = "Refresh catalog";
      visible(duplicate);
      browse.after(duplicate);
    }
    const renderLoaded = () => {
      browse.textContent = "Refresh catalog";
      doc.querySelector('[role="status"]')!.textContent = "Catalog loaded.";
      doc.querySelector(".extension-catalog-list")!.replaceChildren();
      if (options.missingCard && opens === 2) return;
      const card = doc.createElement("section");
      card.className = "extension-catalog-card";
      card.innerHTML = `<h4>${options.wrongTitle && opens === 2 ? "Unrelated package · 0.1.0" : "Snippets — Linux, macOS and Windows ARM64 preview · 0.1.0"}</h4><button>${opens === 1 ? "Install" : "Reinstall"}</button>`;
      Object.defineProperty(card, "scrollIntoView", { value: () => {} });
      const button = card.querySelector("button")!;
      visible(button);
      button.addEventListener("click", () =>
        options.action(opens === 1 ? "Install" : "Reinstall"),
      );
      doc.querySelector(".extension-catalog-list")!.append(card);
    };
    browse.addEventListener("click", () => {
      browses++;
      options.browse(opens, browse.textContent ?? "");
      if (options.failLoad && opens === 2) return;
      renderLoaded();
    });
    applySnapshot = () => {
      snapshotApplied = true;
      renderLoaded();
    };
  };
  return {
    open,
    browse() {
      doc
        .querySelector<HTMLButtonElement>(".extension-catalog button")!
        .click();
    },
    evaluate(code: string): unknown {
      const acquisition =
        opens === 2 && code.includes("Browse official extensions");
      if (acquisition) acquisitionSeen = true;
      if (
        acquisition &&
        !snapshotApplied &&
        options.snapshot === "before-action"
      )
        applySnapshot();
      const result: unknown = runInNewContext(code, { document: doc });
      if (
        acquisition &&
        !snapshotApplied &&
        options.snapshot === "between-ready-and-click" &&
        !code.includes(".click()")
      )
        applySnapshot();
      return result;
    },
    get acquisitionSeen() {
      return acquisitionSeen;
    },
    get snapshotApplied() {
      return snapshotApplied;
    },
    get opens() {
      return opens;
    },
    get browses() {
      return browses;
    },
  };
}
