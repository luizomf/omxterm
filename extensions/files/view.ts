import {
  mountHostedAppearance,
  type AppearanceBridge,
} from "../shared/appearance.js";
import { mountFilesPage } from "./page.js";

const bridge = (
  window as unknown as {
    omxHostedContent: AppearanceBridge & Parameters<typeof mountFilesPage>[1];
  }
).omxHostedContent;
mountHostedAppearance(document, bridge);
mountFilesPage(document, bridge);
