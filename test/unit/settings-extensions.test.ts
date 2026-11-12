// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { translatorFor } from "../../src/shared/i18n";
import type { Translate } from "../../src/renderer/renderer-language";
import { renderExtensions } from "../../src/renderer/settings/settings-extensions";
import { isExtensionsRequest } from "../../src/shared/extensions";
import type {
  ExtensionsRequest,
  ExtensionsResult,
} from "../../src/shared/extensions";
afterEach(() => document.body.replaceChildren());
const en = translatorFor("en-US").t;
const pt = translatorFor("pt-BR").t;
const files = {
  id: "omxterm.files",
  generation: 4,
  name: "Files",
  version: "0.1.0",
  installed: true,
  enabled: true,
  local: "unknown",
};
const snapshot: ExtensionsResult = {
  ok: true,
  entries: [
    files,
    {
      id: "omxterm.restoration",
      generation: 2,
      name: "omxterm.restoration",
      version: null,
      installed: false,
      enabled: false,
      local: "unknown",
    },
  ],
};
const action = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!;
const row = (id: string) =>
  document.querySelector<HTMLElement>(
    `.extension-installed-list [data-extension-id="${id}"]`,
  );
const notice = () =>
  document.querySelector<HTMLElement>(".extensions-status [role=status]")!;
function mount(
  request: (value: ExtensionsRequest) => Promise<ExtensionsResult>,
  labels: ((t: Translate) => void)[] = [],
  disposers: (() => void)[] = [],
) {
  document.body.append(
    renderExtensions(
      document,
      {
        request: async (value) => {
          if (!isExtensionsRequest(value))
            throw new TypeError("Invalid extension request");
          return request(value);
        },
      },
      () => true,
      labels,
      disposers,
    ),
  );
}
it("lists installed extensions as quiet rows and leaves uninstalled ones out", async () => {
  mount(vi.fn().mockResolvedValue(snapshot));
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  const files = row("omxterm.files")!;
  expect(files.classList.contains("ui-row")).toBe(true);
  expect(files.textContent).toContain("Files");
  expect(files.textContent).toContain("0.1.0");
  expect(files.querySelector("[title]")?.getAttribute("title")).toBe(
    "omxterm.files",
  );
  expect(row("omxterm.restoration")).toBeNull();
  expect(document.body.textContent).not.toContain("omxterm.restoration");
  // An enabled extension carries no state word.
  expect(files.textContent).not.toContain(en("extensions.off"));
  for (const button of files.querySelectorAll("button"))
    expect(button.classList.contains("page-button-primary")).toBe(false);
  // Success is quiet.
  expect(notice().hidden).toBe(true);
  expect(action("refresh").hidden).toBe(true);
});
it("marks a disabled extension Off and sends the displayed generation", async () => {
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce({
      ok: true,
      entries: [{ ...files, enabled: false }],
    })
    .mockResolvedValue(snapshot);
  mount(request);
  await vi.waitFor(() =>
    expect(row("omxterm.files")?.textContent).toContain(en("extensions.off")),
  );
  action("enable").click();
  await vi.waitFor(() =>
    expect(request).toHaveBeenLastCalledWith({
      operation: "enable",
      id: "omxterm.files",
      generation: 4,
    }),
  );
  await vi.waitFor(() => expect(action("disable")).not.toBeNull());
  expect(row("omxterm.files")!.textContent).not.toContain(en("extensions.off"));
});
it("shows the empty state when nothing is installed", async () => {
  mount(
    vi.fn().mockResolvedValue({ ok: true, entries: [snapshot.entries![1]!] }),
  );
  await vi.waitFor(() =>
    expect(document.body.textContent).toContain(en("extensions.empty")),
  );
  expect(
    document.querySelectorAll(".extension-installed-list > *"),
  ).toHaveLength(0);
});
it("explains empty and whitespace-only links without sending them", async () => {
  const request = vi.fn().mockResolvedValue(snapshot);
  mount(request);
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  const input = document.querySelector<HTMLInputElement>("input[type=url]")!;
  expect(input.closest<HTMLElement>(".extensions-link")!.hidden).toBe(true);
  action("install-link").click();
  expect(input.closest<HTMLElement>(".extensions-link")!.hidden).toBe(false);
  expect(action("install-link").getAttribute("aria-expanded")).toBe("true");
  for (const value of ["", "   "]) {
    input.value = value;
    action("install-link-submit").click();
    expect(notice().textContent).toBe(en("extensions.invalid-url"));
    expect(notice().dataset.severity).toBe("warning");
  }
  expect(request).toHaveBeenCalledTimes(1);
});
it("keeps a pending download across language changes and cancels its exact identity on dismissal", async () => {
  let finish!: (result: ExtensionsResult) => void;
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockImplementation(async (value) => {
      if (value.operation === "install-link")
        return new Promise((resolve) => {
          finish = resolve;
        });
      return snapshot;
    });
  const labels: ((t: Translate) => void)[] = [];
  const disposers: (() => void)[] = [];
  mount(request, labels, disposers);
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  action("install-link").click();
  const input = document.querySelector<HTMLInputElement>("input[type=url]")!;
  expect(input.classList.contains("page-control")).toBe(true);
  input.value = "https://example.org/archive?signature=abc";
  action("install-link-submit").click();
  const submitted = request.mock.calls[1]![0];
  expect(submitted).toMatchObject({
    operation: "install-link",
    url: input.value,
  });
  expect(input.disabled).toBe(true);
  expect(
    document.querySelector(".extensions-panel")!.getAttribute("aria-busy"),
  ).toBe("true");
  expect(notice().textContent).toBe(en("extensions.downloading"));
  labels.forEach((label) => label(pt));
  expect(input.value).toBe("https://example.org/archive?signature=abc");
  expect(notice().textContent).toBe(pt("extensions.downloading"));
  expect(request).toHaveBeenCalledTimes(2);
  disposers.forEach((dispose) => dispose());
  expect(request).toHaveBeenLastCalledWith({
    operation: "cancel-install",
    token: "token" in submitted ? submitted.token : undefined,
  });
  finish({ ok: false, error: "cancelled" });
  await vi.waitFor(() =>
    expect(notice().textContent).toBe(pt("extensions.cancelled")),
  );
  expect(input.disabled).toBe(false);
});
it("relabels a pending row action without replaying it or changing its generation", async () => {
  let finish!: (result: ExtensionsResult) => void;
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce(snapshot)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
  const labels: ((t: Translate) => void)[] = [];
  mount(request, labels);
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  const button = action("disable");
  button.click();
  labels.forEach((label) => label(pt));
  expect(button.isConnected).toBe(true);
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe(pt("extensions.disable"));
  expect(request).toHaveBeenCalledTimes(2);
  finish({ ok: false, error: "outcome-unknown" });
  await vi.waitFor(() =>
    expect(notice().textContent).toBe(pt("extensions.outcome-unknown")),
  );
  expect(button.disabled).toBe(false);
  expect(request).toHaveBeenLastCalledWith({
    operation: "disable",
    id: "omxterm.files",
    generation: 4,
  });
});
it("never repeats an unknown outcome; Refresh appears and is a deliberate snapshot", async () => {
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce({ ok: false, error: "outcome-unknown" })
    .mockResolvedValue(snapshot);
  mount(request);
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  action("uninstall").click();
  await vi.waitFor(() => expect(action("refresh").hidden).toBe(false));
  expect(notice().dataset.severity).toBe("warning");
  expect(request).toHaveBeenCalledTimes(2);
  action("refresh").click();
  await vi.waitFor(() =>
    expect(request).toHaveBeenLastCalledWith({ operation: "snapshot" }),
  );
  expect(request).toHaveBeenCalledTimes(3);
  await vi.waitFor(() => expect(action("refresh").hidden).toBe(true));
  expect(notice().hidden).toBe(true);
});
it("marks an installed row when the loaded catalog has a compatible update", async () => {
  const card = {
    selection: "a".repeat(36),
    id: "omxterm.files",
    name: "Files",
    description: "Browse files.",
    version: "0.2.0",
    compatible: true,
    incompatibility: null,
    action: "update" as const,
  };
  const request = vi
    .fn<(value: ExtensionsRequest) => Promise<ExtensionsResult>>()
    .mockResolvedValueOnce(snapshot)
    .mockResolvedValueOnce({
      ok: true,
      catalog: { loaded: true, stale: false, entries: [card] },
    });
  mount(request);
  await vi.waitFor(() => expect(row("omxterm.files")).not.toBeNull());
  expect(row("omxterm.files")!.textContent).not.toContain(
    en("extensions.updateAvailable"),
  );
  action("catalog-browse").click();
  await vi.waitFor(() =>
    expect(row("omxterm.files")!.textContent).toContain(
      en("extensions.updateAvailable"),
    ),
  );
});
