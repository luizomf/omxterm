import { buildExtension } from "./build-files-extension.mjs";
if (process.argv.length > 4)
  throw new Error(
    "Usage: build-snippets-extension.mjs [OUTPUT [SOURCE_COMMIT]]",
  );
await buildExtension("snippets", process.argv[2], process.argv[3]);
console.log(
  "Built separate Snippets archive, checksum and unqualified build receipt.",
);
