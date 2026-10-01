import assert from "node:assert/strict";
import path from "node:path";

// rootPrefixColumns includes the trailing native separator, measured by the
// real core rather than JS length (a temp root can contain wide/combining text).
export function localImageFixturePaths(
  root: string,
  columns: number,
  rootPrefixColumns: number,
  paths = path,
) {
  root = paths.normalize(root);
  assert.ok(Number.isInteger(columns) && columns > 0);
  assert.ok(Number.isInteger(rootPrefixColumns) && rootPrefixColumns > 0);
  for (const component of root
    .slice(paths.parse(root).root.length)
    .split(paths.sep))
    assert.ok(
      Buffer.byteLength(component, "utf8") <= 255,
      "fixture root component exceeds NAME_MAX",
    );

  // ASCII padding contributes exactly one byte and one terminal column per
  // character. Include each inserted separator in the column budget. Keep
  // components well below NAME_MAX; never truncate the complete destination.
  function paddedPath(padding: number, filename: string, letter: string) {
    const directories: string[] = [];
    while (padding > 120) {
      const length = Math.min(120, padding - 2);
      directories.push(letter.repeat(length));
      padding -= length + 1;
    }
    return paths.join(root, ...directories, letter.repeat(padding) + filename);
  }
  const boundarySpace = Math.max(
    2 * columns - 1,
    Math.ceil((rootPrefixColumns + 16) / columns) * columns - 1,
  );
  const longDirectoryColumns = Math.max(columns + 16, rootPrefixColumns + 16);
  return {
    shortPath: paths.join(root, "a photo.png"),
    jpegPath: paths.join(root, "a photo.jpg"),
    longPath: paths.join(
      paddedPath(longDirectoryColumns - rootPrefixColumns, "", "l"),
      "a photo.png",
    ),
    boundaryPath: paddedPath(
      boundarySpace - rootPrefixColumns,
      " photo.png",
      "b",
    ),
  };
}
