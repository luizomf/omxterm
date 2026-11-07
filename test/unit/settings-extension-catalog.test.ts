// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";
import { translatorFor } from "../../src/shared/i18n";
import type { Translate } from "../../src/renderer/renderer-language";
import type {
  ExtensionsRequest,
  ExtensionsResult,
} from "../../src/shared/extensions";
afterEach(() => document.body.replaceChildren());
const catalog = {
  loaded: true,
  stale: false,
  entries: [
    {
      selection: "a".repeat(36),
      id: "omxterm.files",
      name: "<img src=x>",
      description: "<script>evil()</script>",
      version: "0.1.0",
      installedVersion: "0.2.0",
      compatible: true,
      targets: ["linux-arm64"],
      incompatibility: null,
      action: "replace" as const,
    },
  ],
};
const button = (text: string) =>
  [...document.querySelectorAll("button")].find(
    (item) => item.textContent === text,
  )!;
it("loads only explicitly, renders plain text, localizes retained cards and binds selection", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: true, entries: [] })
    .mockResolvedValueOnce({ ok: true, catalog })
    .mockResolvedValue({ ok: true, entries: [], catalog });
  const labels: ((t: Translate) => void)[] = [];
  document.body.append(
    renderExtensions(document, { request }, () => true, labels),
  );
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request).toHaveBeenLastCalledWith({ operation: "snapshot" });
  button("Browse official extensions").click();
  await vi.waitFor(() =>
    expect(button("Replace installed version")).toBeDefined(),
  );
  expect(document.querySelector("script,img")).toBeNull();
  expect(document.body.textContent).toContain("<script>evil()</script>");
  expect(document.body.textContent).toContain(
    "Catalog offer platforms: Linux ARM64",
  );
  expect(document.body.textContent).not.toContain(
    "This preview is Linux ARM64 only",
  );
  expect(document.body.textContent).toContain(
    "older version or different bytes",
  );
  const retained = button("Replace installed version");
  retained.focus();
  labels.forEach((label) => label(translatorFor("pt-BR").t));
  expect(button("Substituir versão instalada")).toBe(retained);
  expect(document.activeElement).toBe(retained);
  expect(request).toHaveBeenCalledTimes(2);
  retained.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  expect(request.mock.calls[2]![0]).toMatchObject({
    operation: "catalog-install",
    selection: catalog.entries[0]!.selection,
  });
});
it.each([
  [
    "platform",
    "Not offered by this catalog for this platform",
    "Não oferecida por este catálogo para esta plataforma",
  ],
  [
    "engine",
    "Not compatible with this OMXTerm or extension API version",
    "Incompatível com esta versão do OMXTerm ou da API de extensões",
  ],
  [
    "platform-and-engine",
    "Not offered by this catalog for this platform",
    "Não oferecida por este catálogo para esta plataforma",
  ],
] as const)(
  "shows %s incompatibility and supported platforms",
  async (reason, en, pt) => {
    const labels: ((t: Translate) => void)[] = [];
    const request = vi
      .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
      .mockResolvedValue({
        ok: true,
        entries: [],
        catalog: {
          ...catalog,
          entries: [
            {
              ...catalog.entries[0]!,
              compatible: false,
              targets: ["linux-arm64", "darwin-arm64"],
              incompatibility: reason,
            },
          ],
        },
      });
    document.body.append(
      renderExtensions(document, { request }, () => true, labels),
    );
    await vi.waitFor(() => expect(document.body.textContent).toContain(en));
    expect(document.body.textContent).toContain(
      "Catalog offer platforms: Linux ARM64, macOS ARM64",
    );
    if (reason === "platform-and-engine")
      expect(document.body.textContent).toContain(
        "Not compatible with this OMXTerm or extension API version",
      );
    const install = button("Replace installed version");
    expect(install.disabled).toBe(true);
    labels.forEach((label) => label(translatorFor("pt-BR").t));
    expect(document.body.textContent).toContain(pt);
    expect(document.body.textContent).toContain(
      "Plataformas desta oferta do catálogo: Linux ARM64, macOS ARM64",
    );
    expect(install.disabled).toBe(true);
  },
);
it("explains unavailable extension management without a Files-specific claim", async () => {
  const labels: ((t: Translate) => void)[] = [];
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValue({ ok: false, error: "unsupported" });
  document.body.append(
    renderExtensions(document, { request }, () => true, labels),
  );
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "Extension management is unavailable on this platform",
    ),
  );
  labels.forEach((label) => label(translatorFor("pt-BR").t));
  expect(document.body.textContent).toContain(
    "O gerenciamento de extensões não está disponível nesta plataforma",
  );
});
it.each(["unsupported", "runtime-unavailable"])(
  "does not promise offline installation when catalog refresh returns %s",
  async (error) => {
    const labels: ((t: Translate) => void)[] = [];
    const request = vi
      .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
      .mockResolvedValue({ ok: false, error });
    document.body.append(
      renderExtensions(document, { request }, () => true, labels),
    );
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    button("Browse official extensions").click();
    await vi.waitFor(() =>
      expect(document.body.textContent).toContain(
        "Catalog and installation are unavailable because extension management is unavailable",
      ),
    );
    expect(document.body.textContent).not.toContain(
      "local-file installation still work offline",
    );
    labels.forEach((label) => label(translatorFor("pt-BR").t));
    expect(document.body.textContent).toContain(
      "O catálogo e a instalação estão indisponíveis porque o gerenciamento de extensões está indisponível",
    );
  },
);
it("clears manager-unavailable status when an explicit shared snapshot succeeds", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: false, error: "runtime-unavailable" })
    .mockResolvedValueOnce({ ok: false, error: "runtime-unavailable" })
    .mockResolvedValueOnce({ ok: true, entries: [], catalog });
  document.body.append(renderExtensions(document, { request }, () => true));
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  button("Browse official extensions").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(
      "Catalog and installation are unavailable",
    ),
  );
  button("Refresh").click();
  await vi.waitFor(() =>
    expect(button("Replace installed version")).toBeDefined(),
  );
  expect(document.body.textContent).not.toContain(
    "Catalog and installation are unavailable",
  );
  expect(document.body.textContent).toContain("Catalog loaded.");
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
  document.body.append(
    renderExtensions(document, { request }, () => true, labels, disposers),
  );
  await vi.waitFor(() =>
    expect(button("Install from link").disabled).toBe(false),
  );
  button("Browse official extensions").click();
  expect(button("Install from link").disabled).toBe(false);
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
    expect(document.body.textContent).toContain("Catalog unavailable."),
  );
  expect(document.body.textContent).not.toContain("no published extensions");
  const notice = [
    ...document.querySelectorAll<HTMLElement>(".page-notice"),
  ].find((node) => node.textContent?.includes("Catalog unavailable."));
  expect(notice?.dataset.severity).toBe("warning");
  expect(document.body.textContent).toContain(
    "If extension management is available, you can still install local files and manage installed extensions offline",
  );
  expect(button("Install from link").disabled).toBe(false);
  expect(button("Retry catalog").disabled).toBe(false);
  labels.forEach((label) => label(translatorFor("pt-BR").t));
  expect(document.body.textContent).toContain(
    "Se o gerenciamento de extensões estiver disponível, você ainda pode instalar arquivos locais e gerenciar extensões instaladas offline",
  );
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
    .mockResolvedValueOnce({ ok: true, entries: [], catalog });
  document.body.append(renderExtensions(document, { request }, () => true));
  await vi.waitFor(() => expect(button("Refresh catalog")).toBeDefined());
  button("Refresh catalog").click();
  await vi.waitFor(() => expect(button("Retry catalog")).toBeDefined());
  button("Refresh").click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(3));
  await vi.waitFor(() => expect(button("Refresh catalog")).toBeDefined());
  expect(document.body.textContent).not.toContain("last successful snapshot");
  expect(request).toHaveBeenLastCalledWith({ operation: "snapshot" });
});
it("shows stale success rather than an empty catalog after a failed refresh", async () => {
  const request = vi
    .fn<(request: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({ ok: true, entries: [], catalog })
    .mockResolvedValueOnce({
      ok: false,
      error: "download-failed",
      catalog: { ...catalog, stale: true },
    });
  document.body.append(renderExtensions(document, { request }, () => true));
  await vi.waitFor(() => expect(button("Refresh catalog")).toBeDefined());
  button("Refresh catalog").click();
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain("last successful snapshot"),
  );
  expect(button("Replace installed version").disabled).toBe(false);
  expect(document.body.textContent).toContain("Installed: 0.2.0");
});
