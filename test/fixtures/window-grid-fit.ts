export function windowGridFits(
  backing: { readonly width: number; readonly height: number },
  cell: { readonly width: number; readonly height: number },
  grid: { readonly cols: number; readonly rows: number },
): boolean {
  return (
    [
      backing.width,
      backing.height,
      cell.width,
      cell.height,
      grid.cols,
      grid.rows,
    ].every((value) => Number.isSafeInteger(value) && value > 0) &&
    grid.cols === Math.floor(backing.width / cell.width) &&
    grid.rows === Math.floor(backing.height / cell.height)
  );
}
