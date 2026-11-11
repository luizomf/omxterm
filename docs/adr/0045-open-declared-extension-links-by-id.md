# Open declared extension links by id

Status: accepted ([#936](https://github.com/luizomf/omxterm/issues/936)).

## Context

The [design system](../ui-style-guide.md) gives each page one short sentence
of guidance and puts details in the docs. Core Settings and About can link to
those docs; extension views couldn't. The Extension View Host denies new
windows and navigation ([ADR 0039](0039-own-packaged-web-content-by-epoch.md)),
and the view preload has no external-link route, so an official view had to
choose between a long paragraph and no pointer at all.

## Decision

Add one host capability, `links.open.v1`. A package that declares it also
declares a small `links` map in its manifest: up to eight lowercase ids, each
naming one exact `https://` URL. The map is required with the capability and
refused without it.

The view sends `{ operation: "links.open.v1", link: "<id>" }` through the
existing own-view request channel, so the usual sender, main-frame, epoch and
capacity checks apply first. Main then requires:

- the capability in the pinned manifest of the running package version;
- exactly the `operation` and `link` keys, with `link` an own key of that
  manifest's `links` map;
- a currently visible view.

Main opens the mapped URL through the same validated route as core links
([ADR 0011](0011-validate-external-links-at-the-main-process.md)): URL
validation, `shell.openExternal`, and the shared failure dialog. Anything
else is refused as `unavailable` and never reaches the backend. The URL and id
stay out of Operational Events; an OS open failure records only the existing
`external-link-open` stage.

## Why not something else

- **Free-form URLs from the view.** The page is package code rendering
  package data; a URL parameter would make every view a general opener. An id
  keeps the destination fixed at install time, under the archive digest and
  trust prompt.
- **A host-owned docs map** (like About's fixed ids). That would tie every
  extension doc link to a host release and leave third-party packages out.
  The manifest map grants no new authority: an installed backend already runs
  unsandboxed with the user's permissions.
- **Allowing `<a href>` navigation.** It would reopen the navigation and
  window-creation surface that ADR 0039 closes.

## Consequences

- Packages that declare the capability need a host that knows it. Older
  hosts refuse the unknown capability and `links` field at install, as they do
  for any newer capability, so such packages raise their `engines.omxterm`
  range and lose catalog offers on older hosts
  ([extension distribution](../extension-distribution.md)).
- A view should render its link only when `host.capabilities` lists
  `links.open.v1`.
- Links are opened in the default browser, never inside OMXTerm.
