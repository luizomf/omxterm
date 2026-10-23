import { createTranslator, type Translator } from "../shared/i18n";
import type { MessageKey } from "../shared/locales/en";
import {
  addToGroup,
  groupsOf,
  MAX_GROUP_NAME_LENGTH,
  nextGroupColor,
  normalizeGroups,
  TAB_COLORS,
  type TabGroup,
} from "./tab-groups";
import type { MenuPosition } from "./tab-strip";
import type { PaneLaunch, TerminalTab } from "./terminal-tab-model";
import type { TabsContext } from "./terminal-tabs-types";
import { createTab } from "./terminal-pane-lifecycle";
import { renderStrip, select, selectedTab } from "./terminal-tabs-view";
import { showContextMenu, type ContextMenuItem } from "./ui/context-menu";
import { openModal, promptText } from "./ui/modal";
import { tabArrangeItems } from "./terminal-tab-actions";

const MAX_TAB_TITLE_LENGTH = 200;
let english: Translator | undefined;
const translatorOf = (ctx: TabsContext): Translator =>
  ctx.options.translator ?? (english ??= createTranslator("en"));

// Reorders tabs while keeping the same tab selected.
function keepSelection(ctx: TabsContext, change: () => void): void {
  const selected = selectedTab(ctx);
  change();
  normalizeGroups(ctx.tabs);
  ctx.selectedIndex = selected ? ctx.tabs.indexOf(selected) : -1;
  renderStrip(ctx);
}

export function openTabMenu(
  ctx: TabsContext,
  tab: TerminalTab,
  position: MenuPosition,
): void {
  if (ctx.disposed || tab.removed) return;
  const translator = translatorOf(ctx);
  const t = translator.t.bind(translator);
  const document = ctx.document;
  const items: ContextMenuItem[] = [
    {
      label: t("tabs.rename"),
      action: () =>
        void promptText(document, {
          title: t("tabs.name"),
          label: t("tabs.name"),
          value: tab.title ?? tab.focused.label,
          confirmLabel: t("common.save"),
          cancelLabel: t("common.cancel"),
        }).then((value) => {
          if (value === undefined || tab.removed) return;
          tab.title = value.trim().slice(0, MAX_TAB_TITLE_LENGTH) || undefined;
          renderStrip(ctx);
        }),
    },
    {
      label: t("tabs.color"),
      action: () =>
        void chooseColor(
          document,
          translator,
          t("tabs.colorTitle"),
          tab.color,
        ).then((color) => {
          if (color === undefined || tab.removed) return;
          tab.color = color || undefined;
          renderStrip(ctx);
        }),
    },
    { label: t("tabs.duplicate"), action: () => duplicateTab(ctx, tab) },
    ...tabArrangeItems(ctx, t, tab),
    { separator: true },
    {
      label: t("tabs.newGroup"),
      action: () =>
        void promptGroupName(document, translator, "").then((name) => {
          if (name === undefined || tab.removed) return;
          tab.group = {
            name,
            color: nextGroupColor(ctx.tabs),
            collapsed: false,
          };
          keepSelection(ctx, () => addToGroup(ctx.tabs, tab, tab.group!));
        }),
    },
    ...groupsOf(ctx.tabs)
      .filter((group) => group !== tab.group)
      .map((group) => ({
        label: t("tabs.addToGroup", { name: group.name }),
        action: () =>
          keepSelection(ctx, () => addToGroup(ctx.tabs, tab, group)),
      })),
    ...(tab.group
      ? [
          {
            label: t("tabs.removeFromGroup"),
            action: () => removeFromGroup(ctx, tab),
          },
        ]
      : []),
  ];
  showContextMenu(document, position, items);
}

export function openGroupMenu(
  ctx: TabsContext,
  group: TabGroup,
  position: MenuPosition,
): void {
  if (ctx.disposed) return;
  const translator = translatorOf(ctx);
  const t = translator.t.bind(translator);
  const document = ctx.document;
  showContextMenu(document, position, [
    {
      label: t("tabs.renameGroup"),
      action: () =>
        void promptGroupName(document, translator, group.name).then((name) => {
          if (name === undefined) return;
          group.name = name;
          renderStrip(ctx);
        }),
    },
    {
      label: t("tabs.groupColor"),
      action: () =>
        void chooseColor(
          document,
          translator,
          t("tabs.groupColor"),
          group.color,
          false,
        ).then((color) => {
          if (!color) return;
          group.color = color;
          renderStrip(ctx);
        }),
    },
    {
      label: group.collapsed ? t("tabs.expandGroup") : t("tabs.collapseGroup"),
      action: () => toggleGroup(ctx, group),
    },
    { separator: true },
    {
      label: t("tabs.ungroup"),
      action: () => {
        for (const tab of ctx.tabs)
          if (tab.group === group) tab.group = undefined;
        renderStrip(ctx);
      },
    },
  ]);
}

export function toggleGroup(ctx: TabsContext, group: TabGroup): void {
  group.collapsed = !group.collapsed;
  renderStrip(ctx);
}

function removeFromGroup(ctx: TabsContext, tab: TerminalTab): void {
  const group = tab.group;
  if (!group) return;
  // Leaving from the middle would split the group: move to its end first.
  keepSelection(ctx, () => {
    addToGroup(ctx.tabs, tab, group);
    tab.group = undefined;
  });
}

// A new tab after this one, in its group, opening what its focused pane
// opened: the same Saved Session or Quick Connect target, or a shell in the
// same directory.
function duplicateTab(ctx: TabsContext, tab: TerminalTab): void {
  if (ctx.disposed || ctx.closing || tab.removed) return;
  const source = tab.focused;
  const spec = source.launch.spec;
  const sessionId = source.adapter.sessionId();
  const launch: PaneLaunch =
    spec?.kind === "saved-session" || spec?.kind === "quick-ssh"
      ? source.launch
      : sessionId === undefined
        ? {}
        : { spec: { kind: "inherit", sessionId } };
  void createTab(ctx, launch).catch(() => {});
  const copy = ctx.tabs.at(-1);
  if (!copy || copy === tab) return;
  copy.color = tab.color;
  copy.group = tab.group;
  ctx.tabs.splice(ctx.tabs.indexOf(copy), 1);
  ctx.tabs.splice(ctx.tabs.indexOf(tab) + 1, 0, copy);
  select(ctx, ctx.tabs.indexOf(copy));
}

function promptGroupName(
  document: Document,
  translator: Translator,
  value: string,
): Promise<string | undefined> {
  const t = translator.t.bind(translator);
  return promptText(document, {
    title: t("tabs.groupName"),
    label: t("tabs.groupName"),
    value,
    confirmLabel: t("common.save"),
    cancelLabel: t("common.cancel"),
    validate: (name) =>
      name.trim().length === 0 || name.trim().length > MAX_GROUP_NAME_LENGTH
        ? t("sessions.validation.name")
        : undefined,
  }).then((name) => name?.trim());
}

// Resolves a palette color, "" for no color, or undefined when cancelled.
async function chooseColor(
  document: Document,
  translator: Translator,
  title: string,
  current: string | undefined,
  allowNone = true,
): Promise<string | undefined> {
  const t = translator.t.bind(translator);
  let chosen = current ?? "";
  const body = document.createElement("div");
  body.className = "tab-color-swatches";
  body.setAttribute("role", "radiogroup");
  body.setAttribute("aria-label", title);
  const swatches = [
    ...(allowNone ? ([["none", ""]] as const) : []),
    ...TAB_COLORS,
  ].map(([name, value]) => {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "tab-color-swatch";
    swatch.setAttribute("role", "radio");
    const label =
      name === "none"
        ? t("tabs.noColor")
        : t(`tabs.color.${name}` as MessageKey);
    swatch.setAttribute("aria-label", label);
    swatch.title = label;
    if (value) swatch.style.setProperty("--swatch", value);
    else swatch.classList.add("none");
    swatch.addEventListener("click", () => {
      chosen = value;
      for (const other of swatches)
        other.setAttribute("aria-checked", String(other === swatch));
    });
    swatch.setAttribute("aria-checked", String(value === chosen));
    return swatch;
  });
  body.append(...swatches);
  const apply = await openModal(document, {
    title,
    body,
    className: "tab-color-dialog",
    initialFocus:
      swatches.find(
        (swatch) => swatch.getAttribute("aria-checked") === "true",
      ) ?? swatches[0]!,
    actions: [
      { label: t("common.cancel"), value: false },
      { label: t("common.save"), value: true, kind: "primary" },
    ],
  });
  return apply ? chosen : undefined;
}
