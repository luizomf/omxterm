import { describe, expect, it } from "vitest";
import {
  duplicateName,
  favoriteSessions,
  folderChoices,
  folderPath,
  recentSessions,
  sessionSubtitle,
  visibleSessionTree,
} from "../../src/renderer/sessions/session-tree";
import type { SavedSessionsDocument } from "../../src/shared/saved-sessions";

const compare = new Intl.Collator("en", { sensitivity: "base" }).compare;
const document: SavedSessionsDocument = {
  folders: [
    { id: "prod", name: "Production" },
    { id: "db", name: "Databases", parentId: "prod" },
    { id: "lab", name: "Lab" },
  ],
  sessions: [
    {
      id: "a",
      kind: "ssh",
      name: "web-1",
      host: "web1.example.com",
      user: "deploy",
      authentication: "agent",
      folderId: "prod",
      favorite: true,
      lastUsedAt: 10,
    },
    {
      id: "b",
      kind: "ssh",
      name: "postgres",
      host: "db.internal",
      port: 2222,
      authentication: "key",
      folderId: "db",
      lastUsedAt: 30,
    },
    {
      id: "c",
      kind: "local",
      name: "Logs",
      workingDirectory: "/var/log",
      lastUsedAt: 20,
    },
  ],
};

const names = (rows: ReturnType<typeof visibleSessionTree>) =>
  rows.map((row) =>
    row.kind === "folder"
      ? `${"  ".repeat(row.depth)}[${row.folder.name}:${row.count}]`
      : `${"  ".repeat(row.depth)}${row.session.name}`,
  );

describe("Saved Session tree", () => {
  it("lists collapsed folders before root sessions", () => {
    expect(
      names(
        visibleSessionTree(document, {
          query: "",
          expanded: new Set(),
          compare,
        }),
      ),
    ).toEqual(["[Lab:0]", "[Production:2]", "Logs"]);
  });

  it("shows expanded folders recursively with sorted children", () => {
    expect(
      names(
        visibleSessionTree(document, {
          query: "",
          expanded: new Set(["prod", "db"]),
          compare,
        }),
      ),
    ).toEqual([
      "[Lab:0]",
      "[Production:2]",
      "  [Databases:1]",
      "    postgres",
      "  web-1",
      "Logs",
    ]);
  });

  it("searches names, hosts and directories and reveals matching ancestors only", () => {
    expect(
      names(
        visibleSessionTree(document, {
          query: "DB.INT",
          expanded: new Set(),
          compare,
        }),
      ),
    ).toEqual(["[Production:1]", "  [Databases:1]", "    postgres"]);
    expect(
      names(
        visibleSessionTree(document, {
          query: "var/log",
          expanded: new Set(),
          compare,
        }),
      ),
    ).toEqual(["Logs"]);
    expect(
      visibleSessionTree(document, {
        query: "nothing",
        expanded: new Set(),
        compare,
      }),
    ).toEqual([]);
  });

  it("derives favorites, recents, subtitles and folder paths", () => {
    expect(favoriteSessions(document, compare).map((s) => s.id)).toEqual(["a"]);
    expect(recentSessions(document, 2).map((s) => s.id)).toEqual(["b", "c"]);
    expect(sessionSubtitle(document.sessions[0]!)).toBe(
      "deploy@web1.example.com",
    );
    expect(sessionSubtitle(document.sessions[1]!)).toBe("db.internal:2222");
    expect(sessionSubtitle(document.sessions[2]!)).toBe("/var/log");
    expect(folderPath(document, "db")).toBe("Production / Databases");
    expect(folderPath(document, undefined)).toBe("");
  });

  it("never offers a folder as a destination inside itself", () => {
    expect(folderChoices(document, "prod").map((f) => f.id)).toEqual(["lab"]);
    expect(folderChoices(document).map((f) => f.id)).toEqual([
      "prod",
      "db",
      "lab",
    ]);
  });

  it("names duplicates uniquely within their folder", () => {
    const withCopy: SavedSessionsDocument = {
      ...document,
      sessions: [
        ...document.sessions,
        { ...document.sessions[2]!, id: "d", name: "Logs (2)" },
      ],
    };
    expect(duplicateName(withCopy, document.sessions[2]!)).toBe("Logs (3)");
    expect(duplicateName(document, document.sessions[0]!)).toBe("web-1 (2)");
  });
});
