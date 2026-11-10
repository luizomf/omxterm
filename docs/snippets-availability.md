# Snippets availability

Snippets stores reusable commands or text so you can insert them from the
Snippets panel. It is optional on stable **OMXTerm 0.25.0** for Linux computers
with 64-bit ARM processors (**ARM64**) or Intel/AMD processors (**x64**), Macs
with Apple silicon, and Windows computers with 64-bit ARM processors. The
official catalog offers version **0.1.1** on those targets. Intel/AMD Windows
computers keep built-in Snippets.

The Linux x64 app download is build-only; desktop use has not been tested.

New packaged profiles on optional targets try once to install Snippets 0.1.0;
it remains inactive until you open it. Existing profiles do not get it
automatically, and removing it does not trigger another install. Your saved text
and choices to disable or remove Snippets are preserved.

## Windows ARM64 known issue

OMXTerm 0.25.0 shipped with unresolved Windows ARM64 failures during public
Snippets installation; the cause is not known. Snippets 0.1.1 has not been
qualified on that exact Windows release. If you depend on built-in Snippets, you
can stay on [OMXTerm 0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0).

Windows is also not verified to stay network-silent. One check observed system
proxy discovery and reachability traffic, but no Snippets catalog or archive
download.

## Install or update

1. Open **Settings → Extensions → Browse official extensions** and choose
   **Install** or **Update** on the Snippets card.
2. Review the package and trust prompt before approving. The add-on runs with
   your account's permissions; it is not sandboxed.
3. Choose **View → Toggle Snippets** to open the panel.

See the [developer record](snippets-migration.md) for exact platform results,
qualification evidence and additional limits.
