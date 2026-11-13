import { expect, it } from "vitest";
import { paneArgument } from "../../src/agent-ctl/commands";

// A pane may be named as list shows it or as $OMXTERM_PANE spells it.
const instance = "5f0c9a1e2b3d4c6f";

it.each(["s4", "3:s4", `${instance}:3:s4`])("accepts %s", (value) => {
  expect(paneArgument(value, 3, instance)).toBe("s4");
});

it.each([
  "3:s4:s4",
  `${instance}:s4`,
  `${instance}:3:`,
  `${instance.toUpperCase()}:3:s4`,
  "abc:3:s4",
  "4",
  "",
  undefined,
])("asks for a pane when given %s", (value) => {
  expect(() => paneArgument(value, 3, instance)).toThrow(/Name a pane/u);
});

it.each(["2:s4", `${instance}:2:s4`, "0000000000000000:3:s4"])(
  "rejects %s as another window",
  (value) => {
    expect(() => paneArgument(value, 3, instance)).toThrow(
      /belongs to another window/u,
    );
  },
);
