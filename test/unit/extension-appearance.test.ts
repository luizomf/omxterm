// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountSshPage, type SshBridge } from "../../extensions/ssh/page";
import type { HostedAppearance } from "../../src/shared/extension-view";

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.removeAttribute("style");
  vi.unstubAllGlobals();
});
const dark = { background: "#101218", foreground: "#f4f4f4", opacity: 0.6 };
const light = { background: "#ffffff", foreground: "#202020", opacity: 0 };

it("updates the retained SSH view without replacing drafts or issuing requests and unsubscribes", async () => {
  let appearance!: (value: HostedAppearance) => void;
  let visibility!: (value: boolean) => void;
  const off = vi.fn();
  const request = vi.fn<SshBridge["request"]>(async (value) =>
    (value as { operation: string }).operation === "host.capabilities"
      ? { capabilities: ["terminal.openSsh.v1"] }
      : { ok: true, aliases: ["alpha"] },
  );
  const page = mountSshPage(document, {
    request,
    onAppearance(listener) {
      appearance = listener;
      listener(dark);
      return off;
    },
    onVisibility(listener) {
      visibility = listener;
      listener(true);
      return () => {};
    },
  });
  try {
    await page.ready;
    const quick = document.querySelector<HTMLInputElement>("input[maxlength]")!;
    const search = document.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    quick.value = "user@draft";
    search.value = "alp";
    visibility(false);
    request.mockClear();
    appearance(light);
    visibility(true);
    expect(document.querySelector("input[maxlength]")).toBe(quick);
    expect(quick.value).toBe("user@draft");
    expect(search.value).toBe("alp");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(
      document.documentElement.style.getPropertyValue(
        "--terminal-background-opacity",
      ),
    ).toBe("0");
    expect(document.body.style.background).toBe("");
    expect(request).not.toHaveBeenCalled();
    appearance({ ...dark, opacity: 1 });
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(
      document.documentElement.style.getPropertyValue(
        "--terminal-background-opacity",
      ),
    ).toBe("1");
  } finally {
    page.dispose();
  }
  expect(off).toHaveBeenCalledOnce();
});

it("projects Files appearance without replacing its listing or operation draft", async () => {
  let appearance!: (value: HostedAppearance) => void;
  const request = vi.fn(async (value: { operation: string }) =>
    value.operation === "home"
      ? { ok: true, directory: "/fixture" }
      : {
          ok: true,
          directory: "/fixture",
          rows: [{ name: "sample", kind: "file", size: 12 }],
        },
  );
  Object.defineProperty(window, "omxHostedContent", {
    configurable: true,
    value: {
      request,
      onAppearance(listener: (value: HostedAppearance) => void) {
        appearance = listener;
        listener(dark);
        return () => {};
      },
    },
  });
  try {
    await import("../../extensions/files/view");
    await vi.waitFor(() =>
      expect(document.querySelector(".file-row")).not.toBeNull(),
    );
    const row = document.querySelector<HTMLElement>(".file-row")!;
    row.click();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Actions…")!
      .click();
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "New file")!
      .click();
    const input = document.querySelector<HTMLInputElement>(
      ".operation-editor input",
    )!;
    input.value = "draft.txt";
    request.mockClear();
    appearance(light);
    expect(document.querySelector(".file-row")).toBe(row);
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(input.value).toBe("draft.txt");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(request).not.toHaveBeenCalled();
  } finally {
    Reflect.deleteProperty(window, "omxHostedContent");
  }
});
