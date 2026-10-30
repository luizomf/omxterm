import {
  createApplicationPage,
  createPageButton,
  setPageNotice,
} from "../../src/renderer/application-page.js";

import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";

type Reply = {
  ok: boolean;
  error?: string;
  directory?: string;
  path?: string;
  token?: string;
  cursor?: string | null;
  total?: number;
  truncated?: boolean;
  rows?: { name: string; kind: string; size: number }[];
};
const bridge = (
  window as unknown as {
    omxHostedContent: AppearanceBridge & {
      request(value: unknown): Promise<Reply>;
    };
  }
).omxHostedContent;
mountHostedAppearance(document, bridge);
const title = document.createElement("div");
const heading = document.createElement("h1");
heading.textContent = "Files";
const subtitle = document.createElement("p");
subtitle.textContent = "Local files";
title.append(heading, subtitle);
const notice = document.createElement("div");
notice.setAttribute("role", "status");
notice.setAttribute("aria-live", "polite");
const content = document.createElement("section");
const toolbar = document.createElement("div");
toolbar.className = "toolbar";
const location = document.createElement("form");
location.className = "location";
const address = document.createElement("input");
address.setAttribute("aria-label", "Directory");
address.spellcheck = false;
const entries = document.createElement("div");
entries.className = "entries";
entries.setAttribute("role", "list");
const status = document.createElement("p");
status.className = "summary";
const operations = document.createElement("div");
operations.className = "operations";
const editor = document.createElement("form");
editor.className = "operation-editor";
editor.hidden = true;
let directory = "";
let revision = 0;
let selected: { path: string; kind: string } | undefined;
let mutationPending = false;
let confirmation: string | undefined;
let editorRevision = 0;
function discardConfirmation() {
  editorRevision++;
  if (confirmation)
    void request({ operation: "cancel-delete", token: confirmation });
  confirmation = undefined;
}
const message = (
  text: string,
  severity: "info" | "success" | "warning" | "error" = "info",
) => setPageNotice(notice, { text, severity });
function button(
  label: string,
  action: () => void,
  parent: HTMLElement = toolbar,
) {
  const element = createPageButton(document);
  element.textContent = label;
  element.addEventListener("click", action);
  parent.append(element);
  return element;
}
async function request(value: unknown): Promise<Reply> {
  try {
    return await bridge.request(value);
  } catch {
    return { ok: false, error: "outcome-unknown" };
  }
}
function report(reply: Reply) {
  message(
    reply.error === "outcome-unknown"
      ? "Outcome unknown. Do not repeat the operation automatically. Refresh to inspect the directory."
      : `Operation not completed: ${reply.error ?? "failed"}. Refresh to inspect current state.`,
    "error",
  );
}
const join = (base: string, name: string) =>
  `${base.replace(/\/$/, "")}/${name}`;
async function navigate(target: string) {
  const current = ++revision;
  selected = undefined;
  entries.replaceChildren();
  status.textContent = "Reading directory…";
  let reply = await request({ operation: "list", path: target });
  if (current !== revision) {
    if (reply.cursor)
      void request({ operation: "list-close", cursor: reply.cursor });
    return;
  }
  if (!reply.ok || !reply.directory) {
    report(reply);
    status.textContent = "Directory unavailable";
    return;
  }
  directory = reply.directory;
  address.value = directory;
  let count = 0;
  const truncated = reply.truncated;
  while (true) {
    for (const item of reply.rows ?? []) {
      const captured = { path: join(directory, item.name), kind: item.kind };
      const row = createPageButton(document, "text");
      row.classList.add("file-row");
      row.setAttribute("role", "listitem");
      const name = document.createElement("span");
      name.textContent = item.name;
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = item.kind === "link" ? "Symbolic link" : item.kind;
      const size = document.createElement("span");
      size.className = "size";
      size.textContent =
        item.kind === "file" ? `${item.size.toLocaleString()} B` : "—";
      row.append(name, kind, size);
      row.addEventListener("click", () => {
        for (const old of entries.querySelectorAll("[aria-pressed=true]"))
          old.setAttribute("aria-pressed", "false");
        selected = captured;
        row.setAttribute("aria-pressed", "true");
      });
      row.addEventListener("dblclick", () => {
        if (captured.kind === "directory") void navigate(captured.path);
      });
      entries.append(row);
      count++;
    }
    if (!reply.cursor) break;
    const cursor = reply.cursor;
    reply = await request({ operation: "list-next", cursor });
    if (current !== revision) {
      void request({ operation: "list-close", cursor });
      return;
    }
    if (!reply.ok) {
      report(reply);
      break;
    }
  }
  status.textContent = `${count.toLocaleString()} entries${truncated ? " · Truncated at 5,000; refine the directory" : ""}. Double-click a folder to open it.`;
}
async function mutate(value: unknown) {
  if (mutationPending) return;
  mutationPending = true;
  editor.inert = true;
  operations.inert = true;
  message("Operation in progress…");
  try {
    const reply = await request(value);
    if (reply.ok) {
      message(
        "Operation completed. Refresh to see the current directory.",
        "success",
      );
      editor.hidden = true;
    } else report(reply);
  } finally {
    mutationPending = false;
    editor.inert = false;
    operations.inert = false;
  }
}
function form(label: string, initial: string, submit: (value: string) => void) {
  discardConfirmation();
  editor.replaceChildren();
  editor.hidden = false;
  const text = document.createElement("label");
  text.textContent = label;
  const input = document.createElement("input");
  input.value = initial;
  input.required = true;
  input.spellcheck = false;
  text.append(input);
  editor.append(text);
  const save = createPageButton(document, "primary");
  save.type = "submit";
  save.textContent = "Apply";
  editor.append(save);
  button(
    "Cancel",
    () => {
      editor.hidden = true;
    },
    editor,
  );
  editor.onsubmit = (event) => {
    event.preventDefault();
    submit(input.value);
  };
  input.focus();
  input.select();
}
function creation(operation: string) {
  if (!directory) return;
  const captured = directory;
  form(`Create in ${captured}`, "", (name) => {
    if (
      !name ||
      name === "." ||
      name === ".." ||
      name.includes("/") ||
      name.includes("\0")
    ) {
      message("Enter one file or folder name.", "warning");
      return;
    }
    void mutate({ operation, path: join(captured, name) });
  });
}
button("Home", () => {
  void request({ operation: "home" }).then((reply) => {
    if (reply.directory) void navigate(reply.directory);
    else report(reply);
  });
});
button("Up", () => {
  if (directory)
    void navigate(directory.slice(0, directory.lastIndexOf("/")) || "/");
});
button("Refresh", () => {
  if (directory) void navigate(directory);
});
button("Use terminal directory", () => {
  void request({ operation: "terminal-directory" }).then((reply) => {
    if (reply.directory) {
      message(
        "Using the captured last-reported local OSC 7 directory; this is not process inspection.",
      );
      void navigate(reply.directory);
    } else
      message(
        "No local directory was reported by the captured terminal.",
        "warning",
      );
  });
});
button(
  "Open directory",
  () => {
    if (selected?.kind === "directory") void navigate(selected.path);
  },
  operations,
);
button("New file", () => creation("create-file"), operations);
button("New folder", () => creation("create-directory"), operations);
button(
  "Rename / move",
  () => {
    if (!selected) {
      message("Select an entry first.", "warning");
      return;
    }
    const captured = selected.path;
    form(
      `Move ${captured} to (absolute destination; never overwrite)`,
      captured,
      (destination) => {
        void mutate({ operation: "move", path: captured, destination });
      },
    );
  },
  operations,
);
button(
  "Move to Trash",
  () => {
    if (!selected) {
      message("Select an entry first.", "warning");
      return;
    }
    void mutate({ operation: "trash", path: selected.path });
  },
  operations,
);
button(
  "Delete permanently…",
  () => {
    if (!selected || mutationPending) return;
    const captured = selected.path;
    discardConfirmation();
    const capturedEditor = editorRevision;
    void request({ operation: "prepare-delete", path: captured }).then(
      (reply) => {
        if (!reply.ok || !reply.token) {
          report(reply);
          return;
        }
        if (capturedEditor !== editorRevision) {
          void request({ operation: "cancel-delete", token: reply.token });
          return;
        }
        confirmation = reply.token;
        editor.replaceChildren();
        editor.hidden = false;
        const warning = document.createElement("p");
        warning.textContent = `Permanently delete ${reply.path}? This cannot be undone. Folders include their contents; symbolic links are removed without deleting their targets.`;
        editor.append(warning);
        button(
          "Delete permanently",
          () => {
            confirmation = undefined;
            void mutate({ operation: "delete", token: reply.token });
          },
          editor,
        );
        button(
          "Cancel",
          () => {
            discardConfirmation();
            editor.hidden = true;
          },
          editor,
        );
        editor.onsubmit = (event) => event.preventDefault();
      },
    );
  },
  operations,
);
const go = createPageButton(document);
go.type = "submit";
go.textContent = "Go";
location.append(address, go);
location.addEventListener("submit", (event) => {
  event.preventDefault();
  void navigate(address.value);
});
content.append(toolbar, location, operations, editor, entries);
document.body.append(
  createApplicationPage(document, { title, notice, content, status }),
);
void request({ operation: "home" }).then((reply) => {
  if (reply.directory) void navigate(reply.directory);
  else report(reply);
});
