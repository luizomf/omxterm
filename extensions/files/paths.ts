// Host paths as the backend reports them: POSIX, or Windows drive paths such
// as C:\Users\me. The separator follows the path itself, not the view's OS.
const drive = /^[A-Za-z]:[\\/]/;
const windows = (path: string) => drive.test(path);

const root = (path: string) => (windows(path) ? path.slice(0, 3) : "/");

export const isRoot = (path: string) => path === root(path);

export const join = (base: string, name: string) =>
  isRoot(base) ? base + name : base + (windows(base) ? "\\" : "/") + name;

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

/** One entry name for `directory`: no separators, dot names or NUL. */
export const validName = (name: string, directory: string) =>
  !!name &&
  name !== "." &&
  name !== ".." &&
  !name.includes("/") &&
  !name.includes("\0") &&
  !(windows(directory) && name.includes("\\"));
