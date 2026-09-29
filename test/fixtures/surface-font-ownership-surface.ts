import { mountResttyTerminalSurface as mountRealSurface } from "../../src/terminal-surface/restty-terminal-surface";

const cells: Array<{ height: number; width: number } | null> = [];
const queries: Array<() => void> = [];
Object.assign(globalThis, {
  fontOwnershipCells: cells,
  queryFontCell: (index: number) => queries[index]!(),
});

export const mountResttyTerminalSurface: typeof mountRealSurface = async (
  container,
  adapter,
  options,
) => {
  const index = cells.length;
  cells.push(null);
  return mountRealSurface(
    container,
    {
      ...adapter,
      start(handlers) {
        queries[index] = () => handlers.onOutput("\u001b[16t");
        return adapter.start(handlers);
      },
      write(data) {
        const cell = /^\u001b\[6;(\d+);(\d+)t$/u.exec(data);
        if (cell) {
          // This fixture's synthetic query measures real core/native font metrics;
          // consume its reply here rather than typing it into the test program.
          cells[index] = { height: Number(cell[1]), width: Number(cell[2]) };
        } else adapter.write(data);
      },
    },
    options,
  );
};
