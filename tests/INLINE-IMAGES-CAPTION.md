# Managed inline image captions — Phase B

Baseline: `master` at `7d0c5f5e8fbfceacbed350e8b3010e7e8ee92548`.
This is an **uncommitted development checkpoint**. Runtime **1.2.6** and editor
**1.1.2** remain unchanged. **User-reported manual acceptance: PASS in H5P CLI
and WordPress.** Manual acceptance was performed by the user, not Codex.
Automated browser interactions below are separate verification.

## Model, canonical data and ownership

The existing atomic `imageInline` has optional plain-text `papijoImageCaption`.
Caption belongs to the occurrence, alongside `imageStyle`, `linkHref` and
`papijoImageWidth`. `inlineImages[]` remains exactly `{id,image,alt}`; caption
mutations neither revise definitions nor acquire files. Required ALT remains
definition/identity state and is not replaced by a caption.

```html
<span class="papijo-inline-image" data-papijo-inline-image-id="ID"><span class="papijo-image-caption">Rabbit: garden</span></span>
```

Existing style/link/width attributes retain their meanings. No caption data
attribute, second store, figure, figcaption, imageBlock or native ImageCaption
conversion is introduced. An uncaptioned occurrence still uses the original
empty marker and empty-element data converter, preserving its serialization.

Public `registerRawContentMatcher` and data `RawElement` conversion preserve
ordinary repeated spaces without CKEditor's text-writer NBSP substitution.
The raw callback uses `textContent`. Upcast only decodes entity-encoded plain
text from the expected direct child; it does not accept authored rich HTML.
Editing uses a noneditable UIElement caption within the native image widget.
Clicking it selects the single atomic managed image.

## Normalization and malformed-input policy

`validateCaption` / `normalizeCaption` in the shared managed contract are used
by UI, upcast, model repair and runtime. Runtime/editor copies are synchronized.

- Limit: 1,000 Unicode code points after normalization; invalid input is rejected,
  never truncated. The form reports length and invalid-character errors locally.
- Trim leading/trailing ASCII U+0020 only. Preserve repeated internal spaces.
- CRLF becomes one space; CR, LF, tab, NEL, line separator and paragraph separator
  become ordinary spaces. Authored hard breaks do not persist.
- Unicode-whitespace/format-only blank input removes the caption attribute.
- Reject remaining C0/C1 controls and unmatched UTF-16 surrogates.
- Preserve NBSP, narrow NBSP, combining characters, emoji, punctuation and
  protocol-looking strings. No NFC/NFKC normalization.

Canonical readers accept formatting whitespace around **exactly one direct
`span.papijo-image-caption`**, whose sole attribute is its exact class and whose
contents are text only. Duplicate children, nested children, markup, comments,
extra attributes/classes or other substantive marker children discard the
entire caption. The image's ID/style/link/width remain intact; discarded child
text does not become surrounding editor text. Blank, invalid or over-length
caption text is discarded. CKEditor raw input is bounded to 12,000 serialized
characters before entity decoding; the runtime also bounds child text to 12,000
characters before normalization. Escaped markup-looking text remains literal.
An orphan caption span cannot become a managed caption occurrence.
CKEditor's host HTML processor may remove comments outside the raw caption
child before upcast; those already-removed comments are not visible to the
local converter. Comments inside the raw caption child are rejected. The
runtime reader rejects comments anywhere in the controlled marker structure.

The canonical reader does not render decoded HTML. Editing, canonical output
and runtime caption construction use `textContent`, never `innerHTML`.

## Contextual form and eligibility

One Caption icon appears in the managed image toolbar. Its translated tooltip
is **Add caption** or **Edit caption**. The compact native CKEditor View/ButtonView
form has a labelled textarea, Apply, Cancel, and Remove caption when appropriate.
It owns local validation, focus, Escape and cyclic Tab navigation, and is removed
and destroyed with its editor. No global H5P/CKEditor UI is changed.

Add requires the existing Paragraph Actions assessment's `only` mode: a resolved
managed image alone in an eligible ordinary root paragraph. Mixed paragraphs,
tables, lists and headings cannot Add. An author must explicitly use Put image
in separate paragraph first; extraction is a separate operation and Undo step.

Existing captions can be edited/removed in root, mixed, table, list and heading
contexts when the target remains valid and editable. Paragraph Actions guards
are unchanged. The form captures the model occurrence, managed identity and
original caption. Moving selection cannot redirect Apply. Deleted/detached,
replaced, unresolved, read-only, noneditable or concurrently changed caption
targets fail closed. Form teardown and multiple editors retain independent state.

Add/Edit/Remove each create one model transaction and one Undo/Redo step.
Cancel, opening, focusing, closing and normalized no-op Apply create no model
change/history. Blank Apply has the same removal semantics as Remove caption.

## Image-only links and feature preservation

For captioned editing widgets the link anchor wraps only the descendant image;
caption is its unlinked sibling. Its editing-only anchor has tabindex -1 so it
does not interfere with the established Resize Tab path. The native Link UI,
commands, validation and shared-balloon coexistence remain in use.

Empty widgets retain the established native outer editing link wrapper; that
wrapper contains only the image widget. Adding a caption unwraps it and moves
the anchor inside. Removing the caption restores uncaptioned native link
ownership. Both forms have image-only link contents and no nested anchors.
Runtime always uses an inner image-only semantic anchor.

The linked-image editor navigation regression was reproduced in both installed
builds: the captioned anchor inherited `contenteditable=false` inside the widget,
and ordinary clicks with `defaultPrevented=false` attempted to navigate the
editor iframe itself. The previous outer anchor inherited an editable context
and did not navigate, even without cancellation. Native LinkEditing handles
modifier-click previews, not cancellation of ordinary clicks in this subtree.

A public editing-view click listener maps the clicked image widget back to its
managed model element and cancels its native default action. Modifier clicks
also stop the native explicit preview handler. Ordinary widget/LinkUI processing,
the actual editing href and persisted `linkHref` remain unchanged. Runtime is
outside this editing-view listener and still navigates normally.

`/managed-link-frame.html` embeds the real harness in a disposable editor iframe.
The runner records actual navigation requests as editor-frame, top-window or
new-window attempts and locally responds with HTTP 204 to preserve the test
document without contacting the destination. Both builds pass at all four widths
(1280/160/320/480px):
repeated image/caption selection, zero editor navigation, native Link/Caption/ALT/
Replace Cancel, real Tab/Arrow Resize/history, and positive runtime navigation.
`?link-only` runs this regression alongside the existing Link suite. The default
runner includes 15 routes/21 runs. The navigation bugfix initially reran the
affected routes; the final pre-commit audit reran the complete suite on both
builds. The earlier 14-route/17-run figures were historical/intermediate results
before the additional iframe route. User-reported manual acceptance of editor
and runtime link behavior is now PASS.

ALT revision, Replace and its history, Wrap, Link, Reset and Paragraph Actions
preserve the caption on the same occurrence. Paragraph external arrows use
the complete widget bounds; Resize handles continue using the descendant image.
The shared H5P picker and tooltip exclusion retain their accepted behavior.

## Display sizing and float footprint

The existing Resize projection owns editor sizing, including its active pointer
preview. A shared pure `captionSize` calculation is also used at runtime:

```text
B = existing containing-block content width
G = existing float gutter
N = loaded intrinsic image width
P = stored percentage or active preview
available = max(0, B - G)
default image/unit = min(N, available)
explicit image = min(N, available, B * P / 100)
explicit caption/unit = min(available, max(image, 8 * caption font size))
```

Default captions wrap exactly to the displayed image and never enlarge its
unit. Explicit 100% remains distinct from default. Explicit tiny widths reserve
an 8em caption footprint without enlarging the image or changing stored width.
Projection-only pixel custom properties are not persisted. Observers use the
original region/image; comparison before writing prevents recurring idle writes.
No second editor resize controller or competing percentage basis is added.

The outer unit floats and reserves the complete caption footprint. Inline images
are centered within wider footprints; Wrap left/right align the image to the
corresponding side. Existing flow-root containment remains. There are no blanket
clear rules. Caption text uses break-spaces/overflow-wrap:anywhere.

The selected editor caption has a **28px** gap; unselected editor/runtime captions
have **8px**. Four handles use the image rectangle and existing 32px minimum
hit-target grid/viewport clamps, not the caption bottom. Pointer, sequential
Tab, Arrow, Shift+Arrow, Escape, Reset and history keep their existing contract.

## Runtime, files and accessibility

Hydration creates paragraph-valid spans, optional image-only anchor, required
ALT image, and plain-text caption sibling. Each rendered caption receives its
own generated ID and the image's aria-describedby points to that caption.
Reusable managed IDs do not determine description IDs; separate roots/instances
remain independent. Without a caption there is no generated description.
Destroy disconnects observers/listeners and restores the controlled canonical
caption child for safe reinitialization. Attach destroys the preceding runtime.

Caption travels in the text HTML through clipboard, semantic save, nested copy,
PHP export/reimport and CLI parameter export/reimport. `inlineImages[].image`
still owns physical files. Fixtures remain repository-owned/self-contained;
no mutable manual content image bytes are used. The installed CLI's foreign-file
export limitation is unchanged and remains an explicit automated assertion.

## Final automated verification

- Focused Caption Node: 6/6 PASS; complete Node: 79/79 PASS.
- Actual CLI CKEditor 43.3.0: 15/15 routes, 21/21 runs PASS.
- Actual WordPress CKEditor 43.0.0: 15/15 routes, 21/21 runs PASS.
  Image and editor-iframe routes run at 1280/160/320/480px on each build.
- Link/navigation: PASS at all four widths, with zero editor navigation attempts
  and positive runtime navigation.
- Caption browser coverage: 15 complete literal round trips; malformed canonical
  input; occurrence independence; EN/FR real contextual actions; validation;
  Add/Edit/Remove/Cancel/no-op/history; root/mixed/table/list/heading eligibility;
  captured selection, replacement/deletion/read-only/destroy guards; Link/ALT/
  Replace/Wrap/Paragraph preservation; native keyboard/pointer Resize.
- Per image-route run: 852 editor and 852 runtime layout cases PASS, including all
  specified percentages, four source dimensions, four container widths and
  three presentations; 324 extreme-caption cases are included in that matrix.
- Supplemental checks: font-dependent 8em/clamping, 48 handle positions and
  six description IDs across two content roots; idle style-write checks PASS.
- Each PHP core: 7/7 filtering groups PASS, 25/25 save/retention/export/reimport
  cases plus saved-child copy PASS. Caption cases include all four
  parent/standalone forms.
- Live CLI: 80/80 disposable rendering cases PASS, including 40 captioned combinations.
- JavaScript syntax: 41 files + 28 inline scripts PASS; PHP syntax: 2/2 PASS;
  JSON: 8/8 PASS; synchronized EN/FR: 58 matching keys PASS;
  manifest assets/load order and shared copies PASS.
- `git diff --check`: PASS.

Commands use `node --test` on all `tests/*.test.js`, both documented PHP scripts,
`node tests/run-browser-harnesses.js --local`, and
`node tests/verify-inline-images-cli.js`. The browser runner supports a focused
`/inline-images.html?caption-only` route and a short
`/inline-images.html?caption-supplement` route. Set `PAPIJO_HARNESS_WIDTHS` only
for focused runs; the default complete suite retains all four image viewports.
WordPress uses the installed `PAPIJO_CKEDITOR_ROOT` / `PAPIJO_PHP_ROOT` paths.
Sandboxed temporary archive renames require an unsandboxed test run on Windows.
No browser test saves or uploads live user content.

## User-reported manual acceptance: PASS

- CLI manual acceptance: **PASS**.
- WordPress manual acceptance: **PASS**.

These were user-performed manual tests, not tests performed by Codex. The user
confirmed:

- Add Caption for eligible image-only ordinary root paragraphs; Edit and Remove Caption.
- Caption and image resize persist through save/reload; Inline, Wrap left and
  Wrap right work with captions.
- Linked managed images do not navigate in Edit mode and navigate normally in
  runtime; the caption remains outside the image link.
- Caption appearance is accepted: `box-sizing: border-box`,
  `background-color: #f2f2f2`, and `padding: 0.4em 0.7em`.

The accepted Add Caption restriction remains: eligible image-only ordinary root
paragraphs only. Caption creation in mixed text or tables is not required.

An apparent WordPress width/caption runtime symptom was investigated read-only.
Content ID 1 retained `data-papijo-inline-image-width="40.2"` and its direct
caption child; fresh WordPress runtime rendered both correctly. The symptom
stopped reproducing. No production persistence fix was made.

The original manual checklist below is retained as reference; the confirmed
user-reported results are recorded above:

- Add/Edit/Remove and blank/no-op/Cancel; localized labels, validation, keyboard
  focus and screen-reader reading of separate required ALT and caption.
- Save/reopen, nested Accordion/Column/InteractiveBook, H5P content copy and
  CMS export/reimport, using actual managed image selection/files.
- Default/small intrinsic sources, explicit 100% and 0.1%, Inline/Wrap left/right,
  narrow containers, repeated definitions and adjacent flowing text.
- Link/Ctrl+K/edit/unlink, caption never linked; ALT/Replace and their history.
- Four pointer handles, Tab/Arrow/Shift+Arrow/Escape/Reset, 28px selected clearance,
  external Paragraph arrows, mixed-paragraph extraction as a separate operation.
- Multiple instances, cancellation, deleted/replaced/read-only targets and reopen.

Deferred: rich captions, caption links, direct editing, typography controls,
imageBlock/native ImageCaption, multiple caption paragraphs/hard breaks,
automatic isolation, Add in deferred contexts, definition captions, orphan
cleanup, link target/new-window and CLI foreign-file export changes. Old editors
are not promised preservation of new caption markup; no migration is required
for existing empty markers.

## Exact Phase B file inventory

### Implementation (12)

- `advanced-text-papijo-inline-image-runtime.js` — modified
- `advanced-text-papijo-inline-images.js` — modified
- `editor/advanced-text-papijo-inline-image-resize.js` — modified
- `editor/advanced-text-papijo-inline-image.js` — modified
- `editor/advanced-text-papijo-inline-images.js` — modified
- `editor/advanced-text-papijo-tooltip.css` — modified
- `editor/language/en.json` — modified
- `editor/language/fr.json` — modified
- `editor/library.json` — modified
- `shared/advanced-text-papijo-inline-images.js` — modified
- `text.css` — modified
- `editor/advanced-text-papijo-inline-image-caption.js` — new

### Tests and harnesses (23)

- `tests/inline-images-cli-export.test.js` — modified
- `tests/inline-images-harness.html` — modified
- `tests/inline-images-link-browser.js` — modified
- `tests/inline-images-phase3-browser.js` — modified
- `tests/inline-images-php-copy.test.php` — modified
- `tests/inline-images-resize.test.js` — modified
- `tests/integration-stability-harness.html` — modified
- `tests/phase1a-ckeditor-harness.html` — modified
- `tests/phase1a-editor-widget.test.js` — modified
- `tests/phase1a-h5p-filter.test.php` — modified
- `tests/phase1a-harness-server.js` — modified
- `tests/phase1b-ckeditor-harness.html` — modified
- `tests/phase1c-ckeditor-harness.html` — modified
- `tests/phase1f-editor-harness.html` — modified
- `tests/r0-characterization-harness.html` — modified
- `tests/r2-editor-lifecycle-harness.html` — modified
- `tests/r3-selection-classifier-harness.html` — modified
- `tests/run-browser-harnesses.js` — modified
- `tests/selection-validation-harness.html` — modified
- `tests/table-sort-ckeditor-harness.html` — modified
- `tests/verify-inline-images-cli.js` — modified
- `tests/inline-images-caption-browser.js` — new
- `tests/inline-images-caption.test.js` — new

### Documentation (3)

- `README.md` — modified
- `tests/README.md` — modified
- `tests/INLINE-IMAGES-CAPTION.md` — new
