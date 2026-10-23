// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTranslator } from "../../src/shared/i18n";
import {
  createToaster,
  createWorkspaceSidebar,
} from "../../src/renderer/workspace-sidebar";

function panel() {
  const element = document.createElement("section");
  return { element, activate: vi.fn(), dispose: vi.fn() };
}

describe("workspace sidebar", () => {
  it("adds no DOM until it is opened, then creates panels lazily", () => {
    document.body.innerHTML = "";
    const root = document.createElement("aside");
    document.body.append(root);
    const sessions = panel();
    const create = vi.fn(() => sessions);
    const focusTerminal = vi.fn();
    const sidebar = createWorkspaceSidebar(root, {
      translator: createTranslator("en"),
      focusTerminal,
      panels: [{ id: "sessions", label: "sidebar.sessions", create }],
    });
    expect(root.hidden).toBe(true);
    expect(root.childElementCount).toBe(0);
    expect(document.querySelector("[role=tab]")).toBeNull();
    expect(create).not.toHaveBeenCalled();

    sidebar.toggle("sessions");
    expect(root.hidden).toBe(false);
    expect(root.querySelector(".workspace-sidebar-title")?.textContent).toBe(
      "Sessions",
    );
    expect(create).toHaveBeenCalledOnce();
    expect(sessions.activate).toHaveBeenCalledOnce();

    root.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(root.hidden).toBe(true);
    expect(focusTerminal).toHaveBeenCalledOnce();
    sidebar.toggle("sessions");
    sidebar.toggle("sessions");
    expect(create).toHaveBeenCalledOnce();
    sidebar.dispose();
    expect(sessions.dispose).toHaveBeenCalledOnce();
  });

  it("creates its live region only when a message arrives", () => {
    document.body.innerHTML = "";
    const toaster = createToaster(document);
    expect(document.querySelector(".omx-toasts")).toBeNull();
    toaster.notify("Imported 2 hosts.");
    expect(document.querySelector("[role=status]")?.textContent).toBe(
      "Imported 2 hosts.",
    );
    toaster.dispose();
    expect(document.querySelector(".omx-toasts")).toBeNull();
  });
});
