import type { MessageKey, Translator } from "../../shared/i18n";
import { icon, type IconName } from "../ui/icons";

// The Files panel's fixed parts: toolbar, remote host line, breadcrumb,
// filter and status line.
export function createFilesChrome(
  document: Document,
  translator: Translator,
  isDisposed: () => boolean,
) {
  const t = translator.t.bind(translator);
  const toolbar = document.createElement("div");
  toolbar.className = "files-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", t("sidebar.files"));
  const place = document.createElement("p");
  place.className = "files-place";
  place.hidden = true;
  const crumbs = document.createElement("nav");
  crumbs.className = "files-crumbs";
  crumbs.setAttribute("aria-label", t("files.location"));
  const filter = document.createElement("input");
  filter.type = "search";
  filter.className = "files-filter";
  filter.placeholder = t("files.filter");
  filter.setAttribute("aria-label", t("files.filter"));
  const status = document.createElement("p");
  status.className = "files-status";
  status.setAttribute("role", "status");

  return {
    toolbar,
    place,
    crumbs,
    filter,
    status,
    tool(name: IconName, label: MessageKey, run: () => void) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "omx-icon-button files-tool";
      button.title = t(label);
      button.setAttribute("aria-label", t(label));
      button.append(icon(document, name));
      button.addEventListener("click", () => {
        if (!isDisposed()) run();
      });
      toolbar.append(button);
      return button;
    },
    // A toolbar toggle reflecting its state with aria-pressed.
    toggle(
      name: IconName,
      label: MessageKey,
      initial: boolean,
      change: (pressed: boolean) => void,
    ) {
      let pressed = initial;
      const button = this.tool(name, label, () => {
        pressed = !pressed;
        button.setAttribute("aria-pressed", String(pressed));
        change(pressed);
      });
      button.setAttribute("aria-pressed", String(pressed));
      return button;
    },
    // The panel's toolbar; returns the Upload button, shown for remote
    // folders only.
    addTools(run: {
      readonly up: () => unknown;
      readonly home: () => unknown;
      readonly refresh: () => unknown;
      readonly follow: (pressed: boolean) => void;
      readonly hidden: (pressed: boolean) => void;
      readonly newFolder: () => void;
      readonly newFile: () => void;
      readonly upload: () => void;
    }) {
      this.tool("up", "files.up", () => void run.up());
      this.tool("home", "files.home", () => void run.home());
      this.tool("refresh", "common.refresh", () => void run.refresh());
      this.toggle("follow", "files.follow", true, run.follow);
      this.toggle("hidden", "files.showHidden", false, run.hidden);
      this.tool("newFolder", "files.newFolder", run.newFolder);
      this.tool("newFile", "files.newFile", run.newFile);
      const upload = this.tool("send", "files.upload", run.upload);
      upload.hidden = true;
      return upload;
    },
    // Typing filters; Down or Enter moves to the list; Escape clears.
    bindFilter(render: () => void, focusList: () => void) {
      filter.addEventListener("input", render);
      filter.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown" || event.key === "Enter") {
          event.preventDefault();
          focusList();
        } else if (event.key === "Escape" && filter.value !== "") {
          event.preventDefault();
          event.stopPropagation();
          filter.value = "";
          render();
          focusList();
        }
      });
    },
    // One button per path component; the last is the current location.
    renderCrumbs(
      directory: string | undefined,
      separator: "/" | "\\",
      join: (parent: string, name: string) => string,
      navigate: (target: string) => void,
    ) {
      crumbs.replaceChildren();
      if (directory === undefined) return;
      const drive = separator === "\\";
      let accumulated = drive ? "" : "/";
      const crumb = (label: string, target: string) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => navigate(target));
        crumbs.append(button);
      };
      if (!drive) crumb("/", "/");
      directory
        .split(separator)
        .filter(Boolean)
        .forEach((part, index) => {
          accumulated =
            drive && index === 0
              ? `${part}${separator}`
              : join(accumulated, part);
          crumb(part, accumulated);
        });
      crumbs.lastElementChild?.setAttribute("aria-current", "location");
      crumbs.scrollLeft = crumbs.scrollWidth;
    },
  };
}
