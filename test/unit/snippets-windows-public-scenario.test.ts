// @vitest-environment jsdom
import { createRequire } from "node:module";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const scenario =
  require("../fixtures/snippets-windows-public-scenario.cjs") as {
    selectPublicCatalogAction(
      document: Document,
      action: string,
    ): HTMLButtonElement;
    managementState(
      document: Document,
      generation: number,
      installed: string,
      local: string,
      action: string | null,
    ): boolean;
    inspectPublicInput(
      session: object,
      offset: number,
      expected: string,
      run: number,
      ping: number,
    ): object;
  };

function catalog() {
  document.body.innerHTML = `<section class="extensions-panel"><section class="extension-catalog-card"><h4>Snippets — Linux, macOS and Windows ARM64 preview · 0.1.0</h4><button>Install</button></section><section class="extension-catalog-card"><h4>Other · 1.0</h4><button disabled>Install</button></section></section>`;
  for (const element of document.querySelectorAll("*")) {
    Object.defineProperty(element, "getClientRects", {
      configurable: true,
      value: () => [{ width: 20, height: 20 }],
    });
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ width: 20, height: 20 }),
    });
  }
  return {
    document,
    card: document.querySelector(".extension-catalog-card")!,
  };
}

it("selects only the exact enabled visible public Snippets action despite incompatible other cards", () => {
  const { document } = catalog();
  const action = scenario.selectPublicCatalogAction(document, "Install");
  expect(action.textContent).toBe("Install");
});

it.each([
  "missing",
  "version",
  "legacy-title",
  "duplicate",
  "disabled",
  "hidden",
  "inert",
  "style",
  "action",
  "duplicate-action",
  "zero-size",
])("refuses %s public selection", (variant) => {
  const { document, card } = catalog();
  const button = card.querySelector("button")!;
  if (variant === "missing") card.remove();
  if (variant === "version")
    card.querySelector("h4")!.textContent =
      "Snippets — Linux, macOS and Windows ARM64 preview · 0.1.1";
  if (variant === "legacy-title")
    card.querySelector("h4")!.textContent =
      "Snippets — Linux and macOS preview · 0.1.0";
  if (variant === "duplicate") card.after(card.cloneNode(true));
  if (variant === "disabled") button.disabled = true;
  if (variant === "hidden") card.setAttribute("hidden", "");
  if (variant === "inert") card.setAttribute("inert", "");
  if (variant === "style") (card as HTMLElement).style.display = "none";
  if (variant === "action") button.textContent = "Reinstall";
  if (variant === "duplicate-action") card.append(button.cloneNode(true));
  if (variant === "zero-size")
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({ width: 0, height: 0 }),
    });
  expect(() =>
    scenario.selectPublicCatalogAction(document, "Install"),
  ).toThrow();
});

it("requires the exact dormant management row without treating incompatible catalog cards as pending", () => {
  const { document } = catalog();
  const panel = document.querySelector(".extensions-panel")!;
  const row = document.createElement("section");
  row.innerHTML = `<h3>Snippets · 0.1.0</h3><p>omxterm.snippets · generation 1 · enabled · local dormant · other instances unknown</p><button>Disable</button>`;
  panel.append(row);
  expect(
    scenario.managementState(document, 1, "enabled", "dormant", "Disable"),
  ).toBe(true);
  expect(
    scenario.managementState(document, 2, "enabled", "dormant", "Disable"),
  ).toBe(false);
  row.querySelector("button")!.disabled = true;
  expect(
    scenario.managementState(document, 1, "enabled", "dormant", "Disable"),
  ).toBe(false);
  row.querySelector("button")!.disabled = false;
  row.setAttribute("hidden", "");
  expect(
    scenario.managementState(document, 1, "enabled", "dormant", null),
  ).toBe(false);
  row.removeAttribute("hidden");
  panel.append(row.cloneNode(true));
  expect(
    scenario.managementState(document, 1, "enabled", "dormant", "Disable"),
  ).toBe(false);
});

it("requires exact semantic writes and framed single child receipts without erasing focus metadata", () => {
  const writes = ["\u001b[I", "SNIPPETS_RUN\r", "SNIPPETS_PING\r"];
  const output = "SNIPPETS_RUN_RECEIPT\r\nSNIPPETS_AFTER_RETIREMENT\r\n";
  const { createWindowsCprTrace } =
    require("../fixtures/snippets-windows-cpr.cjs") as {
      createWindowsCprTrace(): {
        output(data: string): void;
        write(index: number, data: string): void;
        snapshot(): object;
      };
    };
  const cprTrace = createWindowsCprTrace();
  cprTrace.output(output);
  writes.forEach((data, index) => cprTrace.write(index, data));
  const session = { writes, output, outputTruncated: false, cprTrace };
  expect(
    scenario.inspectPublicInput(
      session,
      0,
      "SNIPPETS_RUN\rSNIPPETS_PING\r",
      1,
      1,
    ),
  ).toMatchObject({
    nonFocus: "SNIPPETS_RUN\rSNIPPETS_PING\r",
    focus: [{ index: 0, kind: "in" }],
  });
  for (const bad of [
    { ...session, writes: [...session.writes, "x"] },
    { ...session, output: session.output + "SNIPPETS_RUN_RECEIPT\r\n" },
    {
      ...session,
      output: "xSNIPPETS_RUN_RECEIPT\r\nSNIPPETS_AFTER_RETIREMENT\r\n",
    },
    { ...session, outputTruncated: true },
  ])
    expect(() =>
      scenario.inspectPublicInput(
        bad,
        0,
        "SNIPPETS_RUN\rSNIPPETS_PING\r",
        1,
        1,
      ),
    ).toThrow();
});
