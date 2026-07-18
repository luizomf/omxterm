#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const COLOR_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
];

async function main() {
  const [inputPath, outputPath, ...unexpected] = process.argv.slice(2);
  if (!inputPath || unexpected.length > 0) {
    throw new Error(
      "Usage: node scripts/convert-ghostty-theme.mjs INPUT [OUTPUT]",
    );
  }

  const source = await readFile(inputPath, "utf8");
  const values = new Map();
  const palette = new Map();

  for (const [index, rawLine] of source.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator < 0)
      throw new Error(`Invalid Ghostty theme line ${index + 1}: ${line}`);

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key !== "palette") {
      values.set(key, value);
      continue;
    }

    const match = /^(\d+)\s*=\s*(#[0-9a-f]{6})$/iu.exec(value);
    if (!match)
      throw new Error(`Invalid Ghostty palette line ${index + 1}: ${line}`);
    palette.set(Number(match[1]), match[2]);
  }

  const name = path.basename(inputPath, path.extname(inputPath));
  if (
    name.length === 0 ||
    Array.from(name).length > 64 ||
    /[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(name)
  ) {
    throw new Error(
      "The input filename must provide a printable theme name of at most 64 characters",
    );
  }

  const requiredColor = (key) => {
    const value = values.get(key);
    if (!/^#[0-9a-f]{6}$/iu.test(value ?? ""))
      throw new Error(`Missing or invalid Ghostty color: ${key}`);
    return value;
  };

  const colors = {
    background: requiredColor("background"),
    foreground: requiredColor("foreground"),
    cursor: requiredColor("cursor-color"),
    selectionBackground: requiredColor("selection-background"),
    selectionForeground: requiredColor("selection-foreground"),
  };

  for (const [index, key] of COLOR_KEYS.entries()) {
    const value = palette.get(index);
    if (!value) throw new Error(`Missing Ghostty palette color: ${index}`);
    colors[key] = value;
  }

  const output = `${JSON.stringify({ version: 1, name, colors }, null, 2)}\n`;
  if (outputPath) await writeFile(outputPath, output, "utf8");
  else process.stdout.write(output);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
