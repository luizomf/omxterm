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

it("uses one host header for one tool and for the opened-tool selector", async () => {
  const f = await fixture();
  f.open("files", true, false, "Files");
  await settle();
  const header = f.root.querySelector(".auxiliary-header")!;
  const title = header.querySelector("h2")!;
  const tools = f.root.querySelector<HTMLElement>(".auxiliary-tools")!;
  expect(title.textContent).toBe("Files");
  expect(title.hidden).toBe(false);
  expect(tools.hidden).toBe(true);
  expect(f.root.getAttribute("aria-label")).toBe("Files");

  f.toggle();
  await settle();
  expect(tools.parentElement).toBe(header);
  expect(title.hidden).toBe(true);
  expect(tools.hidden).toBe(false);
  expect(f.root.getAttribute("aria-label")).toBe("Snippets");
  expect(f.tool("Snippets").getAttribute("aria-pressed")).toBe("true");
  f.tool("Files").click();
  await settle();
  expect(f.root.getAttribute("aria-label")).toBe("Files");
  expect(f.tool("Files").getAttribute("aria-pressed")).toBe("true");
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
    ).toBe("Ocultar painel auxiliar");
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

it("keeps Snippets search and loading/error feedback without an extension title", async () => {
  const pending = deferred<unknown>();
  let activity!: (value: boolean) => void;
  const page = mountSnippetsPage(document, {
    request: () => pending.promise,
    onAppearance: () => () => {},
    onLanguage: () => () => {},
    onVisibility(listener) {
      listener(true);
      return () => {};
    },
    onActivity(listener) {
      activity = listener;
      return () => {};
    },
    onFocusIntent: () => () => {},
  });
  activity(true);
  await settle();
  expect(document.querySelector("h1, h2")).toBeNull();
  expect(document.querySelector("input")?.getAttribute("aria-label")).toBe(
    "Search Snippets",
  );
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "Loading snippets",
  );
  pending.resolve({ ok: false });
  await settle();
  expect(document.querySelector("h1, h2")).toBeNull();
  expect(document.querySelector<HTMLElement>('[role="alert"]')?.hidden).toBe(
    false,
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy();
  page.dispose();
});

it("does not add another Files identity heading while loading or on failure", async () => {
  const listing = deferred<{ ok: boolean; error: string }>();
  const page = mountFilesPage(document, {
    request: (value) =>
      (value as { operation: string }).operation === "home"
        ? Promise.resolve({ ok: true, directory: "/example" })
        : listing.promise,
  });
  await settle();
  expect(document.querySelector(".application-page-header")).toBeNull();
  expect(
    document.querySelector('[role="region"]')?.getAttribute("aria-label"),
  ).toBe("Files");
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-label"),
  ).toBe("Local files");
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
  ).toBe("true");
  expect(document.querySelector(".summary")?.textContent).toContain("Reading");
  listing.resolve({ ok: false, error: "unavailable" });
  await page.ready;
  expect(document.querySelector(".application-page-header")).toBeNull();
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
  ).toBe("false");
  expect(document.querySelector(".summary")?.textContent).toContain(
    "unavailable",
  );
  page.dispose();
});

it("keeps SSH's meaningful section without repeating the panel identity", async () => {
  const aliases = deferred<{ ok: boolean; error: string }>();
  const page = mountSshPage(document, {
    onAppearance: () => () => {},
    onLanguage(listener) {
      listener("en-US");
      return () => {};
    },
    onVisibility(listener) {
      listener(true);
      return () => {};
    },
    request(value) {
      return (value as { operation: string }).operation === "host.capabilities"
        ? Promise.resolve({ capabilities: ["terminal.openSsh.v1"] })
        : aliases.promise;
    },
  });
  await settle();
  expect(document.querySelector("h1")).toBeNull();
  expect(
    document.querySelector('[role="region"]')?.getAttribute("aria-label"),
  ).toBe("SSH Connect");
  expect(document.body.textContent).toContain("Reading aliases");
  expect(document.body.textContent).toContain("OpenSSH connections");
  expect(document.querySelector("h2")?.textContent).toBe(
    "From your SSH config",
  );
  aliases.resolve({ ok: false, error: "unavailable" });
  await page.ready;
  expect(document.querySelector("h1")).toBeNull();
  expect(document.querySelector(".index-warning")?.textContent).toBeTruthy();
  page.dispose();
});
