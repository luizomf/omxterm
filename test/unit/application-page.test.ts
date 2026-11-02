// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  createApplicationPage,
  createPageButton,
} from "../../src/renderer/application-page";
import { createRendererLanguage } from "../../src/renderer/renderer-language";
import {
  base,
  button,
  deferred,
  open,
  saved,
} from "../fixtures/settings-dialog-dom";
import type { SettingsResult } from "../../src/shared/settings";

afterEach(() => document.body.replaceChildren());

it("composes optional navigation and an in-flow action without replacing supplied nodes", () => {
  const title = document.createElement("h2");
  const content = document.createElement("div");
  const action = createPageButton(document, "primary");
  const page = createApplicationPage(document, {
    title,
    content,
    actions: action,
  });
  expect(page.querySelector("header")!.children).toEqual(
    expect.objectContaining({ 0: title, 1: action }),
  );
  expect(page.querySelector(".application-page-content")).toBe(content);
  expect(page.classList.contains("has-navigation")).toBe(false);
  expect(action.type).toBe("button");
  expect(action.classList.contains("page-button-primary")).toBe(true);
});

it("omits the header when a caller supplies neither a title nor actions", () => {
  const content = document.createElement("section");
  const page = createApplicationPage(document, { content });
  expect(page.querySelector(".application-page-header")).toBeNull();
  expect(page.querySelector(".application-page-content")).toBe(content);
});

it.each(["en-US", "pt-BR"] as const)(
  "keeps symlink recovery external in %s, with retained error semantics",
  async (locale) => {
    const language = createRendererLanguage(locale);
    const view = await open(
      { snapshot: async () => ({ ...base, problem: { kind: "symlink" } }) },
      language,
    );
    const notice = view.query(".settings-problem");
    expect(notice.textContent).toBe(language.t("settings.symlinkError"));
    expect(notice.dataset.severity).toBe("error");
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.hidden).toBe(false);
    expect(
      view
        .query(".application-page-header")
        .contains(view.query(".settings-close")),
    ).toBe(true);
    language.set(locale === "en-US" ? "pt-BR" : "en-US");
    expect(view.query(".settings-problem")).toBe(notice);
    expect(notice.textContent).toBe(language.t("settings.symlinkError"));
    view.dialog.dispose();
  },
);

it.each([
  [
    "rejected",
    { status: "rejected", snapshot: base, message: "Invalid candidate" },
    "error",
  ],
  [
    "not applied",
    saved(base, { applied: false, notice: "Reload failed" }),
    "error",
  ],
  [
    "warning",
    saved(base, { applied: true, notices: ["A setting was deferred"] }),
    "warning",
  ],
  ["success", saved(base), "success"],
] as const)(
  "preserves raw %s severity across relabeling without losing the draft or focus",
  async (_name, result, severity) => {
    const language = createRendererLanguage();
    const view = await open(
      { saveText: vi.fn(async () => result as SettingsResult) },
      language,
    );
    button("Config File").click();
    const editor = view.query<HTMLTextAreaElement>("textarea");
    editor.value = "draft";
    editor.dispatchEvent(new Event("input"));
    button("Save").click();
    await view.settle();
    editor.focus();
    const draft = editor.value;
    const notice = view.query(".settings-config-file [role=status]");
    expect(notice.dataset.severity).toBe(severity);
    expect(notice.hidden).toBe(false);
    language.set("pt-BR");
    expect(view.query(".settings-config-file [role=status]")).toBe(notice);
    expect(notice.dataset.severity).toBe(severity);
    expect(editor.value).toBe(draft);
    expect(document.activeElement).toBe(editor);
    view.dialog.dispose();
  },
);

it("retains error precedence over newer unsaved typing after application failure", async () => {
  const pending = deferred<SettingsResult>();
  const language = createRendererLanguage();
  const view = await open({ saveText: () => pending.promise }, language);
  const editor = view.query<HTMLTextAreaElement>("textarea");
  button("Save").click();
  editor.value = "newer draft";
  editor.dispatchEvent(new Event("input"));
  pending.resolve(saved(base, { applied: false, notice: "Reload failed" }));
  await view.settle();
  const notice = view.query(".settings-config-file [role=status]");
  for (const locale of ["en-US", "pt-BR"] as const) {
    language.set(locale);
    expect(notice.dataset.severity).toBe("error");
    expect(notice.textContent).toContain(language.t("settings.newer"));
    expect(notice.textContent).toContain("Reload failed");
    expect(editor.value).toBe("newer draft");
  }
  view.dialog.dispose();
});

it("marks rejected raw transport distinctly, clearing severity on reload", async () => {
  const view = await open({
    saveText: vi.fn(async () => {
      throw new Error("transport");
    }),
  });
  const editor = view.query<HTMLTextAreaElement>("textarea");
  editor.value = "draft";
  editor.dispatchEvent(new Event("input"));
  button("Save").click();
  await view.settle();
  const notice = view.query(".settings-config-file [role=status]");
  expect(notice.dataset.severity).toBe("error");
  expect(editor.value).toBe("draft");
  button("Reload File").click();
  await view.settle();
  expect(notice.hidden).toBe(true);
  expect(notice.dataset.severity).toBe("info");
  view.dialog.dispose();
});
