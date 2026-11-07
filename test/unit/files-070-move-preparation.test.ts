// @vitest-environment jsdom
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
  lstat,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activate } from "../../extensions/files/backend";
import { mountFilesPage } from "../../extensions/files/page";
import type { Value } from "../../src/extension-runtime/protocol";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let root: string | undefined;
let dispose: (() => void) | undefined;
afterEach(async () => {
  dispose?.();
  dispose = undefined;
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

// Exercise the fixture's real caller against the actual page/backend. Native
// evidence showed Enter keydown/up without keypress/submit; do not invent jsdom
// default form submission when modelling that observed event sequence.
async function setup(
  replyControl?: "wrong-source" | "wrong-folder" | "refused",
) {
  root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "files-070-prepare-")),
  );
  const source = path.join(root, "project");
  const folder = path.join(root, "conflict");
  await mkdir(source);
  await mkdir(path.join(folder, "project"), { recursive: true });
  await writeFile(path.join(source, "needle.txt"), "owned-source");
  const signal = new AbortController().signal;
  const moveNoReplace = vi.fn(async () => {});
  const backend = activate({ signal, files: { moveNoReplace } });
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const input = value as { operation: string };
    if (input.operation === "home") return { ok: true, directory: root! };
    const result = (await backend.invoke(value as Value, signal)) as Reply;
    if (input.operation !== "prepare-move-into") return result;
    if (replyControl === "refused") return { ok: false, error: "permission" };
    if (replyControl === "wrong-source")
      return { ...result, path: "/wrong-source" };
    if (replyControl === "wrong-folder")
      return { ...result, directory: "/wrong-folder" };
    return result;
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const page = mountFilesPage(document, { request });
  dispose = page.dispose;
  await page.ready;
  const row = () =>
    [...document.querySelectorAll<HTMLElement>("[role=treeitem]")].find(
      (node) => node.dataset.path === source,
    )!;
  const fixture = await readFile(
    "test/fixtures/files-070-consumer.mjs",
    "utf8",
  );
  const start = fixture.indexOf("  async function prepareMove(");
  const end = fixture.indexOf("  const original =", start);
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const evaluate = async (script: string): Promise<unknown> => {
    const execute = new Function("document", `return (${script});`) as (
      doc: Document,
    ) => unknown;
    return execute(document);
  };
  const click = async (_view: unknown, label: string) => {
    const button = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((node) => node.textContent === label && !node.closest("[hidden]"));
    expect(button, label).toBeTruthy();
    expect(button!.disabled).toBe(false);
    button!.click();
  };
  const until = async (check: () => Promise<boolean>, label: string) => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw Error(`fixture deadline: ${label}`);
  };
  const run = new Function(
    "context",
    `
    const {assert,source,focusRow,key,click,view,evaluate,until,lstat,readFile,path} = context;
    ${fixture.slice(start, end)}
    return prepareMove;
  `,
  ) as (context: unknown) => (folder: string) => Promise<void>;
  const prepare = run({
    assert,
    source,
    click,
    evaluate,
    until,
    lstat,
    readFile,
    path,
    focusRow: async () => row().focus(),
    key: (keyCode: string, modifiers: string[] = []) => {
      const active = document.activeElement!;
      for (const type of ["keydown", "keyup"])
        active.dispatchEvent(
          new KeyboardEvent(type, {
            key: keyCode,
            shiftKey: modifiers.includes("shift"),
            bubbles: true,
            cancelable: true,
          }),
        );
    },
    view: {
      insertText: async (value: string) => {
        const input = document.activeElement as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(
          new InputEvent("input", { bubbles: true, data: value }),
        );
      },
    },
  });
  return { source, folder, prepare, request, moveNoReplace };
}

// The production Files 0.7 consumer is a Linux/macOS ARM64 preview. Its page
// and tree use slash-delimited paths; a Windows-native filesystem fixture cannot
// supply a matching tree row or exercise the move-preparation control.
describe.skipIf(process.platform === "win32")(
  "Linux/macOS Files 0.7 move-preparation consumer",
  () => {
    it("submits move preparation despite key-only Enter not performing implicit submission", async () => {
      const h = await setup();
      await h.prepare(h.folder);
      expect(h.request).toHaveBeenCalledWith({
        operation: "prepare-move-into",
        path: h.source,
        kind: "directory",
        directory: h.folder,
      });
      expect(document.activeElement?.textContent).toBe("Cancel");
      expect(h.moveNoReplace).not.toHaveBeenCalled();
      expect(
        h.request.mock.calls.some(
          ([value]) =>
            (value as { operation: string }).operation === "move-into",
        ),
      ).toBe(false);
    });

    it("cancels the captured move without dispatching a mutation", async () => {
      const h = await setup();
      const original = await lstat(h.source);
      await h.prepare(h.folder);
      const cancel = [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".operation-editor button",
        ),
      ].find((button) => button.textContent === "Cancel");
      expect(cancel).toBeDefined();
      cancel!.click();
      expect(
        document.querySelector<HTMLFormElement>(".operation-editor")!.hidden,
      ).toBe(true);
      await vi.waitFor(() =>
        expect(h.request).toHaveBeenCalledWith(
          expect.objectContaining({ operation: "cancel-move" }),
        ),
      );
      expect(h.moveNoReplace).not.toHaveBeenCalled();
      expect((await lstat(h.source)).ino).toBe(original.ino);
      expect(await readFile(path.join(h.source, "needle.txt"), "utf8")).toBe(
        "owned-source",
      );
      expect(
        h.request.mock.calls.some(
          ([value]) =>
            (value as { operation: string }).operation === "move-into",
        ),
      ).toBe(false);
    });

    it.each(["wrong-source", "wrong-folder", "refused"] as const)(
      "does not bypass fixed confirmation checks after submitting: %s",
      async (control) => {
        const h = await setup(control);
        await expect(h.prepare(h.folder)).rejects.toThrow(
          "fixture deadline: fixed move confirmation",
        );
        expect(h.moveNoReplace).not.toHaveBeenCalled();
        expect(h.request).toHaveBeenCalledWith({
          operation: "prepare-move-into",
          path: h.source,
          kind: "directory",
          directory: h.folder,
        });
      },
    );
  },
);
