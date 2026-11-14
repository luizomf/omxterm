import { createSnippetsView } from "../../src/renderer/snippets-sidebar.js";
import { createRendererLanguage } from "../../src/renderer/renderer-language.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
import type { TerminalSnippet } from "../../src/shared/terminal-snippets.js";
import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";
import { createSnippetCatalogClient } from "./catalog-client.js";

export interface SnippetsBridge extends AppearanceBridge {
  request(value: unknown): Promise<unknown>;
  onVisibility(listener: (visible: boolean) => void): () => void;
  onActivity(listener: (active: boolean) => void): () => void;
  onLanguage(listener: (language: SupportedLanguage) => void): () => void;
  onFocusIntent(listener: (intent: "search" | "restore") => void): () => void;
}

/** The shared view owns rows; native presentation owns activation and focus. */
export function mountSnippetsPage(document: Document, bridge: SnippetsBridge) {
  const language = createRendererLanguage();
  const catalog = createSnippetCatalogClient(bridge);
  let active = false;
  let visible = false;
  let disposed = false;
  const interactive = () => active && visible && !disposed;
  const requestInput = (snippet: TerminalSnippet) => {
    void bridge
      .request({
        operation: "terminal.semanticInput.v1",
        text: snippet.body,
        title: snippet.name,
        ...(snippet.description === undefined
          ? {}
          : { description: snippet.description }),
        intent: snippet.execute ? "run" : "insert",
        // Hosts up to 0.33.x require this field; newer hosts ignore false.
        preview: false,
      })
      .catch(() => {
        /* Retirement/unavailable input never retries or redirects. */
      });
  };
  const view = createSnippetsView(document, {
    loadSnippets: () => {
      if (!active || disposed)
        return Promise.reject(new Error("Inactive catalog"));
      return catalog.load();
    },
    isInteractive: interactive,
    language,
    inject: requestInput,
  });
  document.body.append(view.element);
  const removers = [
    mountHostedAppearance(document, bridge),
    bridge.onLanguage((next) => {
      document.documentElement.lang = next;
      language.set(next);
    }),
    bridge.onVisibility((next) => {
      visible = next;
    }),
    bridge.onActivity((next) => {
      if (disposed || next === active) return;
      active = next;
      if (active) view.activate();
      else {
        catalog.cancel();
        view.deactivate();
      }
    }),
    bridge.onFocusIntent(() => {
      if (!interactive()) return;
      view.focus();
    }),
  ];
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const remove of removers) remove();
    catalog.dispose();
    view.dispose();
    view.element.remove();
    document.defaultView?.removeEventListener("pagehide", dispose);
  };
  document.defaultView?.addEventListener("pagehide", dispose, { once: true });
  return { dispose };
}
