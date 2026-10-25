import type {
  TerminalSnippet,
  TerminalSnippetsResponse,
} from "../shared/terminal-snippets";
import type { AuxiliaryView } from "./auxiliary-panel";
import { englishLanguage, type RendererLanguage } from "./renderer-language";

// Content/query/scroll belong to this view; visibility, focus transitions and
// resize belong to the window's auxiliary host. Reread YAML on every activation.
export function createSnippetsView(
  document: Document,
  options: {
    readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
    readonly inject: (snippet: TerminalSnippet) => void;
    // returnFocus reports whether the view could take focus back on cancel.
    readonly preview: (
      snippet: TerminalSnippet,
      returnFocus: () => boolean,
    ) => void;
    readonly isInteractive: () => boolean;
    readonly language?: RendererLanguage;
  },
): AuxiliaryView {
  const language = options.language ?? englishLanguage;
  const root = document.createElement("div");
  root.className = "snippets-view";
  let disposed = false;
  let active = false;
  let generation = 0;
  let renderGeneration = 0;
  let snippets: readonly TerminalSnippet[] = [];
  let loading = false;
  let transportFailure = false;
  let retainedScroll = 0;
  let rowLabels: ((t: RendererLanguage["t"]) => void)[] = [];
  const search = document.createElement("input");
  search.type = "search";
  const results = document.createElement("div");
  results.className = "snippets-results";
  const list = document.createElement("ul");
  const status = document.createElement("p");
  status.className = "snippets-empty";
  status.setAttribute("role", "status");
  const error = document.createElement("p");
  error.className = "snippets-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  results.append(error, status, list);
  root.append(search, results);

  const render = () => {
    const rendering = ++renderGeneration;
    rowLabels = [];
    const query = search.value.trim().toLowerCase();
    const visible = snippets.filter((snippet) =>
      `${snippet.name}\n${snippet.description ?? ""}`
        .toLowerCase()
        .includes(query),
    );
    const usable = () =>
      active &&
      !disposed &&
      !loading &&
      rendering === renderGeneration &&
      options.isInteractive();
    list.replaceChildren(
      ...visible.map((snippet) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "snippet-activate";
        const name = document.createElement("span");
        name.className = "snippet-name";
        name.textContent = snippet.name;
        button.append(name);
        if (snippet.description) {
          const description = document.createElement("span");
          description.className = "snippet-description";
          description.textContent = snippet.description;
          button.append(description);
        }
        // The default action is visible before activation: Run adds Enter.
        const intent = document.createElement("span");
        intent.className = "snippet-intent";
        button.append(intent);
        button.addEventListener("click", () => {
          if (usable()) options.inject(snippet);
        });
        const preview = document.createElement("button");
        preview.type = "button";
        preview.className = "snippet-preview-open";
        const relabel = (t: RendererLanguage["t"]) => {
          intent.textContent = t(
            snippet.execute ? "snippets.run" : "snippets.insert",
          );
          preview.textContent = t("snippets.preview");
          preview.setAttribute(
            "aria-label",
            t("snippets.previewNamed", { name: snippet.name }),
          );
        };
        rowLabels.push(relabel);
        relabel(language.t);
        const returnFocus = () => {
          if (!active || disposed || !options.isInteractive()) return false;
          const control =
            preview.isConnected && !preview.disabled ? preview : search;
          control.focus();
          return document.activeElement === control;
        };
        preview.addEventListener("click", () => {
          if (usable()) options.preview(snippet, returnFocus);
        });
        item.append(button, preview);
        return item;
      }),
    );
    status.hidden = !error.hidden || visible.length > 0;
    status.textContent = statusText(language.t);
  };
  const statusText = (t: RendererLanguage["t"]) =>
    loading
      ? t("snippets.loading")
      : snippets.length === 0
        ? t("snippets.empty")
        : t("snippets.noMatch");
  const unbindLabels = language.bind((t) => {
    search.placeholder = t("snippets.searchPlaceholder");
    search.setAttribute("aria-label", t("snippets.search"));
    status.textContent = statusText(t);
    if (transportFailure) error.textContent = t("snippets.loadError");
    for (const label of rowLabels) label(t);
  });
  const restoreScroll = () => {
    results.scrollTop = Math.min(
      retainedScroll,
      Math.max(0, results.scrollHeight - results.clientHeight),
    );
    retainedScroll = results.scrollTop;
  };
  const onInput = () => {
    if (!active || !options.isInteractive()) return;
    retainedScroll = 0;
    render();
    restoreScroll();
  };
  search.addEventListener("input", onInput);

  return {
    element: root,
    activate() {
      if (disposed) return;
      active = true;
      const activation = ++generation;
      loading = true;
      transportFailure = false;
      snippets = [];
      error.hidden = true;
      error.textContent = "";
      render();
      const settle = (response: TerminalSnippetsResponse, failed = false) => {
        if (disposed || !active || activation !== generation) return;
        loading = false;
        transportFailure = failed;
        snippets = response.error || failed ? [] : response.snippets;
        error.hidden = !failed && response.error === undefined;
        error.textContent = failed
          ? language.t("snippets.loadError")
          : (response.error ?? "");
        render();
        restoreScroll();
      };
      // Also contain a synchronous loader failure; never render raw rejection text.
      void Promise.resolve()
        .then(options.loadSnippets)
        .then(settle, () => settle({ snippets: [] }, true));
    },
    deactivate() {
      if (!active) return;
      if (!loading) retainedScroll = results.scrollTop;
      active = false;
      generation += 1;
      renderGeneration += 1;
    },
    focus() {
      if (active && options.isInteractive()) search.focus();
    },
    dispose() {
      if (disposed) return;
      active = false;
      disposed = true;
      generation += 1;
      renderGeneration += 1;
      search.removeEventListener("input", onInput);
      unbindLabels();
      rowLabels = [];
      root.replaceChildren();
    },
  };
}
