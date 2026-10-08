# Managed inline images: first Image Link scope

Development baseline: clean `master` at
`050c12227c51e9a080d3228f1c6fd51d0d7e3d82`, ahead of `origin/master` by three.
Runtime **1.2.6** and editor **1.1.2** are unchanged. This implementation remains
uncommitted. **User-reported manual acceptance: PASS** in both H5P CLI and
WordPress. Codex did not perform these manual acceptance tests.

## Native editor experience

Select a managed image, then use **Link image** / **Lien d’image** or **Ctrl+K**.
The thin `papijoLinkImage` alias creates the native `link` component with its
chain icon, translated image label and tooltip. Native Link UI provides the URL
field, Save, Cancel/Escape, and linked-image Edit/Unlink actions. There is no new
modal, LinkImage plugin, upload adapter or file owner.

Contextual toolbar configuration is exactly:

```js
[
  'imageStyle:inline',
  'imageStyle:alignLeft',
  'imageStyle:alignRight',
  '|',
  'insertImage',
  'papijoLinkImage',
  'imageTextAlternative'
]
```

The same native image-toolbar view remains visible above the native Link
actions/form while a valid managed image is selected. All six image controls
remain reachable; no second toolbar or replacement Link UI is created.

These are six buttons plus a separator. The existing selection-aware H5P
Insert/Replace provider and main toolbar grouping remain unchanged. Link commands
are disabled for a selected image with a missing definition or a read-only editor.
A form captures its occurrence and ID; moving selection, deleting/changing that
occurrence, or making the editor read-only cannot redirect Save. Stale forms close
through native Escape before native fake-selection positioning can access a
deleted widget. A reentrancy guard prevents duplicate native closure.

## Model and canonical data

The editing model is native `imageInline` with `inlineImageId`, optional
`imageStyle`, and optional **`linkHref`**. Preview `src` and ALT remain managed
projections. Definitions remain exactly `{ id, image, alt }`; no URL is added to
`inlineImages[]` or to file metadata.

Canonical persistence adds only an optional occurrence attribute:

```html
<span class="papijo-inline-image"
      data-papijo-inline-image-id="A"
      data-papijo-inline-image-style="alignLeft"
      data-papijo-inline-image-link="https://example.com/details?q=1&amp;b=2#photo"></span>
```

Default Inline omits the style attribute; unlinked images omit the link attribute.
Existing markers reopen unchanged. Data downcast owns the marker URL and consumes
native image-anchor/decorator serialization. It emits no `img`, `figure`, raw
`src`, dimensions, native style class, target, rel or download state. Ordinary
text links retain native anchor serialization.

## One URL policy at every boundary

`shared/advanced-text-papijo-inline-images.js` exports `normalizeLink` and the
attribute name; the independently loaded runtime/editor copies are synchronized.
Validation applies to raw native form input before host default-protocol repair,
direct Link execution, imported data, post-fixed model writes, both downcasts and
runtime DOM construction.

Only explicit absolute **HTTP/HTTPS** URLs are accepted. Parse with `new URL`
without a base, require non-empty authority/hostname, and require the resulting
protocol to remain HTTP/HTTPS. Canonical `URL.href` normalizes casing, Unicode and
escaping; valid query strings, fragments, ports and percent escapes survive.
Outer ordinary whitespace is trimmed. Reject raw controls before trimming,
embedded whitespace, backslashes, markup/quotes/backticks, the HTML parser's
replacement character, malformed percent escapes, empty/malformed authority,
empty port and credentials, including an empty `@` authority prefix.

Reject javascript/data/blob/file/ftp/ftps/mailto/tel, malformed or encoded schemes,
protocol-relative, relative and fragment-only values. Invalid form input remains
in the native form with a translated error and no content/history change. Invalid
direct commands do nothing; invalid model/stored values become unlinked. Never
substitute `href="#"`.

Actual CLI and WordPress PHP filtering preserves supported occurrence URLs but
can strip a forbidden scheme prefix from data attributes (for example
`javascript:x` becomes `x`). PHP filtering is not the image-link policy: the
shared editor/runtime rule still rejects the resulting unsupported value.

## Host decorators and surrounding anchors

CLI's native text-link manual new-tab decorator remains enabled/default on;
WordPress's automatic external-link target remains configured. Image-only form
adaptation hides manual decorator controls; image command execution discards
manual settings; post-fixing removes image decorator/GHS anchor attributes.
Image editing downcast creates a validated href-only native attribute anchor
before automatic decorators run. The native form is reused for ordinary text
without the image class, sizing or hidden controls. Tests exercise that reuse.

Import/runtime use the same deterministic rule: a **valid explicit marker URL
wins**; otherwise a valid nearest surrounding anchor URL is adopted. Invalid
nearest wrappers do not confer a link. Arbitrary wrapper target/rel/download or
custom attributes are never adopted. Runtime validates DOM-decoded values, so
entity-obfuscated schemes cannot bypass this rule.

Managed occurrences are detached from surrounding anchors within their own
AdvancedText root. Splitting keeps adjacent ordinary linked text and formatting
in its original anchors, then creates only the controlled image link. No nested
anchors result. Reinitialization cannot duplicate anchors or images. An anchor
outside the owned AdvancedText root is outside this integration's scope.

## Runtime, accessibility and combined image operations

Runtime uses DOM APIs to construct:

```html
<span class="papijo-inline-image ...">
  <a class="papijo-inline-image-link" href="https://example.com/details">
    <img class="papijo-managed-inline-image" src="H5P-resolved-image" alt="...">
  </a>
</span>
```

The newly created anchor receives only validated href and controlled class.
The image still resolves through `H5P.getPath()`. Missing/invalid links produce
the existing unlinked image. Native focus and Enter activation work; image ALT
provides the accessible name. No role, tabindex, aria-label or click script is
added. Scoped CSS gives the anchor an image-sized focus box and keeps the image
responsive. Existing marker floats and flow-root containment remain intact.

Link changes preserve managed ID, ALT and presentation. ALT revision creates the
existing retained definition while leaving the link/style on the occurrence.
Styles preserve linkHref. Replace creates retained B and switches only the
captured occurrence A → B while preserving its URL and presentation; A remains
retained. Native Undo/Redo covers add, edit, unlink, style, ALT and replacement
without a separate history system. Simultaneous A+X, A+Y and A+unlinked occurrences
remain independent, including replacement and same-editor fragment copy.

H5P clipboard copying preserves occurrence URLs and the existing managed
definition/file transfer. Actual PHP semantic processing localizes files and
retains old/new definitions. Isolated content export/reimport preserves linked
HTML, parameters and exact file hashes for standalone, Accordion, Column and
InteractiveBook. No file-path validator, semantics or manifest changes are made.

## Narrow UI and verification

The existing managed-image toolbar uses native wrapping and public balloon
positions. The same positioning hook now also recognizes the managed-image
native Link form/actions. Public `BalloonPanelView.class` provides a transient
scope class, preserving other classes; scoped CSS constrains field/actions to
viewport width with a 340px maximum. Ordinary Link UI and global balloon behavior
are untouched. Main toolbar overflow remains automatic.

### Manual-acceptance bug fixes

**Toolbar displacement:** Real linked-image clicks reproduced this in both
installed builds. `ImageToolbar` registers the native toolbar with
`WidgetToolbarRepository`. Native `LinkUI` responds to the editing-document click
by adding its actions to `ContextualBalloon`'s same `main` stack. The native
rotator displays only the top view, leaving the toolbar registered but hidden.
The same displacement reproduced after disabling our scoped Link-form adaptation
in memory. This was native stack behavior inherited by the adapter, not removal
by our positioning hook. Earlier tests selected the model programmatically and
could create a detached chain button, so they missed the real click transition.

The scoped fix remembers the repository's existing toolbar when displayed and
adds that same view alongside managed-image Link actions/form in the native
rotator's public `content` ViewCollection, reached through public
`BalloonPanelView.content`. Native stack transitions clear that collection;
the integration reuses/removes the companion as selection/view changes and
cleans it on editor destruction. `ContextualBalloon.visibleView` remains the
native Link view, preserving its focus, actions, keyboard and submission logic.
There are no private-method overrides, extra toolbars, globally changed stacks
or new balloon APIs. Ordinary text Link UI receives no companion toolbar.

**Add Tooltip on images:** The shared selection classifier already had this
omission at baseline HEAD, before Image Link. A selected inline object creates a
non-collapsed, single-block range; the classifier accepted such a range without
requiring text. `refreshTooltipActions` used that result to show Add Tooltip,
and the tooltip creation command used the same result. The classifier now
requires meaningful `$textProxy` content and rejects any selected schema object,
including mixed text/object selections. Existing block/table/tooltip overlap
checks remain. Collapsed creation stays invalid; collapsed existing-tooltip
detection and Edit remain supported. Button visibility and command validation
therefore share the corrected semantic predicate.

Regression checks now use actual Playwright mouse clicks, without force-click,
with a representative image fixture rather than the 1px serialization stub.
They assert the same toolbar identity, actual visibility and pointer hit-testing
for all six buttons through linked/unlinked click, form/actions, Save, Cancel,
Escape, Unlink, another image, and ordinary text. They also exercise text/image
selection transitions, caret/object/mixed rejection, and real Add/Edit Tooltip
workflows in both languages at all three widths. The detached-button fallback
was removed from the image-link test helper.

Automated results on the current working tree:

| Suite | Result |
| --- | --- |
| Node, including six new focused link tests | 61/61 PASS |
| CLI CKEditor 43.3.0 + actual CLI HTML-widget config | 14/14 routes + 2 extra image-width runs PASS |
| WordPress CKEditor 43.0.0 + actual WordPress HTML-widget config | 14/14 routes + 2 extra image-width runs PASS |
| Image link languages/viewports, each build | English/French × 1280/480/160px PASS |
| Manual-bug regressions, each build | Real mouse/focus coexistence and text-only tooltip checks at all six language/width combinations PASS |
| Read-only live CLI runtime cases | 20/20 PASS |
| Actual CLI PHP core/editor filtering | All five groups PASS |
| Actual WordPress PHP core/editor filtering | All five groups PASS |
| Each PHP core/editor save/export/reimport | 9 original + 4 replacement + 4 link exports, plus saved-child copy PASS |
| JavaScript / PHP / JSON syntax | 32 JS / 2 PHP / 7 JSON files PASS |
| Synchronized inline-image and sanitizer copies; `git diff --check` | PASS |

Browser coverage includes native form/actions, chain labels, Ctrl+K, focus/Escape,
one-step history, occurrence isolation, all presentations, ALT/Replace, strict
form/command/model/import/runtime validation, surrounding anchors, decorators,
ordinary text links and narrow geometry. All existing regression routes remain
in the runner.

The harness now selects `h5peditor-html.js` from the same installed editor root
as CKEditor, rather than always using CLI configuration. `/harness-host.json`
reports actual path and SHA-256. Tests assert the served host source and resulting
decorator configuration agree. Historical harness assertions now compare anchor
attributes independently of order and ignore only WordPress's exact generated
trailing empty table guard during editor round-trip comparison.

Live CLI cases use read-only requests/disposable DOM for standalone, Accordion
and Column. InteractiveBook is covered by actual clipboard and nested PHP
save/export/reimport, not a live CLI book session. WordPress browser/PHP tests use
its actual installed code in isolation; no WordPress upload/content-save/manual
acceptance is claimed. The established CLI exporter limitation for foreign
relative file references remains characterized; PHP saves localize those files
before successful self-contained exports. Temporary lifecycle exports are removed
by tests and are not development-library installation packages.

## Manual acceptance checklist

**User-reported manual acceptance:**

- CLI manual acceptance: **PASS**.
- WordPress manual acceptance: **PASS**.

The accepted manual testing covers:

- basic Image Link, link editing and unlinking, and Ctrl+K;
- Undo/Redo;
- Inline, Wrap left, and Wrap right;
- ALT preservation;
- Replace preservation and Replace Undo/Redo;
- save/reopen and nested integrations;
- the linked-image toolbar coexistence bug fix;
- the Add Tooltip exclusion for image selections bug fix.

These results were reported by the user; Codex did not perform the manual tests.
The checklist below remains a reference for future regression testing.

| Check | Expected |
| --- | --- |
| Select image → chain button; Ctrl+K | Native Link form, focused URL input; English/French label correct |
| Click unlinked and linked images | Same six-control image toolbar stays visible, including beside Link actions/form |
| Add HTTPS, then HTTP; include query and fragment | URL accepted; runtime image is a native clickable link |
| Edit URL; Unlink | Native actions work; image, ALT and style preserved |
| Cancel and Escape | No content/history change; focus returns to editor |
| Add/edit/unlink → Ctrl+Z/Ctrl+Y | Previous/next occurrence URL restored in one step |
| Invalid/deferred URL | Translated error; no link/content/history change |
| ALT; Inline/Wrap left/Wrap right | Link survives; styling and ALT Undo/Redo work |
| Replace linked image; Undo/Redo | Old/new managed image restored with identical URL/style |
| Shared A with X, Y and no link | Link/replace changes affect only selected occurrence |
| Save/reopen | Exact occurrence links and managed files retained |
| Accordion/Column/InteractiveBook; copy/paste | Linked child renders, saves and reopens correctly |
| Export/reimport | Links and managed image files survive |
| Narrow editor; French UI | Chain, URL input, Save, Cancel, Edit and Unlink usable |
| Ordinary text links before/after image linking | Existing host decorators and text-link behavior intact |
| Image → text → image; collapsed caret; other object | Add Tooltip appears only for valid non-empty text selections |
| Add Tooltip on text, then Edit existing tooltip | Existing text tooltip workflows remain functional |
| Keyboard runtime focus + Enter | Image ALT names the link; native activation works |

## Deferred

Mailto/tel, relative/fragment-only/protocol-relative links, target/new-window
settings, decorators, downloads, captions, resizing, block/centered image styles
and orphan cleanup remain deferred. No versions are bumped and nothing is staged,
committed, tagged, packaged for installation, pushed or published.

## Files changed

Implementation (10): `shared/advanced-text-papijo-inline-images.js`,
`advanced-text-papijo-inline-images.js`, `editor/advanced-text-papijo-inline-images.js`,
`editor/advanced-text-papijo-inline-image.js`, `advanced-text-papijo-inline-image-runtime.js`,
`text.css`, `editor/advanced-text-papijo-tooltip.css`, `editor/language/en.json`,
`editor/language/fr.json`, `editor/advanced-text-papijo-tooltip-selection.js`.

Tests/harnesses (13): `tests/inline-images-link.test.js` (new),
`tests/inline-images-link-browser.js` (new), `tests/inline-images.test.js`,
`tests/inline-images-harness.html`, `tests/inline-images-phase3-browser.js`,
`tests/inline-images-php-copy.test.php`, `tests/phase1a-h5p-filter.test.php`,
`tests/phase1a-harness-server.js`, `tests/phase1a-ckeditor-harness.html`,
`tests/phase1b-ckeditor-harness.html`, `tests/phase1f-editor-harness.html`,
`tests/verify-inline-images-cli.js`, `tests/run-browser-harnesses.js`.

Documentation (3): `README.md`, `tests/README.md`, this new report.

Beyond the original 24-file Image Link working tree, these bug fixes add changes
only to `editor/advanced-text-papijo-tooltip-selection.js` and
`tests/run-browser-harnesses.js`. The total is 26 files: 23 modified tracked,
3 untracked, zero staged. Versions and baseline HEAD remain unchanged.
