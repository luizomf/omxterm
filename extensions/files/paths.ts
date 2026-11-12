// Host paths as the backend reports them: POSIX, or Windows paths on a drive
// (C:\Users\me) or a network share (\\server\share\folder). The separator
// follows the path itself, not the view's OS.
const drive = /^[A-Za-z]:[\\/]/;
const share = /^\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/;
const windows = (path: string) => drive.test(path) || share.test(path);

function root(path: string) {
  if (drive.test(path)) return path.slice(0, 3);
  const unc = share.exec(path)?.[0];
  if (unc) return /[\\/]$/.test(unc) ? unc : unc + "\\";
  return "/";
}

export const isRoot = (path: string) =>
  path === root(path) || path + "\\" === root(path);

export const join = (base: string, name: string) =>
  isRoot(base) ? root(base) + name : base + (windows(base) ? "\\" : "/") + name;

export function parent(path: string) {
  const index = windows(path)
    ? Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"))
    : path.lastIndexOf("/");
  const top = root(path);
  return index < top.length ? top : path.slice(0, index);
}

/** True when `path` is strictly below `directory`. */
export function inside(path: string, directory: string) {
  for (let current = path; !isRoot(current);) {
    current = parent(current);
    if (current === directory) return true;
  }
  return false;
}

/** One entry name for `directory`: no separators, dot names or NUL. Windows
 * also refuses its reserved characters (a colon names a data stream) and a
 * trailing dot or space, which it would silently trim. */
export const validName = (name: string, directory: string) =>
  !!name &&
  name !== "." &&
  name !== ".." &&
  !name.includes("/") &&
  !name.includes("\0") &&
  !(windows(directory) && /[<>:"|?*\\\x00-\x1f]|[. ]$/.test(name));
