import type {
  CatalogCard,
  CatalogSnapshot,
  ExtensionsBridge,
  ExtensionsRequest,
} from "../../shared/extensions";
import type { MessageKey } from "../../shared/i18n";
import { createPageButton, setPageNotice } from "../application-page";
import { englishLanguage, type Translate } from "../renderer-language";

// A card says one thing: its action, or why there is none.
function cardState(entry: CatalogCard): MessageKey | undefined {
  if (entry.incompatibility === "engine")
    return entry.action === "install"
      ? "extensions.catalogEngineIncompatible"
      : "extensions.catalogInstalled";
  if (entry.incompatibility)
    return entry.action === "install"
      ? "extensions.catalogPlatformIncompatible"
      : "extensions.catalogInstalled";
  return entry.action ? undefined : "extensions.catalogInstalled";
}

/** Independent acquisition state leaves local/installed management usable offline. */
export function renderExtensionCatalog(
  document: Document,
  bridge: ExtensionsBridge,
  live: () => boolean,
  page: {
    // Installs run through the page so they share its busy state and notice.
    install: (request: ExtensionsRequest) => void;
    // Installed rows read the catalog for "Update available".
    changed: (snapshot: CatalogSnapshot) => void;
  },
  labels: ((t: Translate) => void)[],
  disposers: (() => void)[],
) {
  let t = englishLanguage.t;
  let snapshot: CatalogSnapshot = { loaded: false, stale: false, entries: [] };
  let token: string | undefined;
  let failed = false;
  let managementUnavailable = false;
  let managementBusy = false;
  const section = document.createElement("section");
  section.className = "extension-catalog";
  const header = document.createElement("div");
  header.className = "extension-section-header";
  const heading = document.createElement("h3");
  const browse = createPageButton(document);
  browse.dataset.action = "catalog-browse";
  const cancel = createPageButton(document, "text");
  cancel.classList.add("page-button-compact");
  const notice = document.createElement("div");
  notice.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "extension-catalog-list";
  const bindings: (() => void)[] = [];
  const buttons: HTMLButtonElement[] = [];
  const cancelLoad = () => {
    if (token)
      void bridge
        .request({ operation: "cancel-install", token })
        .catch(() => {});
  };
  cancel.addEventListener("click", cancelLoad);
  disposers.push(cancelLoad);
  function relabel() {
    // Before the first load the button is the whole section; afterwards it
    // becomes a quiet Refresh beside the heading.
    const shown = snapshot.loaded || failed;
    heading.hidden = !shown;
    heading.textContent = t("extensions.catalogHeading");
    browse.className = `page-control page-button ${
      shown ? "page-button-text page-button-compact" : "page-button-quiet"
    }`;
    browse.textContent = t(
      failed
        ? "extensions.catalogRetry"
        : snapshot.loaded
          ? "extensions.catalogRefresh"
          : "extensions.catalogBrowse",
    );
    browse.disabled = !!token;
    cancel.hidden = !token;
    cancel.textContent = t("common.cancel");
    // Idle and loaded catalogs need no notice: the button and cards say it.
    const message = token
      ? "extensions.catalogLoading"
      : managementUnavailable
        ? "extensions.catalogManagementUnavailable"
        : failed || snapshot.stale
          ? snapshot.loaded
            ? "extensions.catalogStale"
            : "extensions.catalogUnavailable"
          : snapshot.loaded && !snapshot.entries.length
            ? "extensions.catalogEmpty"
            : undefined;
    setPageNotice(notice, {
      text: message ? t(message) : "",
      severity:
        managementUnavailable || failed || snapshot.stale ? "warning" : "info",
    });
    for (const apply of bindings) apply();
    for (const button of buttons) button.disabled = managementBusy;
  }
  function update(next: CatalogSnapshot) {
    snapshot = next;
    if (next.loaded && !next.stale) {
      failed = false;
      managementUnavailable = false;
    }
    bindings.length = 0;
    buttons.length = 0;
    list.replaceChildren();
    for (const entry of snapshot.entries) {
      const card = document.createElement("section");
      card.className = "extension-catalog-card ui-card";
      card.dataset.extensionId = entry.id;
      const title = document.createElement("div");
      title.className = "extension-card-title";
      const name = document.createElement("h4");
      name.textContent = entry.name;
      title.append(name);
      const state = cardState(entry);
      // Installed cards drop the catalog version; the installed row has the
      // real one, which may be newer than the catalog's.
      if (state !== "extensions.catalogInstalled") {
        const version = document.createElement("span");
        version.className = "ui-meta";
        version.textContent = entry.version;
        title.append(version);
      }
      const description = document.createElement("p");
      description.textContent = entry.description;
      card.append(title, description);
      if (state) {
        const status = document.createElement("p");
        status.className = "ui-meta";
        bindings.push(() => {
          status.textContent = t(state);
        });
        card.append(status);
      } else {
        const action = entry.action!;
        const button = createPageButton(document);
        button.classList.add("page-button-compact");
        button.dataset.action = `catalog-${action}`;
        bindings.push(() => {
          button.textContent = t(
            action === "update"
              ? "extensions.catalogUpdate"
              : "extensions.catalogInstall",
          );
        });
        button.addEventListener("click", () =>
          page.install({
            operation: "catalog-install",
            selection: entry.selection,
            token: crypto.randomUUID(),
          }),
        );
        buttons.push(button);
        card.append(button);
      }
      list.append(card);
    }
    relabel();
    page.changed(snapshot);
  }
  browse.addEventListener("click", () => {
    if (token || !live()) return;
    token = crypto.randomUUID();
    failed = false;
    managementUnavailable = false;
    relabel();
    void bridge
      .request({ operation: "catalog-refresh", token })
      .then(
        (result) => {
          if (!live()) return;
          if (result.catalog) update(result.catalog);
          failed = !result.ok;
          managementUnavailable =
            !result.ok &&
            (result.error === "unsupported" ||
              result.error === "runtime-unavailable");
        },
        () => {
          failed = true;
        },
      )
      .finally(() => {
        token = undefined;
        if (live()) relabel();
      });
  });
  labels.push((next) => {
    t = next;
    relabel();
  });
  header.append(heading, browse, cancel);
  section.append(header, notice, list);
  relabel();
  return {
    element: section,
    update,
    busy(value: boolean) {
      managementBusy = value;
      relabel();
    },
  };
}
