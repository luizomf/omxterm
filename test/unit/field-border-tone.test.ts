import { expect, it } from "vitest";
import {
  fieldBorderTone,
  luminance,
} from "../../src/renderer/terminal-pane-accent";

const contrast = (first: string, second: string) => {
  const [light, dark] = [luminance(first), luminance(second)].sort(
    (a, b) => b - a,
  ) as [number, number];
  return (light + 0.05) / (dark + 0.05);
};

it.each([
  ["a deep black theme", "#000000", "#f4f4f4"],
  ["a light theme", "#faf4ed", "#575279"],
  ["a low-contrast light theme", "#fdf6e3", "#657b83"],
])(
  "outlines fields at 3:1 or more on %s, quieter than its text",
  (_, background, foreground) => {
    const tone = fieldBorderTone(background, foreground);
    expect(contrast(tone, background)).toBeGreaterThanOrEqual(3);
    expect(contrast(tone, background)).toBeLessThan(
      contrast(foreground, background),
    );
  },
);

it("falls back to the text color when a theme's own text is under 3:1", () => {
  expect(fieldBorderTone("#777777", "#999999")).toBe("#999999");
});
