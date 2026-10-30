// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

// Execute the actual observer helpers, never import Electron or run a native fixture.
async function helpers(file: string) {
  const source = await readFile(`test/fixtures/${file}`, "utf8");
  const extract = (start: string, end: string) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    return source.slice(from, to);
  };
  const until = async (check: () => Promise<boolean>) => {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw Error("fixture predicate did not settle");
  };
  const applyEnd = file.endsWith("mjs")
    ? '  app.once("will-quit"'
    : "  window.focus();";
  const create = new Function(
    "path",
    "until",
    `${extract("  function click(", "  const hosted")}
     ${extract("  async function filesAction(", "  function entryQuery(")}
     ${extract("  function entryQuery(", file.endsWith("mjs") ? "  async function terminal(" : "  async function select(")}
     ${extract("  async function apply(", applyEnd)}
     return { filesAction, entryQuery, apply };`,
  ) as (
    paths: typeof path,
    wait: typeof until,
  ) => {
    filesAction(contents: typeof view, label: string): Promise<void>;
    entryQuery(directory: string, name: string): string;
    apply(
      contents: typeof view,
      value: string,
      outcome?: string,
    ): Promise<void>;
  };
  return create(path, until);
}
it.each([
  "settled",
  "backend-live",
  "view-live",
  "extra-view",
  "panel-visible",
])(
  "source backend-loss oracle requires actual companion retirement: %s",
  async (state) => {
    const source = await readFile("test/fixtures/files-production.mjs", "utf8");
    const start = source.indexOf("    // Backend loss revokes");
    const end = source.indexOf(
      "    assert.equal(core.getOSProcessId(), coreRenderer);",
      start,
    );
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const assertion = await import("node:assert/strict");
    let killed = false;
    const child = {
      child: {
        kill: (signal: string) => {
          expect(signal).toBe("SIGKILL");
          killed = true;
          return true;
        },
      },
      get closed() {
        return killed && state !== "backend-live";
      },
      exit: { code: null, signal: "SIGKILL" },
    };
    // No executeJavaScript/forcefullyCrashRenderer methods: a retired view must
    // never be used for either. These are controlled lifecycle predicates only.
    const retiredView = { isDestroyed: () => killed && state !== "view-live" };
    const run = new Function(
      "assert",
      "children",
      "core",
      "view",
      "hosted",
      "until",
      "js",
      `return (async () => { ${source.slice(start, end)} })();`,
    ) as (...args: unknown[]) => Promise<void>;
    const result = run(
      assertion.default,
      [child],
      { getOSProcessId: () => 42 },
      retiredView,
      () => (state === "extra-view" ? [{}] : []),
      async (check: () => boolean | Promise<boolean>) => {
        expect(await check()).toBe(true);
      },
      async () => state !== "panel-visible",
    );
    if (state === "settled") await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow();
  },
);

it.each(["retained", "duplicate", "replaced", "hidden", "wrong-focus"])(
  "source companion oracle enforces identity, visibility and native focus: %s",
  async (state) => {
    const source = await readFile("test/fixtures/files-production.mjs", "utf8");
    const start = source.indexOf("  async function panel(");
    const end = source.indexOf("  async function reopen(", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const assertion = await import("node:assert/strict");
    const retained = {
      isDestroyed: () => false,
      isFocused: () => state !== "wrong-focus",
    };
    const sameTerminal = vi.fn();
    const create = new Function(
      "assert",
      "window",
      "core",
      "hosted",
      "until",
      "js",
      "sameTerminal",
      `${source.slice(start, end)} return panel;`,
    ) as (
      ...args: unknown[]
    ) => (view: unknown, visible: boolean, focus: string) => Promise<void>;
    const panel = create(
      assertion.default,
      {
        contentView: {
          children: [
            { webContents: retained, getVisible: () => state !== "hidden" },
          ],
        },
      },
      { isFocused: () => state === "wrong-focus" },
      () =>
        state === "duplicate"
          ? [retained, {}]
          : state === "replaced"
            ? [{}]
            : [retained],
      async (check: () => Promise<boolean>) => {
        expect(await check()).toBe(true);
      },
      async () => true,
      sameTerminal,
    );
    if (state === "retained") {
      await expect(panel(retained, true, "child")).resolves.toBeUndefined();
      expect(sameTerminal).toHaveBeenCalledOnce();
    } else await expect(panel(retained, true, "child")).rejects.toThrow();
  },
);

it.each([true, false])(
  "source continuity accounts for explicit Settings selection: terminal=%s",
  async (selected) => {
    const source = await readFile("test/fixtures/files-production.mjs", "utf8");
    const start = source.indexOf("  async function sameTerminal(");
    const end = source.indexOf("  async function panel(", start);
    const assertion = await import("node:assert/strict");
    document.body.innerHTML = `<div id="tab-strip">${selected ? "" : '<button role="tab">Terminal</button><button role="tab">Settings</button>'}</div><div class="terminal-surface"><canvas></canvas></div>`;
    const canvas = document.querySelector("canvas")!;
    canvas.getBoundingClientRect = () =>
      ({ width: selected ? 200 : 0 }) as DOMRect;
    const environment = { __filesOriginalCanvas: canvas };
    const js = async (script: string) =>
      new Function("document", "window", `return (${script});`)(
        document,
        environment,
      ) as unknown;
    const create = new Function(
      "assert",
      "ptys",
      "js",
      `${source.slice(start, end)} return sameTerminal;`,
    ) as (...args: unknown[]) => (selected: boolean) => Promise<void>;
    const check = create(assertion.default, [{ exited: false }], js);
    await expect(check(selected)).resolves.toBeUndefined();
    await expect(check(!selected)).rejects.toThrow();
  },
);

const evaluate = (script: string): unknown => {
  const run = new Function("document", `return (${script})`) as (
    document: Document,
  ) => unknown;
  return run(document);
};
const view = {
  executeJavaScript: async (script: string) => {
    // apply submits two statements rather than a single expression.
    if (
      script.startsWith(
        "document.querySelector('.operation-editor input').value",
      )
    ) {
      const run = new Function("document", script) as (
        document: Document,
      ) => unknown;
      return run(document);
    }
    return evaluate(script);
  },
};
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
});

describe.each(["files-production.mjs", "files-packaged.cjs"])(
  "%s DOM capabilities",
  (file) => {
    it("uses the actual tree menu, exact paths, captured rename and settled mutation notices", async () => {
      const fixture = await helpers(file);
      const requests: Record<string, string>[] = [];
      let names = ["source.txt.bak", "source.txt", "conflict.txt"];
      const page = mountFilesPage(document, {
        request: async (value) => {
          const request = value as Record<string, string>;
          requests.push(request);
          if (request.operation === "home")
            return { ok: true, directory: "/owned" };
          if (request.operation === "list")
            return {
              ok: true,
              directory: "/owned",
              rows: names.map((name) => ({ name, kind: "file", size: 1 })),
            };
          if (
            request.operation === "move" &&
            request.destination === "/owned/conflict.txt"
          )
            return { ok: false, error: "conflict" };
          if (request.operation === "create-file") names.push("created.txt");
          if (request.operation === "move")
            names = names.map((name) =>
              name === "source.txt" ? "moved.txt" : name,
            );
          return { ok: true };
        },
      });
      dispose = page.dispose;
      await page.ready;
      await fixture.filesAction(view, "New file");
      await fixture.apply(view, "created.txt");
      expect(
        evaluate(fixture.entryQuery("/owned", "created.txt")),
      ).not.toBeNull();
      const selected = evaluate(
        fixture.entryQuery("/owned", "source.txt"),
      ) as HTMLElement;
      expect(selected.dataset.path).toBe("/owned/source.txt");
      expect(
        evaluate(fixture.entryQuery("/elsewhere", "source.txt")),
      ).toBeNull();
      selected.click();
      await fixture.filesAction(view, "Rename / move");
      await fixture.apply(view, "/owned/conflict.txt", "conflict");
      await fixture.filesAction(view, "Rename / move");
      await fixture.apply(view, "/owned/moved.txt");
      expect(
        requests.filter((request) => request.operation === "move"),
      ).toEqual([
        {
          operation: "move",
          path: "/owned/source.txt",
          destination: "/owned/conflict.txt",
        },
        {
          operation: "move",
          path: "/owned/source.txt",
          destination: "/owned/moved.txt",
        },
      ]);
      expect(
        evaluate(fixture.entryQuery("/owned", "source.txt")),
      ).toBeUndefined();
      expect(evaluate(fixture.entryQuery("/owned", "moved.txt"))).toBeTruthy();
    });

    it("keeps exact legacy row text and visible flat actions; rejects unavailable actions", async () => {
      const fixture = await helpers(file);
      document.body.innerHTML = `<input aria-label="Directory" value="/owned"><p class="summary">3 entries</p>
      <div class="entries" role="list"><button class="file-row"><span>source.txt.bak</span><span>file</span></button><button class="file-row"><span>source.txt</span><span>file</span><span>1 B</span></button></div>
      <div class="operations"><button>New file</button></div><form class="operation-editor"></form>`;
      const invoked = vi.fn();
      const button =
        document.querySelector<HTMLButtonElement>(".operations button")!;
      button.onclick = invoked;
      await fixture.filesAction(view, "New file");
      expect(invoked).toHaveBeenCalledOnce();
      expect(evaluate(fixture.entryQuery("/owned", "source.txt"))).toBe(
        document.querySelectorAll(".file-row")[1],
      );
      button.disabled = true;
      await expect(fixture.filesAction(view, "New file")).rejects.toThrow();
      expect(invoked).toHaveBeenCalledOnce();
    });

    it.each([
      "Operation completed. Refresh to see the current directory.",
      "Operation not completed: conflict. Refresh to inspect current state.",
    ])("waits for legacy completion: %s", async (notice) => {
      const fixture = await helpers(file);
      document.body.innerHTML = `<div class="operations"></div><form class="operation-editor"><input></form><div role="status"></div>`;
      const editor = document.querySelector<HTMLFormElement>("form")!;
      editor.onsubmit = (event) => {
        event.preventDefault();
        editor.inert = true;
        document.querySelector("[role=status]")!.textContent =
          "Operation in progress…";
        setTimeout(() => {
          editor.inert = false;
          document.querySelector("[role=status]")!.textContent = notice;
        }, 0);
      };
      await fixture.apply(
        view,
        "name",
        notice.includes("conflict") ? "conflict" : "success",
      );
      expect(editor.inert).toBe(false);
      expect(document.querySelector("[role=status]")!.textContent).toBe(notice);
    });
  },
);
