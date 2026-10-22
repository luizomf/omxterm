import { applicationIconSvg } from "./application-icon";

// The application icon over the window while the first terminal starts, so a
// new window never opens on an empty frame. It never takes pointer input and
// fades out (instantly with reduced motion) once the terminal is ready or the
// start failed.
export function showStartupSplash(document: Document): () => void {
  const splash = document.createElement("div");
  splash.id = "startup-splash";
  splash.setAttribute("aria-hidden", "true");
  const icon = new DOMParser().parseFromString(
    applicationIconSvg,
    "image/svg+xml",
  ).documentElement;
  if (icon.nodeName.toLowerCase() === "svg")
    splash.append(document.importNode(icon, true));
  document.body.append(splash);
  let hidden = false;
  return () => {
    if (hidden) return;
    hidden = true;
    splash.classList.add("done");
    const remove = () => splash.remove();
    splash.addEventListener("transitionend", remove, { once: true });
    // transitionend never fires without a transition (reduced motion).
    setTimeout(remove, 400);
  };
}
