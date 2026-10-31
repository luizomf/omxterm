// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { afterEach, expect, it } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function readiness(fixture: string) {
  const source = await readFile(`test/fixtures/${fixture}`, "utf8");
  if (fixture === "companion-combined.cjs") {
    const start = source.indexOf("  const a = await openTool(");
    const end = source.indexOf("  await a.executeJavaScript", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const open = new Function(
      "openTool",
      `return (async () => { ${source.slice(start, end)} return a; })()`,
    ) as (
      openTool: (label: string, predicate: string) => string,
    ) => Promise<string>;
    return open((_label, predicate) => predicate);
  }
  const start = source.indexOf("  const spec =");
  const end = source.indexOf("  const accelerator =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  type Tool = { selector: string; ready?: string };
  const getSpec = new Function(
    `${source.slice(start, end)} return spec;`,
  ) as () => { files: Tool };
  const spec = getSpec();
  // Read the actual openFresh expression as well as its tool definition.
  const from = source.indexOf(
    "    await until(",
    source.indexOf("    const view = fresh[0];"),
  );
  const to = source.indexOf("    await visible(view);", from);
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  let predicate = "";
  const wait = new Function(
    "tool",
    "view",
    "until",
    `return (async () => { ${source.slice(from, to)} })()`,
  ) as (
    tool: Tool,
    view: { executeJavaScript(script: string): Promise<boolean> },
    until: (check: () => Promise<boolean>) => Promise<boolean>,
  ) => Promise<void>;
  await wait(
    spec.files,
    {
      executeJavaScript: async (script: string) => {
        predicate = script;
        return true;
      },
    },
    async (check: () => Promise<boolean>) => check(),
  );
  return predicate;
}

for (const fixture of ["companion-combined.cjs", "companion-shortcuts.cjs"]) {
  it.each([true, false])(
    `${fixture} admits drafts only after successful initial navigation (success=%s)`,
    async (success) => {
      const predicate = await readiness(fixture);
      const evaluate = new Function("document", `return (${predicate});`) as (
        document: Document,
      ) => boolean;
      const ready = () => evaluate(document);
      const home = deferred<Reply>();
      const listing = deferred<Reply>();
      const listStarted = deferred<void>();
      let visibility!: (visible: boolean) => void;
      const page = mountFilesPage(document, {
        request: async (value) => {
          if ((value as { operation: string }).operation === "home")
            return home.promise;
          listStarted.resolve();
          return listing.promise;
        },
        onVisibility(listener) {
          visibility = listener;
          return () => {};
        },
      });
      dispose = page.dispose;
      const field = document.querySelector<HTMLInputElement>(
        "form.location input",
      )!;
      expect(field).not.toBeNull();
      expect(ready(), "field existence is not Home readiness").toBe(false);
      home.resolve({ ok: true, directory: "/fixture" });
      await listStarted.promise;
      expect(ready(), "pending listing cannot admit a retained draft").toBe(
        false,
      );
      listing.resolve(
        success
          ? { ok: true, directory: "/fixture", rows: [], total: 0 }
          : { ok: false, error: "unavailable" },
      );
      await page.ready;
      expect(ready()).toBe(success);
      if (!success) return;
      field.value = "retained-A";
      visibility(false);
      visibility(true);
      expect(document.querySelector("form.location input")).toBe(field);
      expect(field.value).toBe("retained-A");
    },
  );
}

it("reproduces early fixture draft overwrite without any host lifecycle transition", async () => {
  const home = deferred<Reply>();
  const page = mountFilesPage(document, {
    request: async (value) =>
      (value as { operation: string }).operation === "home"
        ? home.promise
        : { ok: true, directory: "/fixture", rows: [], total: 0 },
  });
  dispose = page.dispose;
  const field = document.querySelector<HTMLInputElement>(
    "form.location input",
  )!;
  field.value = "retained-A";
  home.resolve({ ok: true, directory: "/fixture" });
  await page.ready;
  expect(document.querySelector("form.location input")).toBe(field);
  expect(field.value).toBe("/fixture");
});
