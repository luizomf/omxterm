import { mountSnippetsPage, type SnippetsBridge } from "./page.js";
mountSnippetsPage(
  document,
  (window as unknown as { omxHostedContent: SnippetsBridge }).omxHostedContent,
);
