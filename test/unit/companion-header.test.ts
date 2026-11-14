// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import { mountSshPage } from "../../extensions/ssh/page";
import { mountSnippetsPage } from "../../extensions/snippets/page";
import { createAuxiliaryPanel } from "../../src/renderer/auxiliary-panel";
import { fixture, settle, deferred } from "../fixtures/companion-content";
import { cleanupSnippetsWindows } from "../fixtures/snippets-window";

afterEach(() => {
  cleanupSnippetsWindows();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it.each([
  ["native-snippets", "Snippets"],
  ["files", "Files"],
  ["ssh", "SSH Connect"],
] as const)(
  "identifies %s once, alone and among all three tools",
  async (id, label) => {
    const f = await fixture();
    f.open(id, true, false, label);
    await settle();
    const header = f.root.querySelector<HTMLElement>(".auxiliary-header")!;
    const title = header.querySelector<HTMLHeadingElement>("h2")!;
    const nav = header.querySelector<HTMLElement>(".auxiliary-tools")!;
    expect(title.textContent).toBe(label);
    expect(title.hidden).toBe(false);
    expect(nav.hidden).toBe(true);
    expect(f.root.getAttribute("aria-label")).toBe(label);

    for (const [otherId, otherLabel] of [
      ["native-snippets", "Snippets"],
      ["files", "Files"],
      ["ssh", "SSH Connect"],
    ]) {
      if (otherId === id) continue;
      f.open(otherId, true, false, otherLabel);
      await settle();
    }
    f.tool(label).click();
    await settle();
    expect(title.hidden).toBe(true);
    expect(nav.hidden).toBe(false);
    expect(nav.getAttribute("aria-label")).toBe("Open tools");
    expect(nav.querySelectorAll("button")).toHaveLength(3);
    expect(f.tool(label).getAttribute("aria-pressed")).toBe("true");
    expect(f.root.getAttribute("aria-label")).toBe(label);
    f.tool(label).focus();
    f.setLanguage("pt-BR");
    expect(document.activeElement).toBe(f.tool(label));
    expect(nav.getAttribute("aria-label")).toBe("Ferramentas abertas");
    expect(
      header.querySelector(".auxiliary-hide")?.getAttribute("aria-label"),
    ).toBe("Ocultar barra lateral");
    expect(
      header.querySelector(".auxiliary-close")?.getAttribute("aria-label"),
    ).toBe("Fechar ferramenta");
  },
);

it.each([
  ["native-snippets", "Snippets", "Loading snippets"],
  ["files", "Files", "Reading directory"],
  ["ssh", "SSH Connect", "Reading aliases"],
] as const)(
  "keeps the %s host identity and child feedback coordinated across single/multiple tools",
  async (id, label, loading) => {
    const f = await fixture();
    f.open(id, true, false, label);
    await settle();
    const slot = f.root.querySelector<HTMLElement>(".companion-native-slot")!;
    const frame = document.createElement("iframe");
    slot.append(frame);
    const child = frame.contentDocument!;
    const failure = deferred<{ ok: false; error: string }>();
    let dispose: () => void;
    let ready: Promise<void> = Promise.resolve();
    if (id === "files") {
      const page = mountFilesPage(child, {
        request: (value) =>
          (value as { operation: string }).operation === "home"
            ? Promise.resolve({ ok: true, directory: "/example" })
            : failure.promise,
      });
      dispose = page.dispose;
      ready = page.ready;
    } else if (id === "ssh") {
      const page = mountSshPage(child, {
        onAppearance: () => () => {},
        onLanguage(listener) {
          listener("en-US");
          return () => {};
        },
        onVisibility(listener) {
          listener(true);
          return () => {};
        },
        request: (value) =>
          (value as { operation: string }).operation === "host.capabilities"
            ? Promise.resolve({ capabilities: ["terminal.openSsh.v1"] })
            : failure.promise,
      });
      dispose = page.dispose;
      ready = page.ready;
    } else {
      const page = mountSnippetsPage(child, {
        request: () => failure.promise,
        onAppearance: () => () => {},
        onLanguage: () => () => {},
        onVisibility(listener) {
          listener(true);
          return () => {};
        },
        onActivity(listener) {
          listener(true);
          return () => {};
        },
        onFocusIntent: () => () => {},
      });
      dispose = page.dispose;
    }
    await settle();
    const title = f.root.querySelector<HTMLHeadingElement>(
      ".auxiliary-header h2",
    )!;
    const nav = f.root.querySelector<HTMLElement>(".auxiliary-tools")!;
    expect(title.hidden).toBe(false);
    expect(title.textContent).toBe(label);
    expect(nav.hidden).toBe(true);
    expect(child.querySelector("h1")).toBeNull();
    expect(child.body.textContent).toContain(loading);

    f.open("other", true, false, "Other tool");
    await settle();
    f.tool(label).click();
    await settle();
    expect(title.hidden).toBe(true);
    expect(nav.hidden).toBe(false);
    expect(f.tool(label).getAttribute("aria-pressed")).toBe("true");
    expect(child.body.textContent).toContain(loading);
    failure.resolve({ ok: false, error: "unavailable" });
    await ready;
    await settle();
    const error = child.querySelector<HTMLElement>(
      id === "native-snippets"
        ? ".snippets-error"
        : id === "files"
          ? ".summary"
          : ".index-warning",
    )!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBeTruthy();
    expect(child.querySelector("h1")).toBeNull();
    expect(f.root.getAttribute("aria-label")).toBe(label);
    dispose();
  },
);

it("retains Enter on a focused selector while switching directly to Snippets", async () => {
  const f = await fixture();
  f.toggle();
  await settle();
  f.open("files", true, false, "Files");
  await settle();
  const button = f.tool("Snippets");
  button.focus();
  const key = (
    type: "keydown" | "keyup",
    target: HTMLElement,
    repeat = false,
  ) => {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      repeat,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  f.surfaces[0]!.focus.mockClear();
  // Chromium activates on Enter; jsdom needs the default click explicitly.
  expect(key("keydown", button).defaultPrevented).toBe(false);
  button.click();
  await settle();
  expect(document.activeElement).toBe(
    f.root.querySelector(".snippets-view input"),
  );
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  expect(key("keydown", document.body, true).defaultPrevented).toBe(true);
  expect(key("keyup", document.body).defaultPrevented).toBe(true);
});

it("does not remove third-party content headings, even when they match a tool title", () => {
  const content = document.createElement("div");
  const root = document.createElement("aside");
  content.append(root);
  document.body.append(content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  const section = document.createElement("section");
  const heading = document.createElement("h1");
  heading.textContent = "Files";
  section.append(heading);
  const panel = createAuxiliaryPanel(root, {
    content,
    focusTerminal: () => {},
    views: [
      {
        id: "third-party",
        label: "Files",
        create: () => ({
          element: section,
          activate() {},
          deactivate() {},
          focus() {},
          dispose() {},
        }),
      },
    ],
  });
  panel.show("third-party");
  expect(section.querySelector("h1")).toBe(heading);
  expect(heading.hidden).toBe(false);
  expect(heading.textContent).toBe("Files");
  panel.dispose();
});
