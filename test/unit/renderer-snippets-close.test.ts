// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import {
  snippetsWindow,
  cleanupSnippetsWindows,
} from "../fixtures/snippets-window";

afterEach(cleanupSnippetsWindows);
const settle = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};

it("disposes built-in Snippets on Close but keeps its ordinary entry point reopenable", async () => {
  const f = await snippetsWindow();
  f.toggle();
  await settle();
  const query = f.root.querySelector("input")!;
  query.value = "discarded";
  query.dispatchEvent(new Event("input", { bubbles: true }));
  f.root.querySelector<HTMLButtonElement>(".auxiliary-hide")!.click();
  f.toggle();
  await settle();
  expect(f.root.querySelector("input")).toBe(query);
  f.root.querySelector<HTMLButtonElement>(".auxiliary-close")!.click();
  await settle();
  expect(f.root.hidden).toBe(true);
  expect(f.root.querySelector(".auxiliary-tools button")).toBeNull();
  f.toggle();
  await settle();
  expect(f.root.querySelector("input")).not.toBe(query);
  expect(f.root.querySelector("input")!.value).toBe("");
  expect(f.surfaces[0]!.dispose).not.toHaveBeenCalled();
});
