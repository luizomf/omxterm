// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";
import type { SupportedLanguage } from "../../src/shared/i18n";

type Reply = Awaited<
  ReturnType<Parameters<typeof mountFilesPage>[1]["request"]>
>;
let dispose: (() => void) | undefined;
// JSDOM does not lay out controls. Browser tests exercise real geometry.
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 10,
    y: 10,
    left: 10,
    top: 10,
    right: 44,
    bottom: 44,
    width: 34,
    height: 34,
  } as DOMRect);
});
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function setup() {
  let handler:
    ((value: Record<string, string>) => Promise<Reply> | undefined) | undefined;
  const request = vi.fn(async (value: unknown): Promise<Reply> => {
    const request = value as Record<string, string>;
    const custom = handler?.(request);
    if (custom) return custom;
    if (request.operation === "home") return { ok: true, directory: "/root" };
    if (request.operation === "list") {
      const name =
        request.path === "/root"
          ? "alpha"
          : request.path === "/other"
            ? "elsewhere"
            : undefined;
      return {
        ok: true,
        directory: request.path!,
        rows: name ? [{ name, kind: "file", size: 1 }] : [],
      };
    }
    return { ok: true };
  });
  let visibility!: (visible: boolean) => void;
  let language!: (language: SupportedLanguage) => void;
  const page = mountFilesPage(document, {
    request,
    onLanguage(listener) {
      language = listener;
      listener("en-US");
      return () => {};
    },
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
  });
  dispose = page.dispose;
  await page.ready;
  return {
    request,
    language,
    visibility,
    handle(value: typeof handler) {
      handler = value;
    },
  };
}
function button(label: string, scope: ParentNode = document) {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) =>
      (node.getAttribute("aria-label") === label ||
        node.textContent === label) &&
      !node.closest("[hidden]"),
  );
  expect(result, label).toBeTruthy();
  return result!;
}
const row = (path: string) =>
  [...document.querySelectorAll<HTMLElement>(".file-row")].find(
    (node) => node.dataset.path === path,
  )!;
const menu = () => document.querySelector<HTMLElement>(".file-menu")!;
function tooltip(control: HTMLButtonElement) {
  return document.getElementById(control.getAttribute("aria-describedby")!)!;
}
function pointer(
  control: HTMLButtonElement,
  type: "pointerenter" | "pointerleave",
) {
  const target = type === "pointerenter" ? control : document.body;
  target.dispatchEvent(
    new MouseEvent("pointermove", {
      bubbles: true,
      clientX: type === "pointerenter" ? 20 : -1,
      clientY: type === "pointerenter" ? 20 : -1,
    }),
  );
}
async function settled() {
  await vi.waitFor(() => {
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false");
    expect(
      document.querySelector<HTMLElement>(".operation-editor")!.inert,
    ).not.toBe(true);
  });
}

it("exposes localized icon names and explanatory tooltips without replacing focused controls", async () => {
  const { language, request } = await setup();
  const controls = [
    [
      "Home",
      "Open the home directory",
      "Pasta pessoal",
      "Abrir a pasta pessoal",
    ],
    ["Up", "Open the parent directory", "Acima", "Abrir o diretório superior"],
    [
      "Refresh",
      "Refresh the current directory",
      "Atualizar",
      "Atualizar o diretório atual",
    ],
    [
      "New folder",
      "Create a folder in the current directory",
      "Nova pasta",
      "Criar uma pasta no diretório atual",
    ],
    [
      "Actions…",
      "Actions for the selection or directory; show dotfiles",
      "Ações…",
      "Ações para a seleção ou diretório; mostrar itens iniciados por ponto",
    ],
    [
      "Go",
      "Open the entered directory (Enter in the address field)",
      "Ir",
      "Abrir o diretório informado (Enter no campo de endereço)",
    ],
  ] as const;
  const retained = controls.map(([name, description]) => {
    const control = button(name);
    expect(control.textContent).toBe("");
    expect(control.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(control.hasAttribute("title")).toBe(false);
    expect(tooltip(control).getAttribute("role")).toBe("tooltip");
    expect(tooltip(control).textContent).toBe(description);
    expect(tooltip(control).hidden).toBe(true);
    return control;
  });
  retained[5]!.focus();
  expect(tooltip(retained[5]!).hidden).toBe(false);
  const count = request.mock.calls.length;
  language("pt-BR");
  for (const [index, [, , name, description]] of controls.entries()) {
    expect(button(name)).toBe(retained[index]);
    expect(tooltip(retained[index]!).textContent).toBe(description);
  }
  expect(document.activeElement).toBe(retained[5]);
  expect(tooltip(retained[5]!).hidden).toBe(false);
  expect(request).toHaveBeenCalledTimes(count);
});

it("keeps the creation and actions controls together without changing their order", async () => {
  await setup();
  const toolbar = document.querySelector<HTMLElement>(".toolbar")!;
  expect(
    [...toolbar.querySelectorAll("button")].map((control) =>
      control.getAttribute("aria-label"),
    ),
  ).toEqual(["Home", "Up", "Refresh", "New folder", "Actions…"]);
  const pair = toolbar.querySelector(".toolbar-pair");
  expect(pair).toBeTruthy();
  expect(button("New folder").parentElement?.parentElement).toBe(pair);
  expect(button("Actions…").parentElement?.parentElement).toBe(pair);
});

it("shows one tooltip on hover or focus, dismisses it without intercepting Escape, and keeps menus clear", async () => {
  const { visibility } = await setup();
  const home = button("Home");
  const refresh = button("Refresh");
  const actions = button("Actions…");
  pointer(home, "pointerenter");
  expect(tooltip(home).hidden).toBe(false);
  pointer(home, "pointerleave");
  expect(tooltip(home).hidden).toBe(true);
  home.focus();
  expect(tooltip(home).hidden).toBe(false);
  pointer(refresh, "pointerenter");
  expect(tooltip(home).hidden).toBe(true);
  expect(tooltip(refresh).hidden).toBe(false);
  pointer(refresh, "pointerleave");
  expect(tooltip(home).hidden).toBe(false);
  const escape = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  home.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(false);
  expect(tooltip(home).hidden).toBe(true);
  actions.focus();
  expect(tooltip(actions).hidden).toBe(false);
  actions.click();
  expect(menu().hidden).toBe(false);
  expect(tooltip(actions).hidden).toBe(true);
  visibility(false);
  expect(menu().hidden).toBe(true);
  expect(
    [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')].every(
      (tip) => tip.hidden,
    ),
  ).toBe(true);
});

it("retains hover on a pointer-transparent explanation, but not on underlying inputs or the tree", async () => {
  await setup();
  const home = button("Home");
  const move = (target: Element) =>
    target.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 20,
        clientY: 20,
      }),
    );
  pointer(home, "pointerenter");
  move(document.body);
  expect(tooltip(home).hidden).toBe(false);
  move(document.querySelector(".location input")!);
  expect(tooltip(home).hidden).toBe(true);
  pointer(home, "pointerenter");
  move(row("/root/alpha"));
  expect(tooltip(home).hidden).toBe(true);
  pointer(home, "pointerenter");
  document.dispatchEvent(new Event("pointerleave"));
  expect(tooltip(home).hidden).toBe(true);
  home.focus();
  document.dispatchEvent(new Event("pointerleave"));
  expect(tooltip(home).hidden).toBe(false);
});

it("prefers renewed pointer movement without reviving an Escape-dismissed tooltip", async () => {
  await setup();
  const home = button("Home");
  const actions = button("Actions…");
  pointer(home, "pointerenter");
  actions.focus();
  expect(tooltip(actions).hidden).toBe(false);
  home.parentElement!.dispatchEvent(
    new Event("pointermove", { bubbles: true }),
  );
  expect(tooltip(home).hidden).toBe(false);
  expect(tooltip(actions).hidden).toBe(true);
  actions.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  expect(tooltip(home).hidden).toBe(true);
  home.parentElement!.dispatchEvent(
    new Event("pointermove", { bubbles: true }),
  );
  expect(tooltip(home).hidden).toBe(true);
  pointer(home, "pointerleave");
  pointer(home, "pointerenter");
  expect(tooltip(home).hidden).toBe(false);
});

it("clamps a visible tooltip to the child viewport and moves it above when needed", async () => {
  await setup();
  const control = button("Actions…");
  const tip = tooltip(control);
  const originalWidth = window.innerWidth;
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 180,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(control, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      left: 142,
      right: 176,
      top: 60,
      bottom: 94,
      width: 34,
      height: 34,
    }),
  });
  Object.defineProperty(tip, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ width: 120, height: 35 }),
  });
  try {
    control.focus();
    expect(tip.style.left).toBe("56px");
    expect(tip.style.top).toBe("25px");
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 160,
    });
    window.dispatchEvent(new Event("resize"));
    expect(tip.style.left).toBe("36px");
  } finally {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalHeight,
    });
    vi.restoreAllMocks();
  }
});

it("retains the toolbar actions and address form behavior", async () => {
  const { request } = await setup();
  const up = button("Up");
  up.focus();
  up.click();
  await settled();
  expect(request).toHaveBeenCalledWith({ operation: "list", path: "/" });
  expect(up.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(up);
  expect(tooltip(up).textContent).toBe("Already at the filesystem root");
  const atRoot = request.mock.calls.length;
  up.click();
  expect(request).toHaveBeenCalledTimes(atRoot);
  button("Home").click();
  await vi.waitFor(() => expect(row("/root/alpha")).toBeTruthy());
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.value = "/other";
  button("Go").click();
  await vi.waitFor(() => expect(row("/other/elsewhere")).toBeTruthy());
  const beforeRefresh = request.mock.calls.length;
  button("Refresh").click();
  await settled();
  expect(request.mock.calls.length).toBeGreaterThan(beforeRefresh);
  expect(request).toHaveBeenLastCalledWith({
    operation: "list",
    path: "/other",
  });
  button("New folder").click();
  expect(document.querySelector(".operation-editor label")?.textContent).toBe(
    "Create folder in /other",
  );
  button("Cancel").click();
  row("/other/elsewhere").click();
  button("Actions…").click();
  expect(button("Rename / move", menu())).toBeTruthy();
  expect(button("Delete permanently…", menu())).toBeTruthy();
});

it("makes unavailable controls inert but still explains them on pointer hover", async () => {
  const home = deferred<Reply>();
  const listing = deferred<Reply>();
  const request = vi.fn((value: unknown): Promise<Reply> => {
    const operation = (value as { operation: string }).operation;
    return operation === "home" ? home.promise : listing.promise;
  });
  let language!: (language: SupportedLanguage) => void;
  const page = mountFilesPage(document, {
    request,
    onLanguage(listener) {
      language = listener;
      return () => {};
    },
  });
  dispose = page.dispose;
  for (const name of ["Up", "Refresh", "New folder"]) {
    const control = button(name);
    expect(control.disabled).toBe(true);
    expect(tooltip(control).textContent).toBe("No directory is available yet");
    pointer(control, "pointerenter");
    expect(tooltip(control).hidden).toBe(false);
    control.click();
    pointer(control, "pointerleave");
  }
  pointer(button("Up"), "pointerenter");
  language("pt-BR");
  expect(tooltip(button("Acima")).textContent).toBe(
    "Ainda não há um diretório disponível",
  );
  expect(tooltip(button("Acima")).hidden).toBe(false);
  language("en-US");
  pointer(button("Up"), "pointerleave");
  expect(request).toHaveBeenCalledTimes(1);
  home.resolve({ ok: true, directory: "/root" });
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(
    document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
  ).toBe("true");
  expect(button("Up").disabled).toBe(false);
  expect(button("Refresh").disabled).toBe(false);
  expect(button("New folder").disabled).toBe(false);
  listing.resolve({ ok: true, directory: "/root", rows: [] });
  await page.ready;
});

it("disables new-folder during a pending mutation and restores it after settlement", async () => {
  const { handle, language } = await setup();
  const pending = deferred<Reply>();
  handle((value) =>
    value.operation === "create-directory" ? pending.promise : undefined,
  );
  button("New folder").click();
  const form = document.querySelector<HTMLFormElement>(".operation-editor")!;
  form.querySelector("input")!.value = "example";
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  expect(button("New folder").disabled).toBe(true);
  expect(tooltip(button("New folder")).textContent).toBe(
    "A file operation is in progress",
  );
  pointer(button("New folder"), "pointerenter");
  expect(tooltip(button("New folder")).hidden).toBe(false);
  language("pt-BR");
  expect(tooltip(button("Nova pasta")).textContent).toBe(
    "Uma operação de arquivo está em andamento",
  );
  language("en-US");
  pending.resolve({ ok: false, error: "conflict" });
  await settled();
  expect(button("New folder").disabled).toBe(false);
  expect(tooltip(button("New folder")).textContent).toBe(
    "Create a folder in the current directory",
  );
});

it("does not reopen tooltips after page disposal", async () => {
  await setup();
  const home = button("Home");
  home.focus();
  expect(tooltip(home).hidden).toBe(false);
  dispose?.();
  expect(tooltip(home).hidden).toBe(true);
  pointer(home, "pointerenter");
  expect(tooltip(home).hidden).toBe(true);
});
