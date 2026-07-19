import type {
  TerminalSnippet,
  TerminalSnippetsResponse,
} from "../shared/terminal-snippets";

export interface SnippetsSidebarOptions {
  readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
  readonly inject: (snippet: TerminalSnippet) => void;
  readonly focusTerminal: () => void;
}

export interface SnippetsSidebar {
  toggle(): Promise<void>;
  isOpen(): boolean;
  dispose(): void;
}

// Per-window sidebar. snippets.json is reread on every open — plain on-demand
// read, no file watching — so edits show up by closing and reopening it.
export function createSnippetsSidebar(
  root: HTMLElement,
  options: SnippetsSidebarOptions,
): SnippetsSidebar {
  const document = root.ownerDocument;
  let disposed = false;
  let snippets: readonly TerminalSnippet[] = [];
  let openGeneration = 0;

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search snippets";
  search.setAttribute("aria-label", "Search Snippets");
  const list = document.createElement("ul");
  const empty = document.createElement("p");
  empty.className = "snippets-empty";
  const error = document.createElement("p");
  error.className = "snippets-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  root.replaceChildren(search, error, empty, list);

  const matches = (snippet: TerminalSnippet, query: string) => {
    if (query.length === 0) return true;
    const haystack =
      `${snippet.name}\n${snippet.description ?? ""}`.toLowerCase();
    return haystack.includes(query);
  };

  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    const visible = snippets.filter((snippet) => matches(snippet, query));
    list.replaceChildren(
      ...visible.map((snippet) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        const name = document.createElement("span");
        name.className = "snippet-name";
        name.textContent = snippet.name;
        button.appendChild(name);
        if (snippet.description) {
          const description = document.createElement("span");
          description.className = "snippet-description";
          description.textContent = snippet.description;
          button.appendChild(description);
        }
        button.addEventListener("click", () => {
          if (disposed) return;
          options.inject(snippet);
          options.focusTerminal();
        });
        item.appendChild(button);
        return item;
      }),
    );
    empty.hidden = error.hidden === false || visible.length > 0;
    empty.textContent =
      snippets.length === 0
        ? "No snippets. Create snippets.json next to config.json."
        : "No snippets match the search.";
  };

  const onSearchInput = () => renderList();
  search.addEventListener("input", onSearchInput);

  return {
    async toggle() {
      if (disposed) return;
      if (!root.hidden) {
        root.hidden = true;
        options.focusTerminal();
        return;
      }
      const generation = ++openGeneration;
      const response = await options.loadSnippets();
      if (disposed || generation !== openGeneration) return;
      snippets = response.snippets;
      error.hidden = response.error === undefined;
      error.textContent = response.error ?? "";
      root.hidden = false;
      renderList();
      search.focus();
    },
    isOpen() {
      return !root.hidden;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      search.removeEventListener("input", onSearchInput);
      root.replaceChildren();
      root.hidden = true;
    },
  };
}
