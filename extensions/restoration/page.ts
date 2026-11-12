import {
  isSavedLayout,
  type SavedLayout,
} from "../../src/shared/terminal-layout.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";
import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";
import { errorCode, isStateDocument, type StateDocument } from "./document.js";
import { bindReleasedOpen } from "./open-gesture.js";
import { createRestorationPage, type PageNotice } from "./ui.js";

export interface RestorationBridge extends Partial<AppearanceBridge> {
  request(value: unknown): Promise<unknown>;
  onVisibility(listener: (visible: boolean) => void): () => void;
  onLanguage?(listener: (language: SupportedLanguage) => void): () => void;
}

const notice = (
  text: PageNotice["text"],
  severity: PageNotice["severity"] = "info",
): PageNotice => ({ text, severity });

/**
 * Save and Open are explicit. A write that conflicts or whose outcome is
 * unknown is never retried; the page reads the saved state again and shows it.
 */
export function mountRestorationPage(
  document: Document,
  bridge: RestorationBridge,
) {
  const ui = createRestorationPage(document);
  const unsubscribeAppearance = bridge.onAppearance
    ? mountHostedAppearance(document, bridge as AppearanceBridge)
    : () => {};
  const unsubscribeLanguage =
    bridge.onLanguage?.((language) => ui.language(language)) ?? (() => {});
  const lifetime = new document.defaultView!.AbortController();
  let displayed: StateDocument | undefined;
  let pending = false;
  let visible = false;
  let disposed = false;
  let available = false;
  let loaded = false;
  // Hiding the page cancels a Save between capture and write.
  let generation = 0;
  const sync = () =>
    ui.update({ state: displayed, available, pending, visible });
  const openSnapshot = () =>
    !pending && visible && !disposed && available
      ? displayed?.status === "saved"
        ? (displayed.value ?? undefined)
        : undefined
      : undefined;
  const gesture = bindReleasedOpen(
    document,
    ui.buttons.open,
    openSnapshot,
    (value) => {
      void run(() => open(value));
    },
  );
  const adopt = (state: StateDocument) => {
    gesture.cancel();
    displayed = JSON.parse(JSON.stringify(state)) as StateDocument;
    ui.update({ failed: false });
  };
  async function run(work: () => Promise<void>, requireVisible = true) {
    if (pending || disposed || (requireVisible && !visible)) return;
    pending = true;
    sync();
    try {
      await work();
    } finally {
      pending = false;
      if (!disposed) sync();
    }
  }
  async function read() {
    gesture.cancel();
    let reply: unknown;
    try {
      reply = await bridge.request({ operation: "read" });
    } catch {
      reply = undefined;
    }
    if (disposed) return;
    if (isStateDocument(reply)) adopt(reply);
    else {
      displayed = undefined;
      ui.update({ failed: true });
    }
  }
  async function replace(expectedRevision: string, value: SavedLayout | null) {
    let reply: unknown;
    try {
      reply = await bridge.request({
        operation: "replace",
        expectedRevision,
        value,
      });
    } catch {
      reply = { error: "outcome-unknown" };
    }
    if (disposed) return;
    if (
      isStateDocument(reply) &&
      reply.revision !== expectedRevision &&
      reply.status === (value === null ? "empty" : "saved")
    ) {
      adopt(reply);
      return;
    }
    const code = isStateDocument(reply) ? "outcome-unknown" : errorCode(reply);
    ui.notify(
      code === "conflict"
        ? notice((m) => m.conflict, "warning")
        : code === "outcome-unknown" || code === "unavailable"
          ? notice((m) => m.writeUnknown, "warning")
          : notice((m) => m.writeFailed, "error"),
    );
    // Show what is actually saved now; never resubmit the write.
    await read();
  }
  async function save() {
    if (!displayed || !available) return;
    gesture.cancel();
    ui.notify();
    const expectedRevision = displayed.revision;
    const intent = generation;
    let captured: unknown;
    try {
      captured = await bridge.request({
        operation: "terminal.captureLayout.v1",
      });
    } catch {
      captured = undefined;
    }
    if (disposed || !visible || generation !== intent) return;
    if (!isSavedLayout(captured)) {
      ui.notify(notice((m) => m.captureFailed, "error"));
      return;
    }
    await replace(expectedRevision, captured);
  }
  async function forget() {
    if (!displayed || displayed.status === "empty") return;
    gesture.cancel();
    ui.notify();
    await replace(displayed.revision, null);
  }
  async function open(layout: SavedLayout) {
    ui.notify();
    let reply: unknown;
    try {
      reply = await bridge.request({
        operation: "terminal.openLayout.v1",
        layout,
      });
    } catch {
      reply = undefined;
    }
    if (disposed) return;
    const record =
      reply && typeof reply === "object"
        ? (reply as Record<string, unknown>)
        : {};
    if (record.ok === true && record.status === "accepted") {
      const fallbacks =
        typeof record.fallbacks === "number" ? record.fallbacks : 0;
      if (fallbacks > 0) ui.notify(notice((m) => m.fallbacks(fallbacks)));
    } else if (
      record.ok === false &&
      ["busy", "invalid-layout", "unavailable"].includes(errorCode(reply))
    )
      ui.notify(notice((m) => m.openFailed, "error"));
    else ui.notify(notice((m) => m.openUnknown, "warning"));
  }
  for (const [name, action] of [
    ["save", save],
    ["forget", forget],
    ["retry", read],
  ] as const)
    ui.buttons[name].addEventListener(
      "click",
      () => {
        void run(action);
      },
      { signal: lifetime.signal },
    );
  const focusAction = () => {
    if (disposed || !visible) return;
    [ui.buttons.open, ui.buttons.save, ui.buttons.retry]
      .find((button) => !button.hidden && !button.disabled)
      ?.focus();
  };
  const unsubscribeVisibility = bridge.onVisibility((next) => {
    if (visible === next) return;
    visible = next;
    if (!next) {
      generation++;
      gesture.cancel();
    }
    sync();
    if (!next || disposed) return;
    // Another window may have saved while this page was hidden. Focus the
    // main action once the buttons are enabled again.
    if (loaded) void run(read).then(focusAction);
  });
  sync();
  const ready = run(async () => {
    let capabilities: unknown;
    try {
      capabilities = await bridge.request({ operation: "host.capabilities" });
    } catch {
      capabilities = undefined;
    }
    if (disposed) return;
    const declared: unknown[] =
      capabilities &&
      typeof capabilities === "object" &&
      "capabilities" in capabilities &&
      Array.isArray(capabilities.capabilities)
        ? capabilities.capabilities
        : [];
    available = ["terminal.captureLayout.v1", "terminal.openLayout.v1"].every(
      (name) => declared.includes(name),
    );
    ui.update({ reopens: declared.includes("terminal.reopenLayout.v1") });
    if (declared.includes("links.open.v1"))
      ui.learnMore(() => {
        void bridge
          .request({ operation: "links.open.v1", link: "docs" })
          .catch(() => {});
      });
    if (!available) ui.notify(notice((m) => m.unsupported, "warning"));
    await read();
    loaded = true;
  }, false).then(focusAction);
  return {
    ready,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribeVisibility();
      unsubscribeLanguage();
      unsubscribeAppearance();
      gesture.dispose();
      lifetime.abort();
      ui.page.remove();
    },
  };
}
