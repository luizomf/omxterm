import type { AboutBridge, AboutLink } from "../../shared/about";

export function mountAboutDialog(
  document: Document,
  bridge: AboutBridge | undefined,
  canOpen: () => boolean,
  options: Pick<
    Parameters<typeof createAboutDialog>[1],
    "focusTerminal" | "onActivityChange"
  >,
) {
  if (!bridge) return undefined;
  const dialog = createAboutDialog(document, { ...bridge, ...options });
  const removeOpen = bridge.onOpen(() => {
    if (canOpen()) dialog.open();
  });
  return {
    isActive: dialog.isActive,
    dispose() {
      removeOpen();
      dialog.dispose();
    },
  };
}

// Dismissal restores terminal focus before the physical gesture ends. Keep
// its repeats/release out of the window-level encoder, but never eat a fresh
// terminal press after a lost keyup. State belongs to this document's owner.
function retainAboutDismissalGesture(document: Document) {
  const page = document.defaultView;
  let owned: string | undefined;
  const identity = (event: KeyboardEvent) =>
    event.code || `${event.key}:${event.location}`;
  const release = () => {
    owned = undefined;
  };
  const onKey = (event: KeyboardEvent) => {
    if (owned !== identity(event)) return;
    if (event.type === "keydown" && !event.repeat) {
      release();
      return;
    }
    if (event.type === "keyup") release();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  page?.addEventListener("keydown", onKey, true);
  page?.addEventListener("keyup", onKey, true);
  page?.addEventListener("blur", release);
  return {
    track(event: KeyboardEvent, closeButton: HTMLButtonElement) {
      if (
        event.key === "Escape" ||
        (event.key === "Enter" && event.target === closeButton)
      )
        owned = identity(event);
    },
    dispose() {
      release();
      page?.removeEventListener("keydown", onKey, true);
      page?.removeEventListener("keyup", onKey, true);
      page?.removeEventListener("blur", release);
    },
  };
}

// Text-safe rendering and named links adapted from ruscher/omxterm PR #622,
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT). Its AshyTerm-style
// presentation is credited in THIRD_PARTY_NOTICES.md; notices remain in distribution.
export function createAboutDialog(
  document: Document,
  options: Pick<AboutBridge, "info" | "openLink"> & {
    readonly focusTerminal: () => void;
    readonly onActivityChange: (active: boolean) => void;
  },
) {
  let dialog: HTMLDialogElement | undefined;
  let disposed = false;
  const keyboard = retainAboutDismissalGesture(document);
  const close = (restoreFocus: boolean) => {
    const previous = dialog;
    if (!previous) return;
    dialog = undefined;
    if (restoreFocus) previous.close();
    previous.remove();
    options.onActivityChange(false);
    if (restoreFocus) options.focusTerminal();
  };
  return {
    isActive: () => dialog !== undefined,
    open() {
      if (disposed) return;
      if (dialog) {
        dialog.querySelector<HTMLButtonElement>(".about-close")?.focus();
        return;
      }
      const current = document.createElement("dialog");
      dialog = current;
      current.className = "about-dialog";
      current.setAttribute("aria-labelledby", "about-title");
      const title = document.createElement("h2");
      title.id = "about-title";
      title.textContent = "About OMXTerm";
      const icon = document.createElement("img");
      icon.src = "./application-icon.png";
      icon.alt = "";
      icon.width = 64;
      icon.height = 64;
      const name = document.createElement("p");
      name.className = "about-name";
      name.textContent = "OMXTerm";
      const version = document.createElement("p");
      version.textContent = "Loading version…";
      const copyright = document.createElement("p");
      const license = document.createElement("p");
      license.textContent = "MIT licensed. Provided without warranty.";
      const error = document.createElement("p");
      error.setAttribute("role", "status");
      const links = document.createElement("div");
      links.className = "about-links";
      for (const [label, link] of [
        ["Project", "website"],
        ["Contributors", "contributors"],
        ["Report an issue", "issues"],
        ["MIT License", "license"],
      ] satisfies [string, AboutLink][]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
          if (dialog !== current) return;
          void options.openLink(link).catch(() => {
            if (dialog === current)
              error.textContent = "Could not open the link.";
          });
        });
        links.append(button);
      }
      const done = document.createElement("button");
      done.type = "button";
      done.className = "about-close";
      done.textContent = "Close";
      done.addEventListener("click", () => {
        if (dialog === current) close(true);
      });
      current.addEventListener("cancel", (event) => {
        event.preventDefault();
        if (dialog === current) close(true);
      });
      current.addEventListener("keydown", (event) => {
        keyboard.track(event, done);
        event.stopPropagation();
      });
      current.append(
        title,
        icon,
        name,
        version,
        copyright,
        license,
        links,
        error,
        done,
      );
      document.body.append(current);
      options.onActivityChange(true);
      current.showModal();
      done.focus();
      void options
        .info()
        .then((info) => {
          if (dialog !== current) return;
          name.textContent = info.name;
          version.textContent = `Version ${info.version}`;
          copyright.textContent = info.copyright;
        })
        .catch(() => {
          if (dialog === current)
            version.textContent = "Application information unavailable.";
        });
    },
    dispose() {
      disposed = true;
      keyboard.dispose();
      close(false);
    },
  };
}
