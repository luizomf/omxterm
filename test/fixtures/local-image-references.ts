import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { dialog, type BrowserWindow } from "electron";
import { loadLocalImageForWindow } from "../../src/main/local-image-loader";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import { requestVisibleLink } from "../../src/terminal-surface/restty-visible-links";
import type { LocalImageActivation } from "../../src/shared/local-image";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";

// Real recognizer -> activation routing -> production main loader -> native
// decoder. Only the user's directory-picker selection is controlled here;
// this is not a physical native-dialog interaction test.
export async function checkLocalImageReferences(
  window: BrowserWindow,
  png: Uint8Array,
) {
  const root = process.cwd();
  const target = path.join(root, "reference space.png");
  const plain = path.join(root, "reference.png");
  await writeFile(target, png);
  await writeFile(plain, png);
  await mkdir(path.join(root, "base"), { recursive: true });
  const homePath = `~/${path.relative(homedir(), plain).split(path.sep).join("/")}`;
  let picks = 0;
  let cancelled = false;
  const original = dialog.showOpenDialog;
  dialog.showOpenDialog = (async (
    _owner: BrowserWindow,
    options: Electron.OpenDialogOptions,
  ) => {
    assert.equal(_owner, window);
    assert.equal(options.defaultPath, homedir());
    assert.deepEqual(options.properties, ["openDirectory", "dontAddToRecent"]);
    picks++;
    return {
      canceled: cancelled,
      filePaths: cancelled ? [] : [path.join(root, "base")],
    };
  }) as typeof dialog.showOpenDialog;
  const activate = async (value: string) => {
    const text = `read ${value}`;
    const match = visibleLinkAtOffset(text, 5);
    assert.equal(
      match?.url,
      value,
      "Complete visible reference must be recognized",
    );
    let source: LocalImageActivation | undefined;
    requestVisibleLink(match!.url, {
      onLocalImageActivation: (value) => {
        source = value;
      },
      onExternalLink: () => {
        throw new Error("Local source escaped to browser");
      },
    } as TerminalSurfaceOptions);
    assert.ok(source);
    return loadLocalImageForWindow(
      window,
      source,
      new AbortController().signal,
    );
  };
  try {
    let loaded = 0;
    for (const value of [
      plain,
      `${plain}:1`,
      `'${target}'`,
      `"${target}":12:3`,
      homePath,
      `'${homePath}'`,
      `${homePath}:1`,
      "../reference.png",
      "'../reference space.png'",
    ]) {
      const image = await activate(value);
      assert.equal(image?.mime, "image/png");
      assert.deepEqual([...image!.data], [...png]);
      loaded++;
    }
    assert.equal(picks, 2);
    cancelled = true;
    assert.equal(await activate("../reference.png"), null);
    assert.equal(picks, 3);
    // Literal POSIX colons are legal; Windows colon names denote streams.
    if (process.platform !== "win32") {
      await writeFile(`${plain}:1`, png);
      assert.equal((await activate(`'${plain}:1'`))?.name, "reference.png:1");
      assert.equal((await activate(`${plain}:1`))?.name, "reference.png:1");
      assert.equal((await activate(`'${plain}':1`))?.name, "reference.png");
    }
    const webpUrl = (await window.webContents.executeJavaScript(
      `(() => {const c=document.createElement('canvas');c.width=2;c.height=2;return c.toDataURL('image/webp');})()`,
    )) as string;
    assert.ok(webpUrl.startsWith("data:image/webp;base64,"));
    const bytes = Buffer.from(webpUrl.split(",")[1]!, "base64");
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP");
    const webp = path.join(root, "actual.webp");
    await writeFile(webp, bytes);
    await assert.rejects(
      activate(`'${webp}'`),
      /Unsupported image format.*WebP is not supported/,
    );
    await writeFile(path.join(root, "png.webp"), png);
    assert.equal(
      (await activate(path.join(root, "png.webp")))?.mime,
      "image/png",
    );
    await assert.rejects(activate(path.join(root, "absent.png")), (error) => {
      assert.equal(
        (error as Error).message,
        "The local image could not be loaded",
      );
      return true;
    });
    return {
      loaded,
      directorySelections: 2,
      cancellation: true,
      actualWebpRejected: true,
      disguisedPngAccepted: true,
    };
  } finally {
    dialog.showOpenDialog = original;
  }
}
