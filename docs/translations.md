# Contributing translations

You can help with a single wording correction, even if you do not write code.
For a small correction to an existing language, you only need a GitHub account
and a browser; you do not need to install OMXTerm or its development tools.
Maintainers can help with the technical checks.

Start small: improve one existing Brazilian Portuguese message. To propose a new
language, [coordinate with maintainers first](#proposing-a-new-language).

## Where the words live

The translations are TypeScript (`.ts`) files in this repository, not JSON or
YAML files and not a separate translation service:

- [English source catalog](../src/shared/locales/en-US.ts): defines the message
  keys and original meaning.
- [Brazilian Portuguese catalog](../src/shared/locales/pt-BR.ts): supplies the
  corresponding translations.

The exact language tags are `en-US` and `pt-BR`. `en`, `pt`, `pt_BR` and `PT-BR`
are not accepted alternatives. For choosing a language in the app, see
[configuration](configuration.md#settings).
Editing a catalog proposes a source change; it does not change your installed app.

## Your first correction, entirely in the browser

A **fork** is your own copy of the repository on GitHub. A **branch** keeps your
proposed edit separate. A **pull request** (PR) asks OMXTerm's maintainers to
review and integrate that edit.

1. Search the project's [issues](https://github.com/luizomf/omxterm/issues) and
   [pull requests](https://github.com/luizomf/omxterm/pulls) for the same correction.
   Small wording fixes can go straight to a PR; explain an uncertain translation
   in an issue if you would like help first.
2. Sign in to GitHub. Open [luizomf/omxterm](https://github.com/luizomf/omxterm),
   choose **Fork**, and create a fork under your account. If you already have a
   fork, use **Sync fork** to bring its `main` branch up to date before starting.
3. In your fork, select `main` in the branch selector. Create a new branch there,
   for example `fix/pt-br-wording`, and select it.
4. Navigate through `src` → `shared` → `locales` → `pt-BR.ts`. Use the file's
   edit button (pencil, sometimes inside the file menu). Make sure you are
   editing your fork and your new branch, not the original repository.
5. Find the message you want to improve. For example, the current entry is:

   ```ts
   "menu.selectAll": "Selecionar Tudo",
   ```

   To suggest sentence-style capitalization, change only its value:

   ```ts
   "menu.selectAll": "Selecionar tudo",
   ```

   This is an example of a small proposal, not a required correction. Use the
   wording you actually want to improve and explain why. The matching English
   entry is `"menu.selectAll": "Select All",`.

6. Review the editor's diff/preview of changes. Only the intended translated
   words should change. Keep the key, double quotes, colon and final comma.
   Check accents and capitalization, and compare the meaning with the English
   catalog. Do not replace the whole file with this example.
7. Choose **Commit changes**, use a short English description such as
   `fix: improve Portuguese select-all wording`, and commit to your new branch.
   A commit saves the proposed change in your fork; it does not publish an
   OMXTerm release.
8. Open **Contribute → Open pull request** in your fork, or use **New pull
   request** on the original repository and **compare across forks**. Check
   that the base is `luizomf/omxterm`, branch `main`, and the head is your fork's
   `fix/pt-br-wording` branch. In **Files changed**, expect only `pt-BR.ts` for
   this one-message edit. If unrelated changes appear, ask for help before
   submitting.
9. In the PR's English description, explain the wording change and where it
   appears (here, **Edit → Select All**). Fill in the verification section
   honestly; the [example below](#checks-and-review) is fine for browser-only
   work. Submit the PR and respond to review comments. If asked to revise it,
   edit and commit on the same branch; the PR updates automatically.

GitHub's labels and button placement can vary. If you cannot find a control,
share the step where you stopped in an issue or PR comment. Do not share account
credentials or private terminal content.

## Reading and editing a message safely

In `"menu.selectAll": "Selecionar Tudo",`, the left-hand text
`menu.selectAll` is the **key**: the application uses it to find the message.
The right-hand text `Selecionar Tudo` is the **value**: the translated words.
Change values, not keys. English values explain the intended meaning; you do not
need to change the English source for a Portuguese correction.

### Punctuation, quotes and escaping

Keep the surrounding double quotes, the colon between key and value, and the
comma after the entry. Inside the value, use appropriate punctuation for the
language while preserving meaning and important hints. For example, these are
real Portuguese entries:

```ts
"menu.settings": "Configurações…",
"preview.closeHint": "Fechar · Esc",
```

Keep the ellipsis when the action opens another step, and keep the literal
`Esc` key hint. Accented letters and the ellipsis can be typed directly.

The enclosing double quotes are TypeScript syntax. A double quote _inside_ the
value must be written as `\"`; a literal backslash must be written as `\\`.
Do not add a bare double quote or insert a line break inside a quoted value.
If you are unsure about escaping, propose the wording in the PR description
and ask a maintainer to encode it safely.

An apostrophe does not need escaping inside double quotes. This real English
entry illustrates that distinction:

```ts
"snippetPreview.unavailable":
  "This snippet's terminal closed. Nothing will be sent.",
```

### Placeholders: keep the text inside braces

Placeholders are names in braces that the app replaces with literal text.
These are corresponding catalog entries:

```ts
// en-US.ts
"menu.quit": "Quit {name}",
"menu.tab": "Tab {position}",
"about.version": "Version {version}",

// pt-BR.ts
"menu.quit": "Sair do {name}",
"menu.tab": "Aba {position}",
"about.version": "Versão {version}",
```

Translate the surrounding words, but keep `{name}`, `{position}` and `{version}`
exactly, including spelling, case and braces. For example, `{position}` supplied
as `3` makes `Aba 3`. Do not translate it to `{posição}`, remove it, add spaces
inside the braces, or replace it with an example number. You may move a
placeholder within the sentence when the language needs a different word order.

### Plurals: keep every branch

Some messages have an object instead of one quoted value. Here is the actual
Portuguese `notice.restartDeferred` entry:

```ts
"notice.restartDeferred": {
  one: "As superfícies de terminal abertas continuam usando o valor anterior de {settings}. Reinicie o OMXTerm para aplicá-lo em todas; novas abas e janelas usam os valores validados mais recentes.",
  other:
    "As superfícies de terminal abertas continuam usando os valores anteriores de {settings}. Reinicie o OMXTerm para aplicá-los em todas; novas abas e janelas usam os valores validados mais recentes.",
},
```

Translate the words in both values, leaving `one`, `other`, their braces and
commas intact. Keep `{settings}` in **each** branch. The translator uses a
numeric `count` parameter with `Intl.PluralRules` for the selected language;
without a numeric count it uses `other`. This entry describes deferred settings,
not a rule that changing the interface language requires a restart.

The current catalog tests require the same plural branch names as English and
matching placeholders in each branch. For a new language needing different
plural categories, discuss the required code and test changes with maintainers;
do not silently add or drop branches.

### What not to change in a wording-only PR

- Do not rename, add, remove or translate message keys, imports, exports, type
  declarations, or plural branch names. Leave the file's attribution comments.
- Do not translate placeholders, product names, configuration keys, filenames
  such as `config.json` and `snippets.yaml`, commands, paths or shortcut names.
- Keep `settings.english` as `English (United States)` and
  `settings.portuguese` as `Português (Brasil)` in every catalog. These are
  **autonyms**: each language's name in that language, so people can recognize it
  even when the rest of the interface is unfamiliar.
- Do not edit terminal output or users' snippet names, descriptions and bodies
  to translate the interface. Those are user/program content, not catalog text.
- Avoid unrelated reformatting, dependency changes and version bumps.

## Checks and review

Before submitting, read your changed sentence aloud, compare it with the source
meaning, and review **Files changed** for unintended edits. For `.ts` catalogs,
GitHub's file/diff view is not an application preview or a syntax/test check.
For Markdown changes, use GitHub's rendered preview and check modified links.
You do not need a local development environment for the small correction above.

A browser-only PR can accurately say:

> Reviewed the changed value against the English catalog and checked Files
> changed for unrelated edits. Browser-only contribution; local CLI checks
> (formatting, lint, typecheck and tests) were not run. The app was not run;
> please help with technical and UI checks.

If you do use a local setup, follow [Contributing](../CONTRIBUTING.md#verification)
and report the exact checks you ran and anything you did not run. A catalog
`.ts` edit is not a documentation-only change.

Maintainers handle the technical review with you:

- [Catalog tests](../test/unit/i18n.test.ts) check matching keys, nonempty values,
  placeholder names, string-versus-plural shape, plural branch names and
  per-branch placeholders. They also test interpolation, plural selection,
  missing-message English fallback and exact supported tags. Fallback is not a
  reason to leave a translation incomplete.
- Formatting, lint, type checking and the applicable code verification follow
  the contribution policy. Passing automated checks does not establish that the
  translation reads naturally or fits the UI.
- Maintainers review the affected visible text and accessible labels in context,
  including length and layout. You can describe the intended location without
  running the app; do not claim an app preview you did not perform. Any
  screenshots should contain only synthetic, nonprivate content.

## Proposing a new language

Open or join an [issue](https://github.com/luizomf/omxterm/issues) before
translating a whole catalog. Name the language and regional variant, propose its
exact tag and its autonym, and explain whether you can translate and help review
all messages. Coordinate with existing volunteers to avoid duplicate work.
Maintainers can help create the catalog and complete application-code changes;
you do not need to do those technical steps alone.

A new `.ts` file by itself does **not** register a language. Maintainers need to:

1. Add a complete catalog based on `en-US.ts`, preserving every key and the
   placeholder/plural contract. Agree on any plural-model changes first.
2. Import and register it in [`src/shared/i18n.ts`](../src/shared/i18n.ts), adding
   the exact tag to `SUPPORTED_LANGUAGES` and its catalog to `MESSAGE_CATALOGS`.
   [`validateLanguage`](../src/main/user-configuration-language.ts) uses that
   supported list for configuration validation; the default remains `en-US`.
3. Add the tag and language-name message to the language options in
   [`settings-pages.ts`](../src/renderer/settings/settings-pages.ts), with the
   new autonym in every catalog. Keep the existing autonyms unchanged.
4. Update accepted-tag documentation and affected tests, including tag rejection
   cases, autonym expectations and any additional language-specific validation.
   Run technical checks and review the translated UI, menus, dialogs and
   accessible labels in context; catalog parity alone is not full UI coverage.

Only registered exact tags are accepted. Do not promise system-language
selection, a restart requirement or translation of every piece of text. The
[language contract and its limits](adr/0035-select-the-interface-language-explicitly.md)
cover app-owned text; terminal/program output and diagnostic detail have separate
responsibilities.

## Credit and maintainer help

Translation contributions count, including a one-line fix. Maintainers add
missing contributors to [CONTRIBUTORS.md](../CONTRIBUTORS.md) when integrating
contributions. You can provide a public name or use only your GitHub handle;
optional personal details are not required.

The catalogs and translator build on Rafael Ruscher's (@ruscher) contribution
from PR #622. Keep the existing source attribution and license notices; see
[Third-Party Notices](../THIRD_PARTY_NOTICES.md). Ask in an issue or PR whenever
wording, escaping, plurals, registration or technical checks are unclear.
Maintainers handle release qualification and publication; translators do not
need to build installers or publish a release.
