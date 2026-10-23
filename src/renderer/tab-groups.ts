// Named, colored groups of adjacent tabs, as in AshyTerm. A group lives only
// in its window; its tabs always stay next to each other in the strip.
export interface TabGroup {
  name: string;
  color: string;
  collapsed: boolean;
}

export interface GroupedTab {
  group?: TabGroup | undefined;
}

// AshyTerm's palette (Adwaita named colors).
export const TAB_COLORS: readonly (readonly [name: string, value: string])[] = [
  ["red", "#f66151"],
  ["orange", "#ffa348"],
  ["yellow", "#f8e45c"],
  ["green", "#57e389"],
  ["cyan", "#5bc8af"],
  ["blue", "#62a0ea"],
  ["purple", "#c061cb"],
  ["pink", "#f5c2e7"],
];

export const MAX_GROUP_NAME_LENGTH = 64;

export function groupsOf<Tab extends GroupedTab>(
  tabs: readonly Tab[],
): TabGroup[] {
  return [
    ...new Set(
      tabs
        .map((tab) => tab.group)
        .filter((group): group is TabGroup => group !== undefined),
    ),
  ];
}

// The first palette color no group in the window uses yet.
export function nextGroupColor<Tab extends GroupedTab>(
  tabs: readonly Tab[],
): string {
  const used = new Set(groupsOf(tabs).map((group) => group.color));
  return (
    TAB_COLORS.find(([, value]) => !used.has(value))?.[1] ??
    TAB_COLORS[groupsOf(tabs).length % TAB_COLORS.length]![1]
  );
}

// Moves `tab` into `group`, right after the group's last tab.
export function addToGroup<Tab extends GroupedTab>(
  tabs: Tab[],
  tab: Tab,
  group: TabGroup,
): void {
  const from = tabs.indexOf(tab);
  if (from < 0) return;
  tabs.splice(from, 1);
  tab.group = group;
  let last = -1;
  tabs.forEach((candidate, index) => {
    if (candidate.group === group) last = index;
  });
  tabs.splice(last < 0 ? Math.min(from, tabs.length) : last + 1, 0, tab);
}

// After a tab is dragged, a member that is no longer next to the rest of its
// group leaves it, so every group stays one contiguous run.
export function normalizeGroups<Tab extends GroupedTab>(tabs: Tab[]): void {
  const seen = new Set<TabGroup>();
  tabs.forEach((tab, index) => {
    const group = tab.group;
    if (!group) return;
    if (seen.has(group) && tabs[index - 1]?.group !== group)
      tab.group = undefined;
    else seen.add(group);
  });
}
