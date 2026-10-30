import { packageArchive } from "./extension-package-archive";

// Deliberately not Files or Snippets: this private fixture exercises ordinary
// install/activation without advertising a native move primitive or migration.
export function macosCompositionPackage() {
  return packageArchive([
    {
      name: "extension.json",
      data: JSON.stringify({
        format: 1,
        id: "test.composition",
        name: "Composition fixture",
        version: "1.0.0",
        engines: { omxterm: ">=0.24.0-0", api: "0.1.x" },
        backend: "backend.mjs",
        view: {
          entry: "index.html",
          action: "test.composition.open",
          title: "Composition fixture",
        },
      }),
    },
    {
      name: "backend.mjs",
      data: `export function activate() {
  return { invoke(value) { return { message: value }; }, deactivate() {} };
}\n`,
    },
    {
      name: "index.html",
      data: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Composition fixture</title></head><body><h1>Composition fixture</h1><input aria-label="Draft"><output id="reply">Loading</output><script src="view.js"></script></body></html>',
    },
    {
      name: "view.js",
      data: `window.omxHostedContent.request("installed backend replied").then(value => {
  document.querySelector("#reply").textContent = value.message;
});\n`,
    },
  ]);
}
