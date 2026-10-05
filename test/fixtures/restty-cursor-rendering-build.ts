import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { cursorRuntimeProbe } from "./restty-cursor-runtime-probe";

export async function buildFixture(
  root: string,
  cleanupOwner: FixtureCleanupOwner = "recipe",
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await Promise.all([
        start(() =>
          build({
            entryPoints: ["test/fixtures/restty-cursor-main.ts"],
            outfile: path.join(root, "main.cjs"),
            bundle: true,
            external: ["electron"],
            format: "cjs",
            platform: "node",
            logLevel: "silent",
          }),
        ),
        start(() =>
          build({
            entryPoints: ["test/fixtures/restty-cursor-renderer.ts"],
            outfile: path.join(root, "index.js"),
            bundle: true,
            format: "iife",
            platform: "browser",
            loader: { ".ttf": "binary" },
            plugins: [
              {
                name: "cursor-runtime-probe",
                setup(builder) {
                  builder.onLoad(
                    { filter: /chunk-c0rcpsc5\.js$/ },
                    async ({ path: file }) => ({
                      contents: cursorRuntimeProbe(
                        await readFile(file, "utf8"),
                      ),
                      loader: "js",
                    }),
                  );
                },
              },
            ],
            logLevel: "silent",
          }),
        ),
        start(() =>
          readFile("src/renderer/index.html", "utf8").then((html) =>
            writeFile(path.join(root, "index.html"), html),
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "preload.cjs"),
            `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('cursorFonts',{load:()=>ipcRenderer.invoke('fonts'),interference:(kind,moving)=>ipcRenderer.send('cursor-input-interference',kind,moving)});`,
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "omxterm-cursor-fixture",
              main: "main.cjs",
            }),
          ),
        ),
      ]);
    },
    cleanupOwner,
  );
}
