// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type {
  ExtensionsBridge,
  ExtensionsResult,
} from "../../src/shared/extensions";
import type {
  HostedContentBridge,
  HostedContentDescriptor,
} from "../../src/shared/extension-view";
import {
  cleanupSnippetsWindows,
  snippetsWindow,
} from "../fixtures/snippets-window";

const settle = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
afterEach(() => {
  cleanupSnippetsWindows();
  vi.useRealTimers();
});
const token = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
function hosted() {
  const opened = new Set<(descriptor: HostedContentDescriptor) => void>();
  const retired = new Set<(id: string) => void>();
  const bridge: HostedContentBridge = {
    onOpen: (listener) => {
      opened.add(listener);
      return () => {
        opened.delete(listener);
      };
    },
    onRetired: (listener) => {
      retired.add(listener);
      return () => {
        retired.delete(listener);
      };
    },
    onFailure: () => vi.fn(),
    present: vi.fn(async () => true),
    close: vi.fn(async () => {}),
  };
  return {
    bridge,
    open: (id = "snippets", panelDefaultToken?: string) => {
      for (const listener of opened)
        listener({
          id,
          title: id,
          presentation: "panel",
          ...(panelDefaultToken ? { panelDefaultToken } : {}),
        });
    },
    retire: (id: string) => {
      for (const listener of retired) listener(id);
    },
  };
}

it("uses a localized noninteractive status for four seconds without focus or timer extension", async () => {
  const request = vi
    .fn<ExtensionsBridge["request"]>()
    .mockResolvedValue({ ok: false, noticeEmpty: true });
  const f = await snippetsWindow({ extensions: { request } }, false);
  vi.useFakeTimers();
  const focused = document.activeElement;
  f.panelToggle();
  await settle();
  const status = document.querySelector<HTMLElement>(".auxiliary-status")!;
  expect(status.hidden).toBe(false);
  expect(status.getAttribute("role")).toBe("status");
  expect(status.textContent).toBe(
    "No tools are open. Open an extension to use the panel.",
  );
  expect(f.root.hidden).toBe(true);
  expect(document.activeElement).toBe(focused);
  vi.advanceTimersByTime(2000);
  f.setLanguage("pt-BR");
  expect(status.textContent).toBe(
    "Nenhuma ferramenta está aberta. Abra uma extensão para usar o painel.",
  );
  f.panelToggle(); // Even duplicate notice permission cannot extend a visible notice.
  await settle();
  vi.advanceTimersByTime(1999);
  expect(status.hidden).toBe(false);
  vi.advanceTimersByTime(1);
  expect(status.hidden).toBe(true);
  request.mockResolvedValue({ ok: false, noticeEmpty: false });
  f.panelToggle();
  await settle();
  expect(status.hidden).toBe(true);
  expect(f.transportWrites[0]).not.toHaveBeenCalled();
  f.host.dispose();
  expect(document.querySelector(".auxiliary-status")).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
});

it("opens a later available tool, then toggles retained tools without further default requests", async () => {
  const h = hosted();
  let available = false;
  const request = vi.fn<ExtensionsBridge["request"]>(async (value) => {
    if (value.operation === "panel-default")
      return available
        ? { ok: true, openToken: token }
        : { ok: false, noticeEmpty: true };
    if (value.operation === "open") h.open("snippets", value.token);
    return { ok: true };
  });
  const f = await snippetsWindow(
    { hostedContent: h.bridge, extensions: { request } },
    false,
  );
  f.panelToggle();
  await settle();
  available = true;
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(request).toHaveBeenCalledWith({
    operation: "open",
    token,
    accepted: true,
  });
  const count = request.mock.calls.length;
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(true);
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(request).toHaveBeenCalledTimes(count);
  h.open("files");
  await settle();
  h.retire("snippets");
  await settle();
  f.panelToggle();
  await settle();
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(request).toHaveBeenCalledTimes(count);
  expect(h.bridge.close).not.toHaveBeenCalled();
});

it.each(["settings", "modal", "tool", "selection", "native-blur", "dispose"])(
  "revokes a pending empty intent on %s and never acknowledges it late",
  async (change) => {
    const h = hosted();
    let resolve!: (result: ExtensionsResult) => void;
    const prepared = new Promise<ExtensionsResult>((done) => {
      resolve = done;
    });
    const request = vi.fn<ExtensionsBridge["request"]>(async (value) =>
      value.operation === "panel-default" ? prepared : { ok: true },
    );
    const f = await snippetsWindow(
      { hostedContent: h.bridge, extensions: { request } },
      false,
    );
    f.panelToggle();
    f.panelToggle();
    expect(request).toHaveBeenCalledTimes(1); // Coalesced before preparation returns.
    if (change === "settings") f.settingsOpen();
    if (change === "modal") f.about();
    if (change === "tool") h.open("files");
    if (change === "selection") f.tabCommand({ action: "new" });
    if (change === "native-blur")
      f.tabCommand({ action: "cancel-panel-default" });
    if (change === "dispose") f.host.dispose();
    await settle();
    resolve({ ok: true, openToken: token });
    await settle();
    expect(request).toHaveBeenCalledWith({
      operation: "cancel-panel-default",
      token,
    });
    expect(
      request.mock.calls.some(([value]) => value.operation === "open"),
    ).toBe(false);
    expect(
      document.querySelector<HTMLElement>(".auxiliary-status")?.hidden ?? true,
    ).toBe(true);
  },
);

it("accepts initial child focus before publication without treating DOM blur as native window blur", async () => {
  const h = hosted();
  let publish!: () => void;
  const request = vi.fn<ExtensionsBridge["request"]>(async (value) => {
    if (value.operation === "panel-default")
      return { ok: true, openToken: token };
    if (value.operation === "open") {
      // Native WebContents creation focuses its not-yet-published child first.
      window.dispatchEvent(new Event("blur"));
      return new Promise((resolve) => {
        publish = () => {
          h.open("snippets", token);
          resolve({ ok: true });
        };
      });
    }
    return { ok: true };
  });
  const f = await snippetsWindow(
    { hostedContent: h.bridge, extensions: { request } },
    false,
  );
  f.panelToggle();
  await settle();
  expect(request).not.toHaveBeenCalledWith({
    operation: "cancel-panel-default",
    token,
  });
  publish();
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(h.bridge.close).not.toHaveBeenCalled();
});

it.each(["before-result", "after-result"])(
  "refuses stale native publication %s without selecting or focusing it",
  async (ordering) => {
    const h = hosted();
    let finish!: (result: ExtensionsResult) => void;
    const request = vi.fn<ExtensionsBridge["request"]>(async (value) => {
      if (value.operation === "panel-default")
        return { ok: true, openToken: token };
      if (value.operation === "open")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { ok: true };
    });
    const f = await snippetsWindow(
      { hostedContent: h.bridge, extensions: { request } },
      false,
    );
    f.panelToggle();
    await settle();
    if (ordering === "after-result") {
      finish({ ok: true });
      await settle();
    }
    h.open("files");
    await settle();
    const focused = document.activeElement;
    h.open("late-snippets", token);
    await settle();
    expect(h.bridge.close).toHaveBeenCalledWith("late-snippets");
    expect(f.root.getAttribute("aria-label")).toBe("files");
    expect(document.activeElement).toBe(focused);
    if (ordering === "before-result") {
      finish({ ok: true });
      await settle();
    }
  },
);

it.each(["before-result", "after-result"])(
  "rejects delayed publication after native window blur %s, without relying on DOM blur",
  async (ordering) => {
    const h = hosted();
    let finish!: (result: ExtensionsResult) => void;
    const request = vi.fn<ExtensionsBridge["request"]>(async (value) => {
      if (value.operation === "panel-default")
        return { ok: true, openToken: token };
      if (value.operation === "open")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return { ok: true };
    });
    const f = await snippetsWindow(
      { hostedContent: h.bridge, extensions: { request } },
      false,
    );
    f.panelToggle();
    await settle();
    if (ordering === "after-result") {
      finish({ ok: true });
      await settle();
    }
    f.tabCommand({ action: "cancel-panel-default" });
    const focused = document.activeElement;
    h.open("late-snippets", token);
    await settle();
    expect(f.root.hidden).toBe(true);
    expect(h.bridge.close).toHaveBeenCalledWith("late-snippets");
    expect(document.activeElement).toBe(focused);
    if (ordering === "before-result") {
      finish({ ok: true });
      await settle();
    }
  },
);

it("accepts matching publication even after the acknowledgement response", async () => {
  const h = hosted();
  const request = vi.fn<ExtensionsBridge["request"]>(async (value) =>
    value.operation === "panel-default"
      ? { ok: true, openToken: token }
      : { ok: true },
  );
  const f = await snippetsWindow(
    { hostedContent: h.bridge, extensions: { request } },
    false,
  );
  f.panelToggle();
  await settle();
  expect(f.root.hidden).toBe(true);
  h.open("snippets", token);
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(h.bridge.close).not.toHaveBeenCalled();
  expect(
    request.mock.calls.some(
      ([value]) => value.operation === "cancel-panel-default",
    ),
  ).toBe(false);
});

it("cancels after admission when intent is lost and suppresses delayed failure feedback", async () => {
  let finish!: (result: ExtensionsResult) => void;
  const request = vi.fn<ExtensionsBridge["request"]>(async (value) => {
    if (value.operation === "panel-default")
      return { ok: true, openToken: token };
    if (value.operation === "open")
      return new Promise((resolve) => {
        finish = resolve;
      });
    return { ok: true };
  });
  const f = await snippetsWindow({ extensions: { request } }, false);
  f.panelToggle();
  await settle();
  expect(request).toHaveBeenCalledWith({
    operation: "open",
    token,
    accepted: true,
  });
  f.settingsOpen();
  await settle();
  expect(request).toHaveBeenCalledWith({
    operation: "cancel-panel-default",
    token,
  });
  finish({ ok: false, noticeEmpty: true });
  await settle();
  expect(document.querySelector<HTMLElement>(".auxiliary-status")!.hidden).toBe(
    true,
  );
});
