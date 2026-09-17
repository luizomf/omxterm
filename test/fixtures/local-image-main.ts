import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { app, nativeImage } from "electron";
import { readLocalImage } from "../../src/main/local-image";

const resultPrefix = "__OMXTERM_LOCAL_IMAGE_RESULT__";

async function run() {
  for (const name of ["userData", "sessionData"] as const) {
    const directory = path.join(process.cwd(), name);
    mkdirSync(directory, { recursive: true });
    app.setPath(name, directory);
  }
  await app.whenReady();
  const validateDecodedImage = (
    bytes: Uint8Array,
    expected: { readonly width: number; readonly height: number },
  ) => {
    const decoded = nativeImage.createFromBuffer(Buffer.from(bytes));
    const size = decoded.getSize();
    return (
      !decoded.isEmpty() &&
      size.width === expected.width &&
      size.height === expected.height
    );
  };
  const loaded = await readLocalImage(
    path.join(process.cwd(), "fixture.data"),
    { validateDecodedImage },
  );
  const jpegBytes = nativeImage
    .createFromBuffer(Buffer.from(loaded.data))
    .toJPEG(90);
  const jpegPath = path.join(process.cwd(), "fixture-jpeg.data");
  await writeFile(jpegPath, jpegBytes);
  const jpeg = await readLocalImage(jpegPath, { validateDecodedImage });
  process.stdout.write(
    `${resultPrefix}${JSON.stringify({
      isolatedProfiles: (["userData", "sessionData"] as const).every(
        (name) => path.dirname(app.getPath(name)) === process.cwd(),
      ),
      mime: loaded.mime,
      width: loaded.width,
      height: loaded.height,
      bytes: loaded.data.byteLength,
      jpegMime: jpeg.mime,
      jpegWidth: jpeg.width,
      jpegHeight: jpeg.height,
    })}\n`,
  );
  app.exit(0);
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  app.exit(1);
});
