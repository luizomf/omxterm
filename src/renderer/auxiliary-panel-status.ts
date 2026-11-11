import type { RendererLanguage, Translate } from "./renderer-language";

// The panel's single transient, noninteractive status. Relabeling never extends
// its lifetime; the application owner separately grants the once-session notice.
export function createAuxiliaryPanelStatus(
  document: Document,
  language: RendererLanguage,
) {
  const page = document.defaultView!;
  const status = document.createElement("p");
  status.className = "auxiliary-status ui-overlay";
  status.setAttribute("role", "status");
  status.hidden = true;
  document.body.append(status);
  let timer: number | undefined;
  let reason: "empty" | ((t: Translate) => string) | undefined;
  const render = (t: Translate) => {
    if (reason)
      status.textContent = reason === "empty" ? t("panel.empty") : reason(t);
  };
  const unbind = language.bind(render);
  const show = (next: NonNullable<typeof reason>) => {
    if (next === "empty" && reason === "empty") return;
    reason = next;
    render(language.t);
    status.hidden = false;
    if (timer !== undefined) page.clearTimeout(timer);
    timer = page.setTimeout(clear, 4000);
  };
  function clear() {
    if (timer !== undefined) page.clearTimeout(timer);
    timer = undefined;
    reason = undefined;
    status.hidden = true;
  }
  return {
    show,
    clear,
    dispose() {
      clear();
      unbind();
      status.remove();
    },
  };
}
