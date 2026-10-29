import { mountMirrorTypingPage, type MirrorTypingBridge } from "./page.js";
mountMirrorTypingPage(
  document,
  (window as unknown as { omxHostedContent: MirrorTypingBridge })
    .omxHostedContent,
);
