// @vitest-environment jsdom
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";

vi.mock("electron", () => ({}));
const require = createRequire(import.meta.url);
const { filesPublicManagementState } =
  require("../fixtures/files-packaged.cjs") as {
    filesPublicManagementState(
      document: Document,
      generation: number,
      state: string,
      action?: string,
      click?: boolean,
      local?: string,
      version?: string,
    ): boolean;
  };

it("checks and acts only on the exact Files management row and captured generation", () => {
  document.body.innerHTML = `<div class="extensions-panel"><section><h3>Other · 1.0.0</h3><p>other.tool · generation 3 · enabled · local dormant · other instances unknown</p><button>Disable</button></section><section><h3>Files — ARM64 preview · 0.6.0</h3><p>omxterm.files · generation 1 · enabled · local dormant · other instances unknown</p><button>Disable</button></section></div>`;
  const buttons = document.querySelectorAll("button");
  const other = vi.fn(),
    files = vi.fn();
  buttons[0]!.addEventListener("click", other);
  buttons[1]!.addEventListener("click", files);
  expect(
    filesPublicManagementState(document, 1, "enabled", "Disable", true),
  ).toBe(true);
  expect(files).toHaveBeenCalledOnce();
  expect(other).not.toHaveBeenCalled();
  expect(
    filesPublicManagementState(document, 3, "enabled", "Disable", true),
  ).toBe(false);
  expect(
    filesPublicManagementState(document, 1, "disabled", "Disable", true),
  ).toBe(false);
  buttons[1]!.disabled = true;
  expect(
    filesPublicManagementState(document, 1, "enabled", "Disable", true),
  ).toBe(false);
  expect(files).toHaveBeenCalledOnce();
  document.body.replaceChildren();
});

it("requires the exact Files0.7 generation and dormant state", () => {
  document.body.innerHTML = `<div class="extensions-panel"><section><h3>Files — ARM64 preview · 0.7.0</h3><p>omxterm.files · generation 1 · enabled · local dormant · other instances unknown</p><button>Disable</button></section></div>`;
  expect(
    filesPublicManagementState(
      document,
      1,
      "enabled",
      "Disable",
      false,
      "dormant",
      "0.7.0",
    ),
  ).toBe(true);
  expect(filesPublicManagementState(document, 1, "enabled", "Disable")).toBe(
    false,
  );
  expect(
    filesPublicManagementState(
      document,
      1,
      "enabled",
      "Disable",
      false,
      "active",
      "0.7.0",
    ),
  ).toBe(false);
  expect(
    filesPublicManagementState(
      document,
      2,
      "enabled",
      "Disable",
      false,
      "dormant",
      "0.7.0",
    ),
  ).toBe(false);
  document.body.replaceChildren();
});

it("disables the exact active second generation without accepting dormant state", () => {
  document.body.innerHTML = `<div class="extensions-panel"><section><h3>Files — ARM64 preview · 0.6.0</h3><p>omxterm.files · generation 2 · enabled · local active · other instances unknown</p><button>Disable</button></section></div>`;
  const clicked = vi.fn();
  document.querySelector("button")!.addEventListener("click", clicked);
  expect(
    filesPublicManagementState(document, 2, "enabled", "Disable", false),
  ).toBe(false);
  expect(
    filesPublicManagementState(
      document,
      2,
      "enabled",
      "Disable",
      true,
      "active",
    ),
  ).toBe(true);
  expect(clicked).toHaveBeenCalledOnce();
  document.body.replaceChildren();
});

it("refuses duplicate, hidden or misidentified Files rows and recognizes only the exact tombstone", () => {
  document.body.innerHTML = `<div class="extensions-panel"><section><h3>Files — ARM64 preview · 0.6.0</h3><p>omxterm.files · generation 2 · enabled · local dormant · other instances unknown</p><button>Disable</button></section></div>`;
  const row = document.querySelector("section")!;
  expect(filesPublicManagementState(document, 2, "enabled", "Disable")).toBe(
    true,
  );
  row.after(row.cloneNode(true));
  expect(filesPublicManagementState(document, 2, "enabled", "Disable")).toBe(
    false,
  );
  row.nextElementSibling!.remove();
  row.setAttribute("hidden", "");
  expect(filesPublicManagementState(document, 2, "enabled", "Disable")).toBe(
    false,
  );
  row.removeAttribute("hidden");
  row.querySelector("h3")!.textContent = "Other Files · 0.6.0";
  expect(filesPublicManagementState(document, 2, "enabled", "Disable")).toBe(
    false,
  );
  row.querySelector("p")!.textContent =
    "omxterm.files · generation 5 · uninstalled · local dormant · other instances unknown";
  expect(filesPublicManagementState(document, 5, "uninstalled")).toBe(true);
  expect(filesPublicManagementState(document, 4, "uninstalled")).toBe(false);
  document.body.replaceChildren();
});
