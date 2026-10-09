# Managed image Paragraph actions

Baseline: `master` at `ca50d5c66bc97ed5f2465582f7f24f1c3bc5bad9`.
Runtime **1.2.6** / editor **1.1.2** remain unchanged. This implementation is
uncommitted. **USER-REPORTED MANUAL ACCEPTANCE: PASS** in both H5P CLI and
WordPress, including WordPress persistence. These manual tests were performed
by the user, not by Codex.

## Supported structure

The selected image must be a resolved managed `imageInline` in an ordinary
paragraph directly inside the active model root. That paragraph contains either
exactly one image, or one image and text nodes. It may have native alignment or
indentation, but no other paragraph attributes. Lists/nested lists, table cells,
headings, soft breaks, multiple images, other inline objects and non-paragraph
containers are deferred. Read-only, detached, stale and unresolved targets fail
closed. Commands recheck eligibility at execution and inside the model transaction.

**Put image in separate paragraph** isolates a mixed occurrence:
`[L IMAGE R]` becomes `[L] [IMAGE] [R]`; absent sides produce no extra paragraph.
The existing image element remains selected and its editable receives focus.
An image already alone does not offer extraction.

**Insert paragraph before/after** adds exactly one empty native root paragraph
next to an image-only paragraph, even when an adjacent empty paragraph already
exists. The new paragraph inherits no attributes. Its empty caret receives focus.
Repeated actions intentionally add further paragraphs.

## Boundary whitespace

Only contiguous ordinary U+0020 spaces immediately before/after the image are
removed during extraction. Runs may cross ordinary bold/italic/link formatting.
Internal spaces, punctuation, remaining text and attributes are preserved.
Space-only sides disappear rather than becoming meaningless paragraphs.

Adjacent special whitespace (including NBSP, tabs, Unicode spaces, NEL, zero-width
space and word joiner), also after
ordinary separators, defers extraction. Separators with semantic/GHS/code or
unknown attributes defer too. Ordinary separator attributes are limited to bold,
italic, underline, strikethrough, sub/superscript, linkHref and native font
color/background/family/size. Annotations elsewhere remain untouched. No whole
paragraph trim occurs. The contract concerns the current model: HTML upcast may
already have normalized source whitespace.

## Image state and history

ID, ALT/definition identity, file reference, imageStyle, linkHref and
papijoImageWidth remain exact; `inlineImages[]` is untouched. Each action is one
model-change batch: one Undo restores the previous structure, text, formatting
and separators; one Redo restores the action. Navigation/focus adds no history.
Wrapping is preserved. A wrapped image in its own paragraph can still float
beside following text; extraction does not promise visual block isolation.
There are no runtime, schema, shared marker or storage changes.

## Native and external UI

One named **Paragraph actions / Actions de paragraphe** component uses public
ToolbarView configuration to create a native nested dropdown on both hosts.
ImageToolbar's configuration expects a component name. Mixed paragraphs offer
extraction; image-only paragraphs offer Before/After. Other contexts disable the
dropdown, and unavailable child actions are hidden. Its native vertical toolbar
is constrained to the local editor/viewport and wraps long translated labels.

Real Alt+F10 reaches the contextual image toolbar; native arrow navigation,
Enter/Space and menu navigation operate its commands. Escape is handled only
inside this dropdown and explicitly closes it and focuses the selected image's
editable. Closing/selection changes invalidate the captured menu target.

Two compact external arrow ButtonViews mirror Before/After. They live in their
editor's UI-body, outside editable/link/data content, with translated names and
tabindex -1. The equivalent dropdown commands provide their keyboard path;
they add no sequential Tab stops. The accepted Tab → southeast Resize handle
path stays unchanged. Arrows move outside resize handles and the contextual
balloon, hide during pointer resizing, ignore another pointer's completion, recover
after cancellation/blur, and hide when no collision-free viewport
position exists. Scroll/resize/render observation repositions them. Destruction
removes owned views, DOM listeners, observers, frames and explicit 43.0 focus
registrations; 43.3 uses native UI-body tracking.

## Regression and manual acceptance

Node tests cover eligibility, whitespace/annotation boundaries, translations and
manifest order. The native browser extension verifies exact model/history,
save/reopen, image state, deferred/stale/read-only contexts, EN/FR real keyboard,
external pointer actions, tiny/narrow layouts, repositioning, instance isolation
and destruction/recreation. Existing Resize/Wrap/ALT/Replace/Link/picker/tooltip
and nested host suites remain part of verification.

Final automated verification on 2026-10-09:

| Check | Result |
| --- | --- |
| New Paragraph Actions Node tests | 7/7 PASS |
| Complete Node suite | 73/73 PASS |
| Copy tests | 5/5 PASS |
| CLI export/reimport | 1/1 PASS |
| Filesystem-guarded copy/export | 6/6 PASS; no live-content access |
| CLI CKEditor 43.3.0 browser suite | 14/14 routes, 17/17 runs PASS |
| WordPress CKEditor 43.0.0 browser suite | 14/14 routes, 17/17 runs PASS |
| Final Paragraph-specific runs, each build | 4/4 PASS at 1280, 160, 320 and 480px |
| PHP filtering, each installed core | 6/6 groups PASS |
| PHP lifecycle, each installed core | 21/21 plus saved-child copy PASS |
| Live CLI rendering | 40/40 PASS |
| JavaScript syntax | 38 files plus 28 inline scripts PASS |
| PHP syntax | 2/2 PASS |
| JSON | 8/8 PASS |
| EN/FR synchronization | 50 matching keys PASS |
| Manifest/load order/canonical synchronization/fixture validation | PASS |
| git diff --check | PASS |

Historical implementation run: the focused Paragraph/Resize/editor-widget Node
run passed 23/23, while the complete Node suite passed 71/73. Its two failures
were the existing CLI export/reimport test and the inline/tooltip clipboard
file-existence test. The captured tooltip definition
refers to the missing local file
`C:\my_first_h5p_environment\content\text-01\images\90d25dbc176af53faa20f8c1997ae38e.jpg`.
Neither failing test nor its fixture had been changed at that point. Running
their unchanged HEAD sources in isolated temporary storage reproduced the same two failures
(4/6 pass). Installed content was not repaired, replaced or modified. The full
Node suite was therefore not all green in that original run. The missing external
fixture blocked its transfer/export checks; the legacy PHP file-lifecycle and
live CLI fixture suites were not claimed as passing on that run.

Subsequent fixture correction (2026-10-09): the historical results and missing JPEG above
describe the original implementation run. The separate test-infrastructure fix
now constructs temporary content from repository-owned SVG bytes; no historical
JPEG restoration or live-content repair is required. The complete Node suite is
now 73/73 PASS, with PHP lifecycle and live CLI rendering checks also passing.
See the [deterministic fixture update](INLINE-IMAGES-COPY-PASTE.md#deterministic-automated-image-fixtures-2026-10-09).

The browser suites include the existing managed-image, Resize, picker, tooltip,
integration and editor/runtime lifecycle regressions. New cleanup instrumentation
checks newly registered document/window listeners and all observed ResizeObserver
targets after repeated destroy/recreate, excluding Playwright's own hit-test
listeners. Real Alt+F10, arrows, Enter, Space, Escape, Ctrl+Z/Y and sequential Tab
are sent by the browser runner. Tiny external arrows avoid the native Link balloon
and resize handles, hide during actual pointer resize, recover after blur
cancellation without mutation, and reposition on actual
scrolling. Native translated menu panels fit all four tested viewport widths.

The new installed-clipboard test preserves extracted paragraphs, blank paragraphs,
formatting, image ID/ALT/definition/file reference, wrapping, URL and width through
repeated transfers of actual Accordion, Column and InteractiveBook chapter/Column
descriptor shapes. Existing browser integration/lifecycle coverage includes
Accordion item removal/replacement and independent nested editor instances. This
is automated harness coverage. Separately, user-reported manual acceptance
passed in both H5P CLI and WordPress, including WordPress persistence.

## Original Paragraph Actions change set

Before the separate fixture correction: **23 modified tracked + 4 untracked =
27 files**, with zero staged. The complete checkpoint now contains **31 modified
tracked + 5 untracked = 36 files**, still with zero staged.

Implementation (five modified, one new):

- `editor/advanced-text-papijo-inline-image-paragraph.js` — new structural commands and owned UI.
- `editor/advanced-text-papijo-inline-image.js` — installation/definition guard and contextual component name.
- `editor/advanced-text-papijo-tooltip.css` — scoped arrows and translated dropdown labels.
- `editor/library.json` — declared controller before the adapter.
- `editor/language/en.json` and `editor/language/fr.json` — four new strings each.

Tests/harnesses (sixteen modified, two new):

- `tests/inline-images-paragraph.test.js` — new Node eligibility, asset, translation and nested clipboard checks.
- `tests/inline-images-paragraph-browser.js` — new model/history, keyboard, geometry, coexistence and cleanup checks.
- `tests/inline-images-harness.html` — controller/extension loading and contextual toolbar expectation.
- `tests/inline-images-link-browser.js` and `tests/inline-images-phase3-browser.js` — updated contextual control counts.
- `tests/inline-images-resize.test.js` and `tests/phase1a-editor-widget.test.js` — updated manifest/order expectations.
- `tests/phase1a-harness-server.js` — serves the new controller and browser extension.
- `tests/integration-stability-harness.html`.
- `tests/phase1a-ckeditor-harness.html`, `tests/phase1b-ckeditor-harness.html`, `tests/phase1c-ckeditor-harness.html`.
- `tests/phase1f-editor-harness.html`.
- `tests/r0-characterization-harness.html`, `tests/r2-editor-lifecycle-harness.html`, `tests/r3-selection-classifier-harness.html`.
- `tests/selection-validation-harness.html`, `tests/table-sort-ckeditor-harness.html`.

The last ten HTML harness changes only load the declared controller alongside
the existing Resize/adapter assets.

Documentation (two modified, one new):

- `README.md`.
- `tests/README.md`.
- `tests/INLINE-IMAGES-PARAGRAPH.md` — this new report and manual checklist.

Runtime files, schema, shared canonical sources/copies and the Resize controller
are unchanged. HEAD remains `ca50d5c66bc97ed5f2465582f7f24f1c3bc5bad9`, master remains
ahead 5 / behind 0, and versions remain 1.2.6 / 1.1.2. No staging, commit, version
bump, library packaging, tag, push or publication occurred.

## User-reported manual acceptance

**USER-REPORTED MANUAL ACCEPTANCE: PASS**

- **H5P CLI: PASS.** User-performed acceptance covered mixed paragraph extraction;
  whitespace and formatting preservation; image-only Insert paragraph before/after;
  the Paragraph actions dropdown; external Before/After arrows; Resize coexistence;
  Link, Wrap, ALT and Replace; keyboard Alt+F10 toolbar access; the existing
  Tab → southeast Resize handle behavior; and deferred contexts.
- **WordPress: PASS**, including persistence.

These manual acceptance results were reported by the user; Codex did not perform
the manual tests.

The separately investigated table-cell observation required no correction.
Orange table/image outlines are native CKEditor widget hover styling. The
circular orange Before/After controls belong to CKEditor's native
WidgetTypeAround UI for the **table**, not to PapiJo Paragraph Actions.
PapiJo Paragraph Actions remain disabled in table cells.
