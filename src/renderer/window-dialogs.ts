import type { AboutBridge } from "../shared/about";
import { mountAboutDialog } from "./about/about-dialog";
import type { RendererLanguage } from "./renderer-language";

// Settings is retained application content, not a modal owner.
export function mountWindowDialogs(
  document: Document,
  bridges: { readonly about?: AboutBridge | undefined },
  canOpen: () => boolean,
  options: {
    readonly language?: RendererLanguage;
    readonly focusTerminal: () => void;
    readonly onActivityChange: (active: boolean) => void;
  },
) {
  const about = mountAboutDialog(document, bridges.about, canOpen, options);
  return { dispose: () => about?.dispose() };
}
