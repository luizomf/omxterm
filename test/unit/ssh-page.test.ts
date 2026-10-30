// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountSshPage, type SshBridge } from "../../extensions/ssh/page";
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});
async function setup() {
  let visibility!: (value: boolean) => void;
  const request = vi.fn<SshBridge["request"]>(async (value) => {
    const operation = (value as { operation: string }).operation;
    if (operation === "host.capabilities")
      return { capabilities: ["terminal.openSsh.v1"] };
    if (operation === "aliases")
      return {
        ok: true,
        aliases: ["alpha", "beta"],
        incomplete: false,
        reasons: {},
      };
    return { ok: true, status: "accepted" };
  });
  const page = mountSshPage(document, {
    onAppearance: () => () => {},
    request,
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
    visibility,
    search: document.querySelector<HTMLInputElement>('input[type="search"]')!,
    quick: document.querySelector<HTMLInputElement>("input[maxlength]")!,
  };
}
const key = (target: HTMLElement, type: "keydown" | "keyup", repeat = false) =>
  target.dispatchEvent(
    new KeyboardEvent(type, {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      repeat,
    }),
  );
const launches = (request: ReturnType<typeof vi.fn<SshBridge["request"]>>) =>
  request.mock.calls.filter(
    ([value]) =>
      (value as { operation: string }).operation === "terminal.openSsh.v1",
  );
it("keeps alias search distinct from quick connect and finishes held Enter before dispatch", async () => {
  const { request, search, quick } = await setup();
  search.value = "not-an-alias";
  search.dispatchEvent(new Event("input"));
  key(search, "keydown");
  key(search, "keyup");
  expect(launches(request)).toHaveLength(0);
  quick.value = "user@host:2222";
  key(quick, "keydown");
  key(quick, "keydown", true);
  expect(launches(request)).toHaveLength(0);
  key(quick, "keyup");
  expect(launches(request)).toEqual([
    [
      {
        operation: "terminal.openSsh.v1",
        target: { host: "host", user: "user", port: 2222 },
      },
    ],
  ]);
  await Promise.resolve();
  expect(document.body.textContent).toContain("Terminal accepted");
  expect(document.body.textContent).not.toContain("Connected");
});
it.each(["edit", "blur", "hide", "lost-release"])(
  "cancels undispatched gesture on %s",
  async (reason) => {
    const { request, quick, visibility } = await setup();
    vi.useFakeTimers();
    quick.value = "host";
    key(quick, "keydown");
    if (reason === "edit") {
      quick.value = "replacement";
      quick.dispatchEvent(new Event("input"));
    }
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "hide") visibility(false);
    if (reason === "lost-release") vi.advanceTimersByTime(30_000);
    key(quick, "keyup");
    expect(launches(request)).toHaveLength(0);
  },
);
it.each(["blur", "hide", "lost-release"])(
  "recovers pointer and fresh-key admission after %s without the lost keyup",
  async (reason) => {
    const { request, quick, visibility } = await setup();
    vi.useFakeTimers();
    quick.value = "host";
    key(quick, "keydown");
    if (reason === "blur") window.dispatchEvent(new Event("blur"));
    if (reason === "hide") {
      visibility(false);
      visibility(true);
    }
    if (reason === "lost-release") vi.advanceTimersByTime(30_000);
    key(quick, "keydown", true);
    expect(launches(request)).toHaveLength(0);
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === "Connect")!
      .click();
    expect(launches(request)).toHaveLength(1);
    await Promise.resolve();
    key(quick, "keydown");
    key(quick, "keyup");
    expect(launches(request)).toHaveLength(2);
  },
);
it("filters an admitted discovery response using edits made while it was pending", async () => {
  const { request, search } = await setup();
  let finish!: (value: Awaited<ReturnType<SshBridge["request"]>>) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  [...document.querySelectorAll("button")]
    .find((button) => button.textContent === "Refresh")!
    .click();
  search.value = "alp";
  search.dispatchEvent(new Event("input"));
  finish({ ok: true, aliases: ["alpha", "beta"] });
  await Promise.resolve();
  expect(document.querySelector('[data-alias="alpha"]')).not.toBeNull();
  expect(document.querySelector('[data-alias="beta"]')).toBeNull();
});
it("bounds pointer submission and reports lost replies without automatic replay", async () => {
  const { request, quick } = await setup();
  let fail!: (error: Error) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
  );
  quick.value = "host";
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Connect",
  )!;
  button.click();
  button.click();
  expect(launches(request)).toHaveLength(1);
  fail(new Error("lost"));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.body.textContent).toContain(
    "A terminal may already have opened",
  );
  expect(launches(request)).toHaveLength(1);
});
it("keeps two views' Refresh results and search state independent", async () => {
  const frames = [
    document.createElement("iframe"),
    document.createElement("iframe"),
  ];
  frames.forEach((frame) => document.body.append(frame));
  const pending: Array<
    (reply: Awaited<ReturnType<SshBridge["request"]>>) => void
  > = [];
  const pages = frames.map((frame) =>
    mountSshPage(frame.contentDocument!, {
      onAppearance: () => () => {},
      request: async (value) =>
        (value as { operation: string }).operation === "host.capabilities"
          ? { capabilities: ["terminal.openSsh.v1"] }
          : new Promise((resolve) => {
              pending.push(resolve);
            }),
      onVisibility(listener) {
        listener(true);
        return () => {};
      },
    }),
  );
  try {
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    const search = frames[0]!.contentDocument!.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    search.value = "alpha";
    search.dispatchEvent(new Event("input"));
    pending[1]!({ ok: true, aliases: ["beta"] });
    await pages[1]!.ready;
    expect(
      frames[1]!.contentDocument!.querySelector('[data-alias="beta"]'),
    ).not.toBeNull();
    expect(
      frames[0]!.contentDocument!.querySelector("[data-alias]"),
    ).toBeNull();
    pending[0]!({ ok: true, aliases: ["alpha", "beta"] });
    await pages[0]!.ready;
    expect(
      frames[0]!.contentDocument!.querySelector('[data-alias="alpha"]'),
    ).not.toBeNull();
    expect(
      frames[0]!.contentDocument!.querySelector('[data-alias="beta"]'),
    ).toBeNull();
  } finally {
    pages.forEach((page) => page.dispose());
    frames.forEach((frame) => frame.remove());
  }
});
it("does not invalidate initial discovery when the host republishes the initial hidden state", async () => {
  let visible!: (value: boolean) => void;
  let finish!: (reply: Awaited<ReturnType<SshBridge["request"]>>) => void;
  const page = mountSshPage(document, {
    onAppearance: () => () => {},
    request: async (value) =>
      (value as { operation: string }).operation === "host.capabilities"
        ? { capabilities: ["terminal.openSsh.v1"] }
        : new Promise((resolve) => {
            finish = resolve;
          }),
    onVisibility(listener) {
      visible = listener;
      listener(false);
      return () => {};
    },
  });
  dispose = page.dispose;
  await Promise.resolve();
  visible(false); // Actual host did-finish-load publication, before first selection.
  visible(true);
  finish({ ok: true, aliases: ["alpha"] });
  await page.ready;
  expect(document.querySelector('[data-alias="alpha"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("result was invalidated");
});
it("serializes Refresh and ignores a result invalidated by hiding", async () => {
  const { request, visibility } = await setup();
  let finish!: (value: Awaited<ReturnType<SshBridge["request"]>>) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const button = [...document.querySelectorAll("button")].find(
    (button) => button.textContent === "Refresh",
  )!;
  button.click();
  button.click();
  expect(
    request.mock.calls.filter(
      ([value]) => (value as { operation: string }).operation === "aliases",
    ),
  ).toHaveLength(2);
  visibility(false);
  finish({ ok: true, aliases: ["stale"] });
  await Promise.resolve();
  await Promise.resolve();
  visibility(true);
  expect(document.querySelector('[data-alias="stale"]')).toBeNull();
  expect(button.disabled).toBe(false);
});
