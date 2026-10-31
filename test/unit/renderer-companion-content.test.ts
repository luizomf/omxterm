// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { fixture, settle, deferred } from "../fixtures/companion-content";
import {
  snippetsWindow,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";

afterEach(() => {
  cleanupSnippetsWindows();
  vi.unstubAllGlobals();
});

it.each([false, true])(
  "retains admitted Settings destination through native hide (superseded: %s)",
  async (superseded) => {
    const f = await fixture();
    vi.stubGlobal("omxterm", {
      extensions: {
        request: vi.fn(async () => ({
          ok: false,
          error: "runtime-unavailable",
        })),
      },
    });
    f.settingsOpen();
    await settle();
    document
      .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
      .click();
    f.tabCommand({ action: "select", position: 1 });
    await settle();
    f.open("files");
    await settle();
    const hide = deferred<boolean>();
    vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
    f.tabCommand({ action: "snippets-management" });
    expect(
      document.querySelector('.settings-tabs [aria-selected="true"]')?.id,
    ).toBe("settings-tab-config-file");
    if (superseded) f.tabCommand({ action: "select", position: 1 });
    hide.resolve(true);
    await settle();
    if (superseded) {
      expect(
        document.querySelector('.settings-tabs [aria-selected="true"]')?.id,
      ).toBe("settings-tab-config-file");
      f.settingsOpen();
      await settle();
      expect(
        document.querySelector('.settings-tabs [aria-selected="true"]')?.id,
      ).toBe("settings-tab-config-file");
    } else {
      expect(
        document.querySelector('.settings-tabs [aria-selected="true"]')?.id,
      ).toBe("settings-tab-extensions");
      expect(
        document.querySelector<HTMLElement>(".settings-snippets-notice")!
          .hidden,
      ).toBe(false);
      expect(document.activeElement?.id).toBe("settings-tab-extensions");
    }
  },
);

it("owns an empty Auxiliary Panel without enabling Snippets", async () => {
  const { root, host, load } = await snippetsWindow({}, false);
  expect(root.hidden).toBe(true);
  expect(root.classList.contains("auxiliary-panel")).toBe(true);
  expect(root.querySelector(".auxiliary-close")).not.toBeNull();
  expect(root.querySelector(".auxiliary-hide")).not.toBeNull();
  expect(document.querySelectorAll(".auxiliary-separator")).toHaveLength(1);
  expect(root.querySelector(".auxiliary-body")!.children).toHaveLength(0);
  expect(document.querySelector(".snippet-preview")).toBeNull();
  expect(load).not.toHaveBeenCalled();
  host.dispose();
  host.dispose();
  expect(root.children).toHaveLength(0);
  expect(document.querySelector(".auxiliary-separator")).toBeNull();
  expect(document.querySelector(".auxiliary-status")).toBeNull();
});

it("retains exclusive tools outside Application Tabs and repeat opens reuse the same slot", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const files = f.root.querySelector(".companion-native-slot");
  expect(f.root.hidden).toBe(false);
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(0);
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(1);
  f.open();
  await settle();
  expect(f.root.querySelectorAll(".companion-native-slot")).toHaveLength(1);
  expect(f.root.querySelector(".companion-native-slot")).toBe(files);
  f.open("ssh");
  await settle();
  expect((files as HTMLElement).hidden).toBe(true);
  f.tool("files").click();
  await settle();
  expect((files as HTMLElement).hidden).toBe(false);
  expect(f.tool("Snippets")).toBeUndefined();
  f.toggle();
  await settle();
  await vi.waitFor(() => expect(f.root.querySelector("input")).not.toBeNull());
  const query = f.root.querySelector("input")!;
  query.value = "retained";
  query.dispatchEvent(new Event("input", { bubbles: true }));
  f.tool("files").click();
  await settle();
  f.tool("Snippets").click();
  await settle();
  expect(f.root.querySelector("input")).toBe(query);
  expect(query.value).toBe("retained");
  f.root.querySelector<HTMLButtonElement>(".auxiliary-hide")!.click();
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.bridge.close).not.toHaveBeenCalled();
  f.open();
  await settle();
  expect(f.root.querySelector(".companion-native-slot")).toBe(files);
  expect(f.adapters).toHaveBeenCalledOnce();
});

it("closes the selected companion toggle and opens a fresh slot, but reveals nonselected tools", async () => {
  const f = await fixture();
  f.open("optional-snippets");
  await settle();
  const slot = f.root.querySelector(".companion-native-slot");
  expect(f.root.hidden).toBe(false);
  f.open("optional-snippets", true, true);
  await settle();
  expect(f.root.hidden).toBe(true);
  f.open("optional-snippets", true, true);
  await settle();
  expect(f.root.hidden).toBe(false);
  const reopened = f.root.querySelector(".companion-native-slot");
  expect(reopened).not.toBe(slot);
  expect(f.root.querySelectorAll(".companion-native-slot")).toHaveLength(1);
  expect(f.bridge.close).toHaveBeenCalledExactlyOnceWith("optional-snippets");
  f.open("files");
  await settle();
  f.open("optional-snippets", true, true);
  await settle();
  expect(f.root.hidden).toBe(false);
  expect((reopened as HTMLElement).hidden).toBe(false);
  expect(f.bridge.close).toHaveBeenCalledOnce();
});

it("closes only after native retirement and hide acknowledgement, coalescing duplicate completion", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.open("files");
  await settle();
  const close = deferred<void>();
  vi.mocked(f.bridge.close).mockReturnValueOnce(close.promise);
  const button = f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!;
  f.surfaces[0]!.focus.mockClear();
  button.click();
  button.click();
  f.open("files", true, true);
  expect(f.bridge.close).toHaveBeenCalledExactlyOnceWith("files");
  expect(f.root.hidden).toBe(false);
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockReturnValueOnce(hide.promise);
  f.retire("files");
  expect(f.root.hidden).toBe(false);
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  hide.resolve(true);
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.tool("files")).toBeUndefined();
  expect(f.tool("ssh")).toBeDefined();
  expect(f.surfaces[0]!.focus).toHaveBeenCalledOnce();
  close.resolve();
  await settle();
  expect(f.surfaces[0]!.focus).toHaveBeenCalledOnce();
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
  f.open("files-new");
  await settle();
  expect(f.root.hidden).toBe(false);
});

it.each(["close", "hide", "terminal"])(
  "does not let stale %s completion hide or focus over a newer selection",
  async (phase) => {
    const f = await fixture();
    f.open("files");
    await settle();
    const close = deferred<void>();
    vi.mocked(f.bridge.close).mockReturnValueOnce(close.promise);
    f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!.click();
    const hide = deferred<boolean>();
    if (phase !== "close") {
      vi.mocked(f.bridge.present).mockReturnValueOnce(hide.promise);
      f.retire("files");
    }
    if (phase === "terminal") f.tabCommand({ action: "new" });
    else f.open("ssh");
    await settle();
    for (const surface of f.surfaces) surface.focus.mockClear();
    close.resolve();
    hide.resolve(true);
    await settle();
    expect(f.root.hidden).toBe(phase === "terminal");
    if (phase !== "terminal")
      expect(f.root.querySelector("h2")!.textContent).toBe("ssh");
    expect(f.tool("files")).toBeUndefined();
    for (const surface of f.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
    if (phase === "terminal") {
      f.toggle();
      await settle();
      expect(f.root.querySelector("h2")?.textContent).toBe("Snippets");
      expect(f.root.hidden).toBe(false);
    }
  },
);

it.each(
  ["resolve", "reject"].flatMap((outcome) =>
    ["before", "after"].flatMap((order) =>
      ["ack", "refuse", "reject"].map((hideOutcome) => ({
        outcome,
        order,
        hideOutcome,
      })),
    ),
  ),
)(
  "settles activation only on safe retirement ACK ($outcome handoff $order $hideOutcome hide)",
  async ({ outcome, order, hideOutcome }) => {
    const f = await fixture();
    f.tabCommand({ action: "new" });
    await settle();
    f.open();
    await settle();
    vi.mocked(f.bridge.close).mockReturnValueOnce(deferred<void>().promise);
    f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!.click();
    const handoff = deferred<boolean>();
    vi.mocked(f.bridge.present).mockReturnValueOnce(
      handoff.promise.then(() => {
        if (outcome === "reject")
          throw new Error("Unknown active hosted content");
        return true;
      }),
    );
    f.tabCommand({ action: "previous" });
    await settle();
    const hide = deferred<boolean>();
    vi.mocked(f.bridge.present).mockReturnValueOnce(
      hide.promise.then((accepted) => {
        if (hideOutcome === "reject") throw new Error("Hide failed");
        return accepted;
      }),
    );
    f.retire("files");
    if (order === "before") handoff.resolve(true);
    await settle();
    f.toggle();
    expect(f.root.querySelector("input")).toBeNull();
    hide.resolve(hideOutcome !== "refuse");
    await settle();
    if (order === "after") handoff.resolve(true);
    await settle();
    f.toggle();
    await settle();
    if (hideOutcome === "ack") {
      expect(f.root.hidden).toBe(false);
      expect(f.root.querySelector("h2")?.textContent).toBe("Snippets");
    } else {
      expect(f.root.querySelector("input")).toBeNull();
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        "could not",
      );
      expect(f.tool("files")).toBeDefined();
    }
  },
);

it.each(["previous", "same", "overlay", "control"])(
  "does not restore close-time focus after a newer %s intent",
  async (intent) => {
    const f = await fixture();
    f.tabCommand({ action: "new" });
    await settle();
    f.open();
    await settle();
    vi.mocked(f.bridge.close).mockReturnValueOnce(deferred<void>().promise);
    f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!.click();
    if (intent === "previous") f.tabCommand({ action: "previous" });
    else if (intent === "same") f.tabCommand({ action: "select", position: 2 });
    else if (intent === "overlay") f.about();
    else f.root.querySelector<HTMLButtonElement>(".auxiliary-hide")!.focus();
    await settle();
    for (const surface of f.surfaces) surface.focus.mockClear();
    f.retire("files");
    await settle();
    for (const surface of f.surfaces)
      expect(surface.focus).not.toHaveBeenCalled();
    expect(f.tool("files")).toBeUndefined();
  },
);

it("keeps close failure visible and does not issue a second close or revive its slot", async () => {
  const f = await fixture();
  f.open();
  await settle();
  vi.mocked(f.bridge.close).mockRejectedValueOnce(new Error("failed"));
  f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!.click();
  await settle();
  f.open("files", true, true);
  expect(f.bridge.close).toHaveBeenCalledOnce();
  expect(f.tool("files")).toBeDefined();
  expect(document.querySelector('[role="status"]')!.textContent).toContain(
    "could not",
  );
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it.each(["settings", "modal"])(
  "ignores companion toggle while %s blocks presentation",
  async (blocker) => {
    const f = await fixture();
    f.open("optional-snippets");
    await settle();
    if (blocker === "settings") f.settingsOpen();
    else f.about();
    await settle();
    vi.mocked(f.bridge.present).mockClear();
    f.open("optional-snippets", true, true);
    await settle();
    expect(
      vi
        .mocked(f.bridge.present)
        .mock.calls.some(
          ([request]) =>
            request.id === "optional-snippets" && request.focus === true,
        ),
    ).toBe(false);
    if (blocker === "settings") {
      expect(f.root.hidden).toBe(true);
      f.tabCommand({ action: "select", position: 1 });
      await settle();
      expect(f.root.hidden).toBe(false);
    } else {
      expect(document.querySelector(".about-dialog")).not.toBeNull();
    }
  },
);

it("keeps panel pixels across terminal changes and awaits core focus before activating the new terminal", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const handoff = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => handoff.promise);
  vi.mocked(f.bridge.present).mockClear();
  f.tabCommand({ action: "new" });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0]).toMatchObject({
    id: "files",
    focus: "core",
  });
  expect(f.surfaces[1]!.focus).not.toHaveBeenCalled();
  handoff.resolve(true);
  await settle();
  expect(f.surfaces[1]!.focus).toHaveBeenCalled();
  f.tabCommand({ action: "previous" });
  await settle();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.every(([request]) => request.id === "files"),
  ).toBe(true);
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it("settles a refused core focus handoff without focus theft or poisoning later selections", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  vi.mocked(f.bridge.present).mockResolvedValueOnce("focus-unavailable");
  f.tabCommand({ action: "new" });
  await settle();
  expect(f.surfaces[1]!.focus).not.toHaveBeenCalled();
  expect(document.querySelectorAll(".terminal-tab:not([hidden])")).toHaveLength(
    1,
  );
  expect(document.querySelector('[role="status"]')?.textContent).not.toContain(
    "could not",
  );
  f.toggle();
  await settle();
  f.tool("ssh").click();
  await settle();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0]).toMatchObject({
    id: "ssh",
    focus: true,
  });
  expect(f.root.hidden).toBe(false);
});

it("suspends for Settings and ordinary hosted tabs and restores the retained tool on terminal return", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const slot = f.root.querySelector(".companion-native-slot");
  f.settingsOpen();
  await settle();
  expect(f.root.hidden).toBe(true);
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.querySelector(".companion-native-slot")).toBe(slot);
  f.open("general", false);
  await settle();
  expect(document.querySelectorAll(".hosted-content-tab")).toHaveLength(1);
  expect(f.root.hidden).toBe(true);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("general");
  f.tabCommand({ action: "select", position: 1 });
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
});

it("waits for modal hide, ignores late tool opens, and retires hidden tools without touching the selected terminal", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  expect(document.querySelector(".about-dialog")).toBeNull();
  f.open("late");
  await settle();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.id === "late"),
  ).toBe(false);
  hide.resolve(true);
  await settle();
  expect(document.querySelector(".about-dialog")).not.toBeNull();
  f.open("ssh");
  await settle();
  expect(f.tool("ssh")).toBeDefined();
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.id === "ssh"),
  ).toBe(false);
  f.retire("ssh");
  await settle();
  expect(f.tool("ssh")).toBeUndefined();
  document.querySelector<HTMLButtonElement>(".about-close")!.click();
  await settle();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
  f.retire("files");
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});

it("keeps a pending Snippets selection when a hidden native tool retires", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.open("files");
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.toggle();
  f.retire("ssh");
  hide.resolve(true);
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.querySelector("h2")?.textContent).toBe("Snippets");
  expect(f.tool("ssh")).toBeUndefined();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBeNull();
});

it("keeps a pending Files selection when the previously selected SSH tool retires", async () => {
  const f = await fixture();
  f.open("files");
  await settle();
  f.open("ssh");
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.tool("files").click();
  f.retire("ssh");
  hide.resolve(true);
  await settle();
  expect(f.root.hidden).toBe(false);
  expect(f.root.querySelector("h2")?.textContent).toBe("files");
  expect(f.tool("ssh")).toBeUndefined();
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0]).toMatchObject({
    id: "files",
    focus: true,
  });
});

it("drops a stale overlay continuation after terminal selection changes", async () => {
  const f = await fixture();
  f.open();
  await settle();
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.about();
  f.tabCommand({ action: "new" });
  await settle();
  hide.resolve(true);
  await settle();
  expect(document.querySelector(".about-dialog")).toBeNull();
  expect(f.root.hidden).toBe(false);
  expect(vi.mocked(f.bridge.present).mock.lastCall?.[0].id).toBe("files");
});

it("keeps a late SSH transfer in the background when its panel no longer owns focus", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.focus(null);
  f.surfaces[0]!.focus.mockClear();
  f.tabCommand({
    action: "open-ssh",
    token: "background",
    sourceView: "ssh",
    title: "SSH",
  });
  await settle();
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(2);
  expect(document.querySelectorAll(".terminal-tab:not([hidden])")).toHaveLength(
    1,
  );
  expect(f.surfaces[1]!.focus).not.toHaveBeenCalled();
  expect(f.root.hidden).toBe(false);
  expect(f.sshPane).toHaveBeenCalledWith("background", true);
});

it("dismisses the native companion only after acknowledged hiding and ignores stale dismissals", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.open("files");
  await settle();
  f.surfaces[0]!.focus.mockClear();
  f.dismiss("ssh");
  await settle();
  expect(f.root.hidden).toBe(false);
  const hide = deferred<boolean>();
  vi.mocked(f.bridge.present).mockImplementationOnce(() => hide.promise);
  f.dismiss("files");
  expect(f.root.hidden).toBe(false);
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  hide.resolve(true);
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.surfaces[0]!.focus).toHaveBeenCalled();
  expect(f.bridge.close).not.toHaveBeenCalled();
  f.open("files");
  await settle();
  expect(f.root.hidden).toBe(false);
});

it("fails closed when a native panel refuses the overlay hide", async () => {
  const f = await fixture();
  f.open();
  await settle();
  vi.mocked(f.bridge.present).mockResolvedValueOnce(false);
  f.about();
  await settle();
  expect(document.querySelector(".about-dialog")).toBeNull();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not",
  );
});

it("counts native focus for page activation and opens SSH in a new focused terminal without hiding the panel", async () => {
  const f = await fixture();
  f.open("ssh");
  await settle();
  f.surfaces[0]!.focus.mockClear();
  window.dispatchEvent(new Event("focus"));
  expect(f.surfaces[0]!.focus).not.toHaveBeenCalled();
  vi.mocked(f.bridge.present).mockClear();
  f.tabCommand({
    action: "open-ssh",
    token: "token-a",
    sourceView: "ssh",
    title: "SSH",
  });
  await settle();
  expect(document.querySelectorAll(".terminal-tab")).toHaveLength(2);
  expect(f.sshPane).toHaveBeenCalledWith("token-a", true);
  expect(f.surfaces[1]!.focus).toHaveBeenCalled();
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
  expect(f.root.hidden).toBe(false);
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.every(([request]) => request.id === "ssh"),
  ).toBe(true);
  expect(
    vi
      .mocked(f.bridge.present)
      .mock.calls.some(([request]) => request.focus === "core"),
  ).toBe(true);
  f.retire("ssh");
  await settle();
  expect(f.surfaces[1]!.dispose).not.toHaveBeenCalled();
});
