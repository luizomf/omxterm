import type { MessageKey, Translator } from "../../shared/i18n";
import type {
  PreferencesPatch,
  PreferencesSaveResult,
  PreferencesValues,
} from "../../shared/preferences";
import type {
  AssistantBridge,
  PreferencesBridge,
} from "../../shared/terminal-bridge";
import { openModal } from "../ui/modal";
import { assistantPage } from "./assistant-page";
import { configFilePage } from "./config-file-page";
import {
  advancedPage,
  appearancePage,
  shortcutsPage,
  terminalPage,
  windowPage,
  type PreferencesContext,
} from "./preferences-pages";

const PAGES: ReadonlyArray<
  readonly [MessageKey, (context: PreferencesContext) => HTMLElement]
> = [
  ["prefs.appearance", appearancePage],
  ["prefs.terminal", terminalPage],
  ["prefs.windowAndTabs", windowPage],
  ["prefs.shortcuts", shortcutsPage],
  ["prefs.advanced", advancedPage],
];

// The graphical editor for config.json (AshyTerm's Preferences window). Each
// change is saved at once: main validates it like a reload, writes the file
// and every window applies it. A rejected change shows why and snaps back.
export async function openPreferencesDialog(
  document: Document,
  options: {
    readonly translator: Translator;
    readonly bridge: PreferencesBridge;
    readonly openHighlightRules?: () => void;
    readonly assistant?: AssistantBridge;
    // The page to show first, by its label key.
    readonly page?: MessageKey;
  },
): Promise<void> {
  const t = options.translator.t.bind(options.translator);
  let snapshot = await options.bridge.get();
  const syncs: ((values: PreferencesValues) => void)[] = [];
  let stopCapture: (() => void) | undefined;
  const status = document.createElement("p");
  status.className = "preferences-status";
  status.setAttribute("role", "status");
  const problem = document.createElement("p");
  problem.className = "preferences-problem";
  problem.setAttribute("role", "alert");

  const savedListeners: (() => void)[] = [];
  const apply = (result: PreferencesSaveResult) => {
    snapshot = result.snapshot;
    for (const sync of syncs) sync(snapshot.values);
    for (const listener of savedListeners) listener();
    status.textContent = result.ok
      ? t("prefs.saved")
      : t("prefs.notSaved", { reason: result.error });
    status.classList.toggle("error", !result.ok);
    problem.textContent = snapshot.problem ?? "";
    problem.hidden = snapshot.problem === undefined;
  };
  let queue = Promise.resolve();
  const run = (request: () => Promise<PreferencesSaveResult>) => {
    status.textContent = t("prefs.saving");
    status.classList.remove("error");
    queue = queue.then(request).then(apply, (cause: unknown) => {
      status.textContent = String(cause);
      status.classList.add("error");
      for (const sync of syncs) sync(snapshot.values);
    });
  };
  const context: PreferencesContext = {
    document,
    t,
    snapshot: () => snapshot,
    save: (patch: PreferencesPatch) => run(() => options.bridge.save(patch)),
    onSync: (sync) => {
      syncs.push(sync);
      sync(snapshot.values);
    },
    ...(options.openHighlightRules
      ? { openHighlightRules: options.openHighlightRules }
      : {}),
    captureKeys(listener) {
      stopCapture?.();
      const remove = options.bridge.onCapturedKey(listener);
      void options.bridge.captureShortcut(true).catch(() => undefined);
      const stop = () => {
        remove();
        void options.bridge.captureShortcut(false).catch(() => undefined);
        if (stopCapture === stop) stopCapture = undefined;
      };
      stopCapture = stop;
      return stop;
    },
  };

  const layout = document.createElement("div");
  layout.className = "preferences-layout";
  const nav = document.createElement("div");
  nav.className = "preferences-nav";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-orientation", "vertical");
  const pages = document.createElement("div");
  pages.className = "preferences-pages";
  const definitions = [
    ...PAGES.slice(0, -1),
    ...(options.assistant
      ? [
          [
            "prefs.assistant",
            () =>
              assistantPage(document, options.translator, options.assistant!),
          ] as const,
        ]
      : []),
    PAGES.at(-1)!,
    [
      "prefs.configFile",
      () =>
        configFilePage(document, options.translator, {
          read: () => options.bridge.readFile(),
          async save(text) {
            const request = queue.then(() => options.bridge.writeFile(text));
            queue = request.then(apply, () => undefined);
            return request;
          },
          onSaved: (listener) => savedListeners.push(listener),
        }),
    ] as const,
  ];
  const tabs = definitions.map(([label, build], index) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.setAttribute("role", "tab");
    tab.id = `preferences-tab-${index}`;
    tab.textContent = t(label);
    const panel = build(context);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    nav.append(tab);
    pages.append(panel);
    return { tab, panel };
  });
  const select = (index: number) => {
    tabs.forEach(({ tab, panel }, candidate) => {
      const selected = candidate === index;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panel.hidden = !selected;
    });
  };
  tabs.forEach(({ tab }, index) => {
    tab.addEventListener("click", () => select(index));
    tab.addEventListener("keydown", (event) => {
      const step =
        event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (step === 0) return;
      event.preventDefault();
      const next = (index + step + tabs.length) % tabs.length;
      select(next);
      tabs[next]!.tab.focus();
    });
  });
  select(
    Math.max(
      0,
      definitions.findIndex(([label]) => label === options.page),
    ),
  );
  problem.textContent = snapshot.problem ?? "";
  problem.hidden = snapshot.problem === undefined;
  const content = document.createElement("div");
  content.className = "preferences-content";
  content.append(problem, pages);
  layout.append(nav, content);
  const body = document.createElement("div");
  body.append(layout, status);

  await openModal(document, {
    title: t("prefs.title"),
    className: "preferences-dialog",
    body,
    initialFocus: (
      tabs.find(({ tab }) => tab.getAttribute("aria-selected") === "true") ??
      tabs[0]!
    ).tab,
    actions: [
      { label: t("prefs.restoreDefaults"), value: "reset", kind: "danger" },
      { label: t("common.close"), value: "close", kind: "primary" },
    ],
    async beforeResolve(value) {
      if (value !== "reset") {
        await queue;
        return true;
      }
      const confirmed = await openModal(document, {
        title: t("prefs.restoreDefaultsTitle"),
        body: t("prefs.restoreDefaultsMessage"),
        actions: [
          { label: t("common.cancel"), value: false },
          { label: t("prefs.restoreDefaults"), value: true, kind: "danger" },
        ],
      });
      if (confirmed) run(() => options.bridge.reset());
      return false;
    },
  });
  stopCapture?.();
}
