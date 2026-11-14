// @vitest-environment jsdom
import { expect, it } from "vitest";
import { createIcon, setIcon } from "../../src/shared/ui-icons";

it("draws a decorative icon that takes the host's color and leaves naming to it", () => {
  const icon = createIcon(document, "x");
  expect(icon.getAttribute("aria-hidden")).toBe("true");
  expect(icon.getAttribute("stroke")).toBe("currentColor");
  expect(icon.getAttribute("fill")).toBe("none");
  expect(icon.childElementCount).toBeGreaterThan(0);
  expect(
    createIcon(document, "diamond", { solid: true }).getAttribute("fill"),
  ).toBe("currentColor");
});

it("replaces a control's content with one icon and leaves it alone when already shown", () => {
  const button = document.createElement("button");
  button.textContent = "×";
  setIcon(button, "x");
  const shown = button.firstElementChild;
  expect(button.textContent).toBe("");
  setIcon(button, "x");
  expect(button.firstElementChild).toBe(shown);
  setIcon(button, "minus");
  expect(button.childElementCount).toBe(1);
  expect(button.firstElementChild).not.toBe(shown);
});
