// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import { createAuxiliaryPanel } from "../../src/renderer/auxiliary-panel";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("shows a tool's icon, or the first letter of its name, and never the name itself", () => {
  const language = createRendererLanguage("en-US");
  const content = document.createElement("div");
  const root = document.createElement("aside");
  content.append(root);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockImplementation(
    () => ({ width: 1000 }) as DOMRect,
  );
  const create = () => ({
    element: document.createElement("div"),
    activate() {},
    deactivate() {},
    focus() {},
    dispose() {},
  });
  const panel = createAuxiliaryPanel(root, {
    content,
    language,
    focusTerminal() {},
    views: [
      { id: "files", label: "Files", icon: "folder", create },
      { id: "named", label: (t) => t("snippets.search"), create },
    ],
  });
  panel.show("files");
  const tools = () => [
    ...root.querySelectorAll<HTMLButtonElement>(".auxiliary-tools button"),
  ];
  // One open tool is still an icon, not a title.
  expect(tools()).toHaveLength(1);
  expect(root.querySelector("h2")).toBeNull();
  panel.show("named");
  const [files, named] = tools();
  expect(files!.querySelector("svg")?.getAttribute("data-icon")).toBe("folder");
  expect(files!.textContent).toBe("");
  expect(files!.title).toBe("Files");
  expect(files!.getAttribute("aria-label")).toBe("Files");
  expect(files!.getAttribute("aria-pressed")).toBe("false");
  expect(named!.textContent).toBe("S");
  expect(named!.getAttribute("aria-label")).toBe("Search Snippets");
  expect(named!.getAttribute("aria-pressed")).toBe("true");
  language.set("pt-BR");
  expect(named!.textContent).toBe("B");
  expect(named!.title).toBe("Buscar Snippets");
  expect(root.getAttribute("aria-label")).toBe("Buscar Snippets");
  panel.dispose();
});
