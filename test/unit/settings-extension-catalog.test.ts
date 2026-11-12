// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";
import { translatorFor } from "../../src/shared/i18n";
import type { Translate } from "../../src/renderer/renderer-language";
import type {
  CatalogCard,
  CatalogSnapshot,
  ExtensionsRequest,
  ExtensionsResult,
} from "../../src/shared/extensions";
afterEach(() => document.body.replaceChildren());
const en = translatorFor("en-US").t;
const pt = translatorFor("pt-BR").t;
const card: CatalogCard = {
  selection: "a".repeat(36),
  id: "omxterm.files",
  name: "<img src=x>",
  description: "<script>evil()</script>",
  version: "0.2.0",
  compatible: true,
  incompatibility: null,
  action: "update",
};
const catalog: CatalogSnapshot = {
  loaded: true,
  stale: false,
  entries: [card],
};
const withCard = (changes: Partial<CatalogCard>): CatalogSnapshot => ({
  ...catalog,
  entries: [{ ...card, ...changes }],
});
const action = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`);
const catalogNotice = () =>
  document.querySelector<HTMLElement>(".extension-catalog [role=status]")!;
const cardElement = () =>
  document.querySelector<HTMLElement>(".extension-catalog-card")!;
function mount(
  request: (value: ExtensionsRequest) => Promise<ExtensionsResult>,
  labels: ((t: Translate) => void)[] = [],
  disposers: (() => void)[] = [],
) {
  document.body.append(
    renderExtensions(document, { request }, () => true, labels, disposers),
  );
}
it("loads only explicitly, renders plain text, relabels retained cards and binds selection", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: true, entries: [] })
    .mockResolvedValueOnce({ ok: true, catalog })
    .mockResolvedValue({ ok: true, entries: [], catalog });
  const labels: ((t: Translate) => void)[] = [];
  mount(request, labels);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenLastCalledWith({ operation: "snapshot" });
  expect(document.querySelector(".extension-catalog-card")).toBeNull();
  action("catalog-browse")!.click();
  await vi.waitFor(() => expect(action("catalog-update")).not.toBeNull());
  expect(document.querySelector("script,img")).toBeNull();
  expect(cardElement().textContent).toContain("<script>evil()</script>");
  expect(cardElement().textContent).toContain("0.2.0");
  const retained = action("catalog-update")!;
  expect(retained.classList.contains("page-button-primary")).toBe(false);
  retained.focus();
  labels.forEach((label) => label(pt));
  expect(action("catalog-update")).toBe(retained);
  expect(retained.textContent).toBe(pt("extensions.catalogUpdate"));
  expect(document.activeElement).toBe(retained);
  expect(request).toHaveBeenCalledTimes(2);
  retained.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(request.mock.calls[2]![0]).toMatchObject({
    operation: "catalog-install",
    selection: card.selection,
  });
});
it("offers Install for an extension that isn't installed", async () => {
  mount(
    vi.fn().mockResolvedValue({
      ok: true,
      entries: [],
      catalog: withCard({ action: "install" }),
    }),
  );
  await vi.waitFor(() => expect(action("catalog-install")).not.toBeNull());
  expect(action("catalog-install")!.textContent).toBe(
    en("extensions.catalogInstall"),
  );
});
it("offers nothing for an installed extension without a newer release", async () => {
  mount(
    vi.fn().mockResolvedValue({
      ok: true,
      entries: [],
      catalog: withCard({ action: null }),
    }),
  );
  await vi.waitFor(() =>
    expect(cardElement().textContent).toContain(
      en("extensions.catalogInstalled"),
    ),
  );
  expect(cardElement().querySelector("button")).toBeNull();
  // The installed row has the real version; the card doesn't repeat the catalog's.
  expect(cardElement().textContent).not.toContain("0.2.0");
});
it.each([
  ["platform", "install", "extensions.catalogPlatformIncompatible"],
  ["engine", "install", "extensions.catalogEngineIncompatible"],
  ["platform-and-engine", "install", "extensions.catalogPlatformIncompatible"],
  ["engine", "update", "extensions.catalogInstalled"],
] as const)(
  "explains a %s incompatibility for %s without a button",
  async (incompatibility, cardAction, key) => {
    mount(
      vi.fn().mockResolvedValue({
        ok: true,
        entries: [],
        catalog: withCard({
          compatible: false,
          incompatibility,
          action: cardAction,
        }),
      }),
    );
    await vi.waitFor(() =>
      expect(cardElement().textContent).toContain(en(key)),
    );
    expect(cardElement().querySelector("button")).toBeNull();
  },
);
it("explains unavailable extension management", async () => {
  mount(vi.fn().mockResolvedValue({ ok: false, error: "unsupported" }));
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(en("extensions.unsupported")),
  );
});
it.each(["unsupported", "runtime-unavailable"])(
  "says installation is unavailable when catalog refresh returns %s",
  async (error) => {
    const request = vi
      .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
      .mockResolvedValue({ ok: false, error });
    mount(request);
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    action("catalog-browse")!.click();
    await vi.waitFor(() =>
      expect(catalogNotice().textContent).toBe(
        en("extensions.catalogManagementUnavailable"),
      ),
    );
  },
);
it("clears manager-unavailable status when an explicit shared snapshot succeeds", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: false, error: "runtime-unavailable" })
    .mockResolvedValueOnce({ ok: false, error: "runtime-unavailable" })
    .mockResolvedValueOnce({ ok: true, entries: [], catalog });
  mount(request);
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  action("catalog-browse")!.click();
  await vi.waitFor(() => expect(catalogNotice().hidden).toBe(false));
  action("refresh")!.click();
  await vi.waitFor(() => expect(action("catalog-update")).not.toBeNull());
  // A loaded catalog speaks through its cards, not a notice.
  expect(catalogNotice().hidden).toBe(true);
});
it("keeps local controls usable during cold offline loading and failure, with owned cancellation", async () => {
  let finish!: (result: ExtensionsResult) => void;
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockImplementation(async (value) =>
      value.operation === "catalog-refresh"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : { ok: true, entries: [] },
    );
  const disposers: (() => void)[] = [];
  const labels: ((t: Translate) => void)[] = [];
  mount(request, labels, disposers);
  await vi.waitFor(() => expect(action("install-file")!.disabled).toBe(false));
  action("catalog-browse")!.click();
  expect(catalogNotice().textContent).toBe(en("extensions.catalogLoading"));
  expect(action("install-file")!.disabled).toBe(false);
  const selected = request.mock.calls[1]![0];
  disposers.forEach((dispose) => dispose());
  expect(request).toHaveBeenLastCalledWith({
    operation: "cancel-install",
    token: "token" in selected ? selected.token : undefined,
  });
  finish({
    ok: false,
    error: "download-failed",
    catalog: { loaded: false, stale: true, entries: [] },
  });
  await vi.waitFor(() =>
    expect(catalogNotice().textContent).toBe(
      en("extensions.catalogUnavailable"),
    ),
  );
  expect(catalogNotice().dataset.severity).toBe("warning");
  expect(action("install-file")!.disabled).toBe(false);
  expect(action("catalog-browse")!.disabled).toBe(false);
  expect(action("catalog-browse")!.textContent).toBe(
    en("extensions.catalogRetry"),
  );
  labels.forEach((label) => label(pt));
  expect(catalogNotice().textContent).toBe(pt("extensions.catalogUnavailable"));
});
it("adopts a fresh shared snapshot after another window recovers the catalog", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: true, entries: [], catalog })
    .mockResolvedValueOnce({
      ok: false,
      error: "download-failed",
      catalog: { ...catalog, stale: true },
    })
    .mockResolvedValueOnce({ ok: false, error: "outcome-unknown" })
    .mockResolvedValueOnce({ ok: true, entries: [], catalog });
  mount(request);
  await vi.waitFor(() =>
    expect(action("catalog-browse")!.textContent).toBe(
      en("extensions.catalogRefresh"),
    ),
  );
  action("catalog-browse")!.click();
  await vi.waitFor(() =>
    expect(catalogNotice().textContent).toBe(en("extensions.catalogStale")),
  );
  // The stale snapshot stays usable.
  expect(action("catalog-update")!.disabled).toBe(false);
  action("catalog-update")!.click();
  await vi.waitFor(() => expect(action("refresh")!.hidden).toBe(false));
  action("refresh")!.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(4));
  expect(request).toHaveBeenLastCalledWith({ operation: "snapshot" });
  await vi.waitFor(() => expect(catalogNotice().hidden).toBe(true));
});
