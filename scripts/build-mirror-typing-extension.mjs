import { pathToFileURL } from "node:url";
import { buildExtension } from "./build-files-extension.mjs";

export function buildMirrorTypingExtension(output, suppliedCommit) {
  return buildExtension("mirror-typing", output, suppliedCommit);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length > 4)
    throw new Error(
      "Usage: build-mirror-typing-extension.mjs [OUTPUT [SOURCE_COMMIT]]",
    );
  await buildMirrorTypingExtension(process.argv[2], process.argv[3]);
  console.log(
    "Built separate Mirror Typing archive, checksum and unqualified build receipt.",
  );
}
