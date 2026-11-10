# Snippets availability

Snippets stores reusable commands or text so you can insert them from the
Snippets panel. It is optional on stable **OMXTerm 0.25.0** for Linux computers
with 64-bit ARM processors (**ARM64**) or Intel/AMD processors (**x64**), Macs
with Apple silicon, and Windows computers with 64-bit ARM processors. The
official catalog offers version **0.1.1** on those targets. Intel/AMD Windows
computers keep built-in Snippets.

The Linux x64 app itself is untested, and being offered in the catalog doesn't
mean every platform or action has been tested.

New packaged profiles on optional targets try once to install Snippets 0.1.0;
it remains inactive until you open it. Existing profiles do not get it
automatically, and removing it does not trigger another install. Your saved text
and choices to disable or remove Snippets are preserved.

## Windows ARM64 known issue

On Windows ARM64, installing Snippets from the catalog can fail on OMXTerm
0.25.0, and we don't know why yet. If you depend on Snippets there, stay on
[OMXTerm 0.23.0](https://github.com/luizomf/omxterm/releases/tag/v0.23.0), which
has Snippets built in.

## Install or update

1. Open **Settings → Extensions → Browse official extensions** and choose
   **Install** or **Update** on the Snippets card.
2. Review the package and trust prompt before approving. The add-on runs with
   your account's permissions; it is not sandboxed.
3. Return to a terminal tab, then choose **View → Toggle Snippets** to open the panel.

Technical details for contributors are in the
[developer record](snippets-migration.md).
