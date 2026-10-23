import type { AssistantModelInfo } from "../../shared/assistant";
import type { Translator } from "../../shared/i18n";
import { checkbox } from "../ui/form";
import { openModal } from "../ui/modal";

// AshyTerm's model browser: search the provider's models, optionally only
// the free ones, and pick one. Resolves the chosen id, or undefined.
export async function openModelBrowser(
  document: Document,
  translator: Translator,
  models: readonly AssistantModelInfo[],
  current: string,
): Promise<string | undefined> {
  const t = translator.t.bind(translator);
  const body = document.createElement("div");
  body.className = "omx-form model-browser";
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = t("assistant.searchModels");
  search.setAttribute("aria-label", t("assistant.searchModels"));
  const pricesKnown = models.some((model) => model.free !== undefined);
  const freeOnly = checkbox(document, t("assistant.freeOnly"), false);
  freeOnly.element.hidden = !pricesKnown;
  const count = document.createElement("p");
  count.className = "omx-field-hint";
  count.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "model-browser-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", t("assistant.model"));
  body.append(search, freeOnly.element, count, list);

  let chosen: string | undefined = current;
  let choose: HTMLButtonElement | null = null;
  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const shown = models.filter(
      (model) =>
        (!freeOnly.input.checked || model.free === true) &&
        (query === "" ||
          model.id.toLocaleLowerCase().includes(query) ||
          (model.name ?? "").toLocaleLowerCase().includes(query)),
    );
    count.textContent = t("assistant.modelCount", { count: shown.length });
    list.replaceChildren(
      ...shown.slice(0, 500).map((model) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "model-browser-row";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(model.id === chosen));
        const id = document.createElement("span");
        id.className = "model-browser-id";
        id.textContent = model.id;
        const details = document.createElement("span");
        details.className = "model-browser-details";
        details.textContent = [
          model.name,
          model.context
            ? t("assistant.context", {
                tokens: translator.formatNumber(model.context),
              })
            : undefined,
        ]
          .filter(Boolean)
          .join(" · ");
        row.append(id, details);
        if (model.free) {
          const badge = document.createElement("span");
          badge.className = "model-browser-free";
          badge.textContent = t("assistant.free");
          row.append(badge);
        }
        row.addEventListener("click", () => {
          chosen = model.id;
          for (const item of list.children)
            item.setAttribute("aria-selected", String(item === row));
          if (choose) choose.disabled = false;
        });
        row.addEventListener("dblclick", () => choose?.click());
        return row;
      }),
    );
  };
  search.addEventListener("input", render);
  // Enter in the search box must not pick a model by accident.
  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      (list.querySelector("button") as HTMLButtonElement | null)?.focus();
    }
  });
  freeOnly.input.addEventListener("change", render);
  render();

  const opened = openModal(document, {
    title: t("assistant.browseModels"),
    className: "model-browser-dialog",
    body,
    initialFocus: search,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("assistant.useModel"), value: true, kind: "primary" },
    ],
  });
  choose = document.querySelector<HTMLButtonElement>(
    ".model-browser-dialog .omx-button-primary",
  );
  return (await opened) === true ? chosen : undefined;
}
