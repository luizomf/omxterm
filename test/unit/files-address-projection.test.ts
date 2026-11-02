// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountFilesPage } from "../../extensions/files/page";

let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  dispose = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
async function setup(platform = "Linux aarch64") {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  const request = vi.fn(async (value: unknown) => {
    const input = value as { operation: string; path?: string };
    return input.operation === "home"
      ? { ok: true, directory: "/root" }
      : {
          ok: true,
          directory:
            input.path === "/root/.config" ? "/canonical/config" : input.path!,
          rows: [
            { name: ".private", kind: "file", size: 1 },
            { name: "visible", kind: "file", size: 1 },
          ],
        };
  });
  const page = mountFilesPage(document, { request });
  dispose = page.dispose;
  await page.ready;
  return { request };
}
function button(name: string) {
  return document.querySelector<HTMLButtonElement>(
    `button[aria-label="${name}"]`,
  )!;
}
function draft() {
  const address = document.querySelector<HTMLInputElement>(".location input")!;
  address.focus();
  address.value = "/root/.config";
  address.setSelectionRange(2, 9, "backward");
  return address;
}

it("preserves an unfocused address draft and caret when the checkbox changes visibility", async () => {
  const { request } = await setup();
  const address = draft();
  const actions = button("Actions…");
  actions.focus();
  const calls = request.mock.calls.length;
  actions.click();
  document
    .querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
    .click();
  expect(document.querySelector('[data-path="/root/.private"]')).toBeTruthy();
  expect(address.value).toBe("/root/.config");
  expect([
    address.selectionStart,
    address.selectionEnd,
    address.selectionDirection,
  ]).toEqual([2, 9, "backward"]);
  expect(document.activeElement).toBe(actions);
  actions.click();
  document
    .querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
    .click();
  expect(document.querySelector('[data-path="/root/.private"]')).toBeNull();
  expect(address.value).toBe("/root/.config");
  expect([
    address.selectionStart,
    address.selectionEnd,
    address.selectionDirection,
  ]).toEqual([2, 9, "backward"]);
  expect(document.activeElement).toBe(actions);
  expect(request).toHaveBeenCalledTimes(calls);
});

it.each([
  ["Linux aarch64", "h", { code: "KeyH", ctrlKey: true }],
  ["MacIntel", ">", { code: "Period", metaKey: true, shiftKey: true }],
] as const)(
  "preserves a draft and caret with the toolbar-focused shortcut on %s",
  async (platform, key, modifiers) => {
    const { request } = await setup(platform);
    const address = draft();
    const actions = button("Actions…");
    actions.focus();
    const calls = request.mock.calls.length;
    const event = new KeyboardEvent("keydown", {
      key,
      ...modifiers,
      bubbles: true,
      cancelable: true,
    });
    actions.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-path="/root/.private"]')).toBeTruthy();
    expect(address.value).toBe("/root/.config");
    expect([
      address.selectionStart,
      address.selectionEnd,
      address.selectionDirection,
    ]).toEqual([2, 9, "backward"]);
    expect(document.activeElement).toBe(actions);
    const again = new KeyboardEvent("keydown", {
      key,
      ...modifiers,
      bubbles: true,
      cancelable: true,
    });
    actions.dispatchEvent(again);
    expect(again.defaultPrevented).toBe(true);
    expect(document.querySelector('[data-path="/root/.private"]')).toBeNull();
    expect(address.value).toBe("/root/.config");
    expect([
      address.selectionStart,
      address.selectionEnd,
      address.selectionDirection,
    ]).toEqual([2, 9, "backward"]);
    expect(document.activeElement).toBe(actions);
    expect(request).toHaveBeenCalledTimes(calls);
  },
);

it("keeps ordinary navigation and refresh synchronization of the address", async () => {
  const { request } = await setup();
  const address = draft();
  address.form!.dispatchEvent(
    new Event("submit", { bubbles: true, cancelable: true }),
  );
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
  expect(request).toHaveBeenCalledWith({
    operation: "list",
    path: "/root/.config",
  });
  expect(address.value).toBe("/root/.config");
  const refresh = button("Refresh");
  refresh.focus();
  refresh.click();
  await vi.waitFor(() =>
    expect(request).toHaveBeenCalledWith({
      operation: "list",
      path: "/canonical/config",
    }),
  );
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
  expect(address.value).toBe("/canonical/config");
  expect(document.activeElement).toBe(refresh);
  button("Home").click();
  await vi.waitFor(() => expect(address.value).toBe("/root"));
  await vi.waitFor(() =>
    expect(
      document.querySelector('[role="tree"]')?.getAttribute("aria-busy"),
    ).toBe("false"),
  );
});
