import {
  ASSISTANT_PROVIDERS,
  ASSISTANT_PROVIDER_IDS,
  assistantModel,
  isAssistantBaseUrl,
  isAssistantProvider,
  type AssistantSettings,
  type AssistantState,
} from "../../shared/assistant";
import type { Translator } from "../../shared/i18n";
import type { AssistantBridge } from "../../shared/terminal-bridge";
import { checkbox, field, selectInput, textInput } from "../ui/form";
import { openModelBrowser } from "./model-browser";

// Preferences → Assistant. Settings save as they change; the API key goes to
// the system keychain through main and is never shown again.
export function assistantPage(
  document: Document,
  translator: Translator,
  bridge: AssistantBridge,
): HTMLElement {
  const t = translator.t.bind(translator);
  const element = document.createElement("div");
  element.className = "omx-form preferences-page";
  const status = document.createElement("p");
  status.className = "preferences-page-status";
  status.setAttribute("role", "status");
  let state: AssistantState | undefined;

  const say = (message: string, error = false) => {
    status.textContent = message;
    status.classList.toggle("error", error);
  };
  const failure = (cause: unknown) =>
    say(
      String(cause instanceof Error ? cause.message : cause).replace(
        /^Error invoking remote method '[^']+': (?:\w*Error: )?/u,
        "",
      ),
      true,
    );

  const heading = (key: Parameters<typeof t>[0]) => {
    const item = document.createElement("h3");
    item.className = "preferences-heading";
    item.textContent = t(key);
    return item;
  };
  const privacy = document.createElement("p");
  privacy.className = "omx-field-hint";
  privacy.textContent = t("assistant.privacy");
  const enabled = checkbox(document, t("assistant.enableToggle"), false);
  const provider = selectInput(
    document,
    ASSISTANT_PROVIDER_IDS.map(
      (id) => [id, ASSISTANT_PROVIDERS[id].name] as const,
    ),
    "groq",
  );
  const model = textInput(document, "");
  const models = document.createElement("datalist");
  models.id = "assistant-models";
  model.setAttribute("list", models.id);
  const loadModels = document.createElement("button");
  loadModels.type = "button";
  loadModels.className = "omx-button omx-button-default";
  loadModels.textContent = t("assistant.browseModels");
  const modelRow = document.createElement("div");
  modelRow.className = "omx-inline";
  modelRow.append(model, loadModels, models);
  const baseUrl = textInput(document, "", {
    placeholder: "http://localhost:11434/v1",
  });
  const baseUrlField = field(
    document,
    t("assistant.baseUrl"),
    baseUrl,
    t("assistant.baseUrlHint"),
  );
  const key = textInput(document, "", { type: "password" });
  key.autocomplete = "off";
  const saveKey = document.createElement("button");
  saveKey.type = "button";
  saveKey.className = "omx-button omx-button-default";
  saveKey.textContent = t("assistant.saveKey");
  const removeKey = document.createElement("button");
  removeKey.type = "button";
  removeKey.className = "omx-button omx-button-danger";
  removeKey.textContent = t("assistant.removeKey");
  const keyPage = document.createElement("button");
  keyPage.type = "button";
  keyPage.className = "omx-button omx-button-default";
  keyPage.textContent = t("assistant.getKey");
  const keyRow = document.createElement("div");
  keyRow.className = "omx-inline";
  keyRow.append(key, saveKey, removeKey, keyPage);
  const keyField = field(document, t("assistant.apiKey"), keyRow);
  const keyState = document.createElement("p");
  keyState.className = "omx-field-hint";
  keyField.element.append(keyState);
  const test = document.createElement("button");
  test.type = "button";
  test.className = "omx-button omx-button-default";
  test.textContent = t("assistant.testConnection");

  const current = () => state?.settings;
  const show = (next: AssistantState) => {
    state = next;
    const { settings } = next;
    enabled.input.checked = settings.enabled;
    provider.value = settings.provider;
    model.value = assistantModel(settings);
    baseUrl.value = settings.localBaseUrl;
    baseUrlField.setVisible(settings.provider === "local");
    const needsKey = ASSISTANT_PROVIDERS[settings.provider].needsKey;
    const stored = next.keys[settings.provider] ?? false;
    keyField.setVisible(needsKey || stored);
    key.disabled = !next.keyStorage;
    saveKey.disabled = !next.keyStorage;
    removeKey.hidden = !stored;
    keyPage.hidden =
      ASSISTANT_PROVIDERS[settings.provider].keyUrl === undefined;
    keyState.textContent = !next.keyStorage
      ? t("assistant.keyStorageUnavailable")
      : stored
        ? t("assistant.keyStored")
        : t("assistant.keyMissing");
  };
  const save = (change: Partial<AssistantSettings>) => {
    const settings = current();
    if (!settings) return;
    say(t("prefs.saving"));
    void bridge
      .saveSettings({ ...settings, ...change })
      .then((next) => {
        show(next);
        say(t("prefs.saved"));
      })
      .catch(failure);
  };

  enabled.input.addEventListener("change", () =>
    save({ enabled: enabled.input.checked }),
  );
  provider.addEventListener("change", () => {
    if (isAssistantProvider(provider.value)) save({ provider: provider.value });
  });
  model.addEventListener("change", () => {
    const settings = current();
    const value = model.value.trim();
    if (!settings || !value) return;
    save({ models: { ...settings.models, [settings.provider]: value } });
  });
  baseUrl.addEventListener("change", () => {
    if (isAssistantBaseUrl(baseUrl.value.trim()))
      save({ localBaseUrl: baseUrl.value.trim() });
    else say(t("assistant.invalidBaseUrl"), true);
  });
  saveKey.addEventListener("click", () => {
    const settings = current();
    const value = key.value.trim();
    if (!settings || !value) return;
    void bridge
      .setKey(settings.provider, value)
      .then((next) => {
        key.value = "";
        show(next);
        say(t("assistant.keySaved"));
      })
      .catch(failure);
  });
  removeKey.addEventListener("click", () => {
    const settings = current();
    if (!settings) return;
    void bridge
      .setKey(settings.provider, null)
      .then((next) => {
        show(next);
        say(t("assistant.keyRemoved"));
      })
      .catch(failure);
  });
  keyPage.addEventListener("click", () => {
    const settings = current();
    if (settings) void bridge.openKeyPage(settings.provider).catch(failure);
  });
  loadModels.addEventListener("click", () => {
    const settings = current();
    if (!settings) return;
    say(t("assistant.loading"));
    void bridge
      .models(settings.provider)
      .then(async (list) => {
        models.replaceChildren(
          ...list.map(({ id }) => {
            const option = document.createElement("option");
            option.value = id;
            return option;
          }),
        );
        say(t("assistant.connectionOk", { count: list.length }));
        if (list.length === 0) return;
        const picked = await openModelBrowser(
          document,
          translator,
          list,
          assistantModel(settings),
        );
        if (picked)
          save({ models: { ...settings.models, [settings.provider]: picked } });
      })
      .catch(failure);
  });
  test.addEventListener("click", () => {
    const settings = current();
    if (!settings) return;
    say(t("assistant.loading"));
    void bridge
      .test(settings.provider)
      .then((count) => say(t("assistant.connectionOk", { count })))
      .catch(failure);
  });

  element.append(
    heading("assistant.title"),
    privacy,
    enabled.element,
    field(document, t("assistant.provider"), provider).element,
    field(document, t("assistant.model"), modelRow, t("assistant.modelHint"))
      .element,
    baseUrlField.element,
    keyField.element,
    test,
    status,
  );
  void bridge.state().then(show).catch(failure);
  return element;
}
