import { runInNewContext } from "node:vm";

// Minimal DOM model of a newly constructed Settings catalog; no network runs.
export function freshPublicCatalog(options: {
  browse(openCount: number): void;
  action(action: "Install" | "Reinstall"): void;
  failLoad?: boolean;
  wrongTitle?: boolean;
  missingCard?: boolean;
}) {
  const doc = document.implementation.createHTMLDocument("controlled catalog");
  Object.defineProperty(doc, "defaultView", { value: window });
  let opens = 0;
  let browses = 0;
  const visible = (element: Element) => {
    Object.defineProperty(element, "getClientRects", {
      value: () => [{ width: 40, height: 20 }],
    });
    Object.defineProperty(element, "getBoundingClientRect", {
      value: () => ({ width: 40, height: 20 }),
    });
  };
  const open = () => {
    opens++;
    doc.body.innerHTML = `<section class="extensions-panel"><section class="extension-catalog"><div role="status">The catalog connects only when you choose Browse or Refresh.</div><button>Browse official extensions</button><div class="extension-catalog-list"></div></section></section>`;
    const browse = doc.querySelector<HTMLButtonElement>("button")!;
    visible(browse);
    browse.addEventListener("click", () => {
      browses++;
      options.browse(opens);
      if (options.failLoad && opens === 2) return;
      browse.textContent = "Refresh catalog";
      doc.querySelector('[role="status"]')!.textContent = "Catalog loaded.";
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
    });
  };
  return {
    open,
    browse() {
      doc
        .querySelector<HTMLButtonElement>(".extension-catalog button")!
        .click();
    },
    evaluate(code: string): unknown {
      return runInNewContext(code, { document: doc });
    },
    get opens() {
      return opens;
    },
    get browses() {
      return browses;
    },
  };
}
