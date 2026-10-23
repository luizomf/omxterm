import type { AboutLink } from "../../shared/about";
import type { Translator } from "../../shared/i18n";
import type { AboutBridge } from "../../shared/terminal-bridge";
import { applicationIconSvg } from "../application-icon";
import { openModal } from "../ui/modal";

// A link that main opens in the browser; the renderer names it, never the
// address.
function linkButton(
  document: Document,
  label: string,
  open: () => void,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "about-link";
  button.textContent = label;
  button.addEventListener("click", open);
  return button;
}

function heading(document: Document, text: string): HTMLElement {
  const element = document.createElement("h3");
  element.textContent = text;
  return element;
}

// AshyTerm-style About dialog: icon, version, authors, copyleft, the MIT
// warranty notice and a button for reporting issues.
export async function openAboutDialog(
  document: Document,
  translator: Translator,
  bridge: AboutBridge,
  notify: (message: string) => void,
): Promise<void> {
  const t = translator.t.bind(translator);
  const info = await bridge.info();
  const open = (link: AboutLink) => () =>
    void bridge.openLink(link).catch((cause: unknown) => notify(String(cause)));

  const body = document.createElement("div");
  body.className = "about";
  const icon = document.createElement("div");
  icon.className = "about-icon";
  icon.setAttribute("aria-hidden", "true");
  const parsed = new DOMParser().parseFromString(
    applicationIconSvg,
    "image/svg+xml",
  ).documentElement;
  icon.append(document.importNode(parsed, true));
  const name = document.createElement("p");
  name.className = "about-name";
  name.textContent = info.name;
  const version = document.createElement("p");
  version.className = "about-version";
  version.textContent = t("about.version", { version: info.version });
  const summary = document.createElement("p");
  summary.textContent = t("about.summary");
  const website = linkButton(document, info.website, open("website"));
  const authors = document.createElement("ul");
  authors.className = "about-authors";
  authors.append(
    ...info.authors.map((author) => {
      // "Name <email>": the name, then the address on its own line.
      const [, name = author, email] =
        /^(.*?)\s*<([^<>]+)>$/u.exec(author) ?? [];
      const item = document.createElement("li");
      const nameLine = document.createElement("span");
      nameLine.className = "about-author-name";
      nameLine.textContent = name;
      item.append(nameLine);
      if (email) {
        const emailLine = document.createElement("span");
        emailLine.className = "about-author-email";
        emailLine.textContent = email;
        item.append(emailLine);
      }
      return item;
    }),
  );
  const copyleft = document.createElement("p");
  copyleft.className = "about-copyleft";
  copyleft.textContent = info.copyleft;
  const warranty = document.createElement("p");
  warranty.className = "about-warranty";
  warranty.append(
    t("about.warrantyBefore"),
    linkButton(document, t("about.mitLicense"), open("license")),
    t("about.warrantyAfter"),
  );
  body.append(
    icon,
    name,
    version,
    summary,
    website,
    heading(document, t("about.authors")),
    authors,
    heading(document, t("about.license")),
    copyleft,
    warranty,
  );

  const report = await openModal(document, {
    title: t("action.about"),
    className: "about-dialog",
    body,
    actions: [
      { label: t("about.reportIssue"), value: "report" as const },
      { label: t("common.close"), value: "close" as const, kind: "primary" },
    ],
  });
  if (report === "report") open("issues")();
}
