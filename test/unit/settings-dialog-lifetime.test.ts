// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import type {
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";
import {
  base,
  button,
  deferred,
  installSettingsDom,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => document.body.replaceChildren());

it.each(["conflict", "failed", "transport"] as const)(
  "keeps newer raw edits and the original base after a %s save",
  async (status) => {
    const pending = deferred<SettingsResult>();
    const view = await open({ saveText: vi.fn(() => pending.promise) });
    const editor = view.query<HTMLTextAreaElement>("textarea");
    editor.value = "draft A";
    editor.dispatchEvent(new Event("input"));
    button("Save").click();
    editor.value = "draft B";
    editor.dispatchEvent(new Event("input"));
    if (status === "transport") pending.reject(new Error("transport"));
    else
      pending.resolve({
        status,
        message: "not saved",
        snapshot: { ...base, revision: "r3" },
      });
    await view.settle();
    expect(editor.value).toBe("draft B");
    expect(button("Save").disabled).toBe(false);
    button("Save").click();
    expect(view.bridge.saveText).toHaveBeenLastCalledWith("draft B", "r1");
  },
);

it("shows a failed Reload File without losing the draft and allows recovery", async () => {
  const view = await open({
    snapshot: vi
      .fn()
      .mockResolvedValueOnce(base)
      .mockRejectedValueOnce(new Error("read"))
      .mockResolvedValueOnce({ ...base, text: "fresh file", revision: "r2" }),
  });
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = "draft";
  editor.dispatchEvent(new Event("input"));
  button("Reload File").click();
  await view.settle();
  expect(editor.value).toBe("draft");
  expect(
    view.query(".settings-config-file [role=status]").textContent,
  ).toContain("could not be reloaded");
  expect(button("Save").disabled).toBe(false);
  button("Reload File").click();
  await view.settle();
  expect(editor.value).toBe("fresh file");
  button("Save").click();
  expect(view.bridge.saveText).toHaveBeenLastCalledWith("fresh file", "r2");
});

it.each(["save", "reload", "graphical"] as const)(
  "does not adopt a late %s completion after close and reopen",
  async (route) => {
    const result = deferred<SettingsResult>();
    const snapshot = deferred<SettingsSnapshot>();
    const view = await open({
      saveText: () => result.promise,
      change: () => result.promise,
      snapshot: vi.fn().mockResolvedValue(base),
    });
    if (route === "save") button("Save").click();
    else if (route === "reload") {
      vi.mocked(view.bridge.snapshot).mockReturnValueOnce(snapshot.promise);
      button("Reload File").click();
    } else {
      view.field("Font size").value = "18";
      view.field("Font size").dispatchEvent(new Event("change"));
    }
    await view.settle();
    button("Close").click();
    // Use a fresh immediate read for reopening; the old deferred operation still
    // belongs exclusively to the removed view.
    vi.mocked(view.bridge.snapshot).mockResolvedValue(base);
    await view.dialog.open();
    const editor = view.query<HTMLTextAreaElement>("textarea");
    editor.value = "new view draft";
    editor.dispatchEvent(new Event("input"));
    result.resolve(
      saved({ ...base, text: "old saved bytes", revision: "old" }),
    );
    snapshot.resolve({ ...base, text: "old read bytes", revision: "old" });
    await view.settle();
    expect(editor.value).toBe("new view draft");
    expect(view.field("Font size").value).toBe("16");
    expect(view.status()).toBe("");
  },
);

it("keeps the newest queued same-field change until its own rejection", async () => {
  const first = deferred<SettingsResult>();
  const second = deferred<SettingsResult>();
  const view = await open({
    change: vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise),
  });
  const size = view.field("Font size");
  size.value = "18";
  size.dispatchEvent(new Event("change"));
  size.value = "19";
  size.dispatchEvent(new Event("change"));
  const snapshot = { ...base, values: { ...base.values, "font.size": 18 } };
  first.resolve(saved(snapshot));
  await view.settle();
  expect(size.value).toBe("19");
  second.resolve({ status: "rejected", message: "rejected", snapshot });
  await view.settle();
  expect(size.value).toBe("18");
});

it("keeps pending toggle and choice changes across another control's response", async () => {
  const first = deferred<SettingsResult>();
  const second = deferred<SettingsResult>();
  const third = deferred<SettingsResult>();
  const view = await open({
    change: vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(third.promise),
  });
  const size = view.field("Font size");
  size.value = "18";
  size.dispatchEvent(new Event("change"));
  const toggle = view.field("Programming ligatures");
  toggle.checked = false;
  toggle.dispatchEvent(new Event("change"));
  const choice = view.field("Log level");
  choice.value = "debug";
  choice.dispatchEvent(new Event("change"));
  first.resolve(saved(base));
  await view.settle();
  expect(toggle.checked).toBe(false);
  expect(choice.value).toBe("debug");
  second.resolve(
    saved({ ...base, values: { ...base.values, "font.ligatures": false } }),
  );
  await view.settle();
  expect(choice.value).toBe("debug");
  third.resolve(
    saved({
      ...base,
      values: { ...base.values, "font.ligatures": false, logLevel: "debug" },
    }),
  );
  await view.settle();
  expect(choice.value).toBe("debug");
});
