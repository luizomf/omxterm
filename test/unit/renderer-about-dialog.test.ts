// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAboutDialog } from "../../src/renderer/about/about-dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(() => {
  document.body.replaceChildren();
});

it("coalesces pending opens and ignores metadata and link failures after dismissal/disposal", async () => {
  let resolve!: (info: {
    name: string;
    version: string;
    copyright: string;
  }) => void;
  let rejectLink!: (error: Error) => void;
  const focusTerminal = vi.fn();
  const info = vi.fn(
    () =>
      new Promise<{ name: string; version: string; copyright: string }>((r) => {
        resolve = r;
      }),
  );
  const about = createAboutDialog(document, {
    info,
    openLink: () =>
      new Promise<void>((_, reject) => {
        rejectLink = reject;
      }),
    focusTerminal,
    onActivityChange: vi.fn(),
  });
  about.open();
  about.open();
  expect(info).toHaveBeenCalledOnce();
  expect(document.querySelectorAll("dialog")).toHaveLength(1);
  expect(document.activeElement?.textContent).toBe("Close");
  document.querySelector<HTMLButtonElement>(".about-links button")!.click();
  document
    .querySelector("dialog")!
    .dispatchEvent(new Event("cancel", { cancelable: true }));
  expect(focusTerminal).toHaveBeenCalledOnce();
  resolve({ name: "stale", version: "old", copyright: "old" });
  rejectLink(new Error("private native detail"));
  await Promise.resolve();
  await Promise.resolve();
  expect(document.querySelector("dialog")).toBeNull();
  about.open();
  about.dispose();
  about.dispose();
  about.open();
  resolve({ name: "disposed", version: "old", copyright: "old" });
  await Promise.resolve();
  expect(document.querySelector("dialog")).toBeNull();
  expect(focusTerminal).toHaveBeenCalledOnce();
});

it("presents compact runtime metadata and opens only named links", async () => {
  const openLink = vi.fn(async () => {});
  const focusTerminal = vi.fn();
  const about = createAboutDialog(document, {
    info: async () => ({
      name: "OMXTerm",
      version: "7.8.9",
      copyright: "Copyright © 2026 Luiz Otávio Miranda",
    }),
    openLink,
    focusTerminal,
    onActivityChange: vi.fn(),
  });
  about.open();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("Version 7.8.9"),
  );
  expect(document.querySelector("img")?.getAttribute("src")).toBe(
    "./application-icon.png",
  );
  expect(document.body.textContent).toContain("MIT License");
  expect(document.querySelector("ul")).toBeNull();
  expect(document.body.textContent).not.toContain("Copyleft");
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    )!;
  for (const [label, link] of [
    ["Project", "website"],
    ["Contributors", "contributors"],
    ["Report an issue", "issues"],
    ["MIT License", "license"],
  ]) {
    button(label!).click();
    expect(openLink).toHaveBeenLastCalledWith(link);
    expect(about.isActive()).toBe(true);
  }
  button("Close").click();
  expect(about.isActive()).toBe(false);
  expect(document.querySelector("dialog")).toBeNull();
  expect(focusTerminal).toHaveBeenCalledOnce();
  about.dispose();
});
