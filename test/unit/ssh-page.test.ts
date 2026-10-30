// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountSshPage, type SshBridge } from "../../extensions/ssh/page";
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.replaceChildren();
  vi.useRealTimers();
});
async function setup(initialLanguage: "en-US" | "pt-BR" = "en-US") {
  let visibility!: (value: boolean) => void;
  let language!: (value: "en-US" | "pt-BR") => void;
  const unsubscribeLanguage = vi.fn();
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
    onLanguage(listener) {
      language = listener;
      listener(initialLanguage);
      return unsubscribeLanguage;
    },
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
    language,
    unsubscribeLanguage,
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
it("replays the initial language and preserves keyboard selection across relabeling", async () => {
  const { request, search, language } = await setup("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(document.body.textContent).toContain("Buscar aliases");
  search.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  const selected = document.querySelector(".alias-row.selected");
  language("en-US");
  expect(document.querySelector(".alias-row.selected")).toBe(selected);
  expect(selected?.textContent).toBe("beta");
  key(search, "keydown");
  key(search, "keyup");
  expect(launches(request)[0]).toEqual([
    { operation: "terminal.openSsh.v1", target: { host: "beta" } },
  ]);
});
it("relabels in place without requests, lost drafts, focus or captured target", async () => {
  const { request, quick, search, language, unsubscribeLanguage } =
    await setup();
  quick.value = "alice@example.org:2222";
  search.value = "alp";
  search.dispatchEvent(new Event("input"));
  const row = document.querySelector<HTMLButtonElement>("[data-alias=alpha]")!;
  row.focus();
  key(row, "keydown");
  const calls = request.mock.calls.length;
  language("pt-BR");
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(document.body.textContent).toContain("Conexão rápida");
  expect(document.activeElement).toBe(row);
  expect(row.getAttribute("aria-label")).toBe("Conectar a alpha");
  expect(quick.value).toBe("alice@example.org:2222");
  expect(search.value).toBe("alp");
  expect(request.mock.calls).toHaveLength(calls);
  key(row, "keyup");
  expect(launches(request)[0]).toEqual([
    { operation: "terminal.openSsh.v1", target: { host: "alpha" } },
  ]);
  await Promise.resolve();
  expect(document.body.textContent).toContain("Terminal aceito");
  language("en-US");
  expect(document.body.textContent).toContain("Terminal accepted");
  dispose?.();
  expect(unsubscribeLanguage).toHaveBeenCalledOnce();
  dispose = undefined;
});
it.each([
  [{ ok: true, status: "accepted" }, "Terminal aceito", "Terminal accepted"],
  [
    { ok: false, error: "ssh-not-found" },
    "Cliente OpenSSH não encontrado",
    "OpenSSH client not found",
  ],
  [
    { ok: false, error: "outcome-unknown" },
    "Um terminal pode já",
    "A terminal may already",
  ],
  [{ ok: false, error: "unavailable" }, "Não foi possível", "Unable to open"],
] as const)(
  "relabels pending and settled notices without replay: %j",
  async (reply, portuguese, english) => {
    const { request, quick, language, visibility } = await setup();
    let finish!: (value: Awaited<ReturnType<SshBridge["request"]>>) => void;
    request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    quick.value = "alice@example.org";
    quick.focus();
    key(quick, "keydown");
    key(quick, "keyup");
    const calls = request.mock.calls.length;
    language("pt-BR");
    expect(document.activeElement).toBe(quick);
    expect(document.body.textContent).toContain("Abrindo terminal");
    expect(
      document.querySelector<HTMLButtonElement>(".quick-connect button")!
        .disabled,
    ).toBe(true);
    visibility(false);
    language("en-US");
    expect(document.body.textContent).toContain("Opening terminal");
    finish(reply);
    await Promise.resolve();
    language("pt-BR");
    expect(document.body.textContent).toContain(portuguese);
    language("en-US");
    expect(document.body.textContent).toContain(english);
    expect(quick.value).toBe("alice@example.org");
    expect(request.mock.calls).toHaveLength(calls);
  },
);
it.each([
  "host:0",
  "host:65536",
  "[bad::address]",
  "a".repeat(385),
  "user@host command",
])(
  "localizes validation without exposing parser English: %s",
  async (target) => {
    const { request, quick, language } = await setup();
    quick.value = target;
    language("pt-BR");
    key(quick, "keydown");
    key(quick, "keyup");
    expect(document.body.textContent).toContain("Destino inválido");
    expect(document.body.textContent).toContain("65535");
    language("en-US");
    expect(document.body.textContent).toContain("Invalid target");
    expect(launches(request)).toHaveLength(0);
    expect(quick.value).toBe(target);
  },
);
it("relabels reading, incomplete discovery and invalidated results without rereading", async () => {
  const { request, language, visibility } = await setup();
  const refresh = document.querySelector<HTMLButtonElement>(
    ".alias-toolbar button",
  )!;
  let finish!: (value: Awaited<ReturnType<SshBridge["request"]>>) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  refresh.click();
  language("pt-BR");
  expect(document.body.textContent).toContain("Lendo aliases");
  finish({
    ok: true,
    aliases: ["literal-alias"],
    incomplete: true,
    reasons: { syntax: 2, "file-limit": 1 },
  });
  await Promise.resolve();
  expect(document.body.textContent).toContain("1 de 1 aliases indexados");
  expect(document.body.textContent).toContain(
    "sintaxe: 2; limite de arquivos: 1",
  );
  const row = document.querySelector("[data-alias]");
  const calls = request.mock.calls.length;
  visibility(false);
  language("en-US");
  expect(document.querySelector("[data-alias]")).toBe(row);
  expect(document.body.textContent).toContain("syntax: 2; file limit: 1");
  expect(request.mock.calls).toHaveLength(calls);
  visibility(true);
  request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  refresh.click();
  visibility(false);
  finish({ ok: true, aliases: ["stale"] });
  await Promise.resolve();
  language("pt-BR");
  expect(document.body.textContent).toContain(
    "resultado da descoberta foi invalidado",
  );
});
it.each([false, true])(
  "relabels capability failure and discovery failure (throw=%s)",
  async (throws) => {
    let language!: (value: "en-US" | "pt-BR") => void;
    const request = vi.fn<SshBridge["request"]>(async () => {
      if (throws) throw new Error("private transport diagnostic");
      return { ok: false };
    });
    const page = mountSshPage(document, {
      request,
      onAppearance: () => () => {},
      onVisibility: () => () => {},
      onLanguage(listener) {
        language = listener;
        listener("en-US");
        return () => {};
      },
    });
    dispose = page.dispose;
    await page.ready;
    const calls = request.mock.calls.length;
    language("pt-BR");
    expect(document.body.textContent).toContain(
      throws
        ? "Recursos do host indisponíveis"
        : "Este host não oferece SSH Connect",
    );
    expect(document.body.textContent).toContain(
      "A descoberta de aliases está indisponível",
    );
    expect(document.body.textContent).not.toContain(
      "private transport diagnostic",
    );
    expect(request.mock.calls).toHaveLength(calls);
  },
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
      onLanguage: () => () => {},
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
    onLanguage: () => () => {},
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
