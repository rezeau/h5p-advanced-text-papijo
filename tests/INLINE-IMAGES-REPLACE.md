# Managed inline images: replacement

Development baseline: clean `master` at
`9a6363d6abf1abfc3e5bee5875064087da070207`, ahead of `origin/master` by two.
Versions remain runtime **1.2.6** / editor **1.1.2**. Earlier phase reports
describe their historical snapshots. Manual acceptance is complete:

- H5P CLI manual acceptance: **PASS**.
- WordPress manual acceptance: **PASS**.

Both manual runs verified existing Insert image, selected managed image →
Replace image, real H5P replacement upload/selection, explicit required
replacement ALT, Inline / Wrap left / Wrap right, Ctrl+Z Undo restoring the
previous image, Ctrl+Y Redo restoring the replacement, and Save/reopen.
The temporary WordPress package was used only for testing and is excluded from
the checkpoint commit.

## Editor UI and provider

The existing single `papijoH5p` integration in native `ImageInsertUI` now supports
both modes. A collapsed valid text cursor enables **Insert image**. Selecting a
valid managed `imageInline` enables **Replace image**. Both main and contextual
buttons bind their labels to native `ImageInsertUI.isImageSelected`, using the
installed English/French CKEditor translations, the existing CKEditor image SVG,
icon-only `ButtonView`, native tooltip, accessible naming and keyboard behavior.
Missing definitions and read-only editors disable the provider.

The main icon remains fourth, immediately after Underline; normal automatic
grouping/overflow remains enabled. Contextual configuration is exactly:

```js
[
  'imageStyle:inline',
  'imageStyle:alignLeft',
  'imageStyle:alignRight',
  '|',
  'insertImage',
  'imageTextAlternative'
]
```

The sole integration produces a native button, without an artificial dropdown.
The button opens the existing local H5P image/ALT form and creates a normal
`H5PEditor.widgets.image` draft. No picker, transport, copyright UI, or upload
adapter is duplicated. The replacement picker label, Apply button and stale
target message have English/French library strings. Existing insertion remains
unchanged, including mandatory ALT and caret placement after insertion.

## Managed replacement, ALT and history

Opening the picker captures the editor instance, exact model element and its
current managed ID A. The occurrence remains untouched while the picker is
open. The image widget starts without an image value, and replacement ALT starts
empty. Old ALT, title, copyright and thumbnail labels are never copied into it.
Blank/whitespace ALT or an invalid managed draft cannot create a definition.
Changing an existing draft to another image clears its entered ALT.

Apply first revalidates the captured target, creates a new definition B using
the existing store's validation and full metadata clone, then executes one
`model.change` setting only the occurrence's `inlineImageId` and selecting the
same object. The existing post-fixer projects B's preview src/ALT in that batch.
`imageStyle` is never written by replacement, so the current inline/left/right
presentation survives, including changes made while the picker was open.

Definitions A and B remain retained outside model history. A is not mutated.
Another occurrence referencing A retains its original image, ALT and own style.
One Undo restores A and its projected ALT; Redo restores B. Repeated cycles,
subsequent Delete/Undo, ALT edit, style changes and further replacement remain
independent history operations. Apply returns native editing focus with the
replaced object selected.

Before adding B, the target must still be an `imageInline` under an attached,
non-graveyard root of the captured editor's model document. The widget must
still use that editor, the expected ID must match a valid managed definition,
and the editor must be writable. Deleted, changed-ID or changed-editor targets
and read-only editors yield a localized error without store/content mutation.
Changing the current selection cannot redirect replacement to that selection.

Cancel closes/removes the draft widget and makes no definition/data/history
operation. It restores the captured selection/focus only if the replacement
target remains valid. Closed/older-generation callbacks are ignored, including
callbacks arriving after another picker was opened. Uploaded temporary files
remain under normal H5P cleanup; there is no manual server-file rollback.

## Persistence, files and runtime

The schema is unchanged: B is `{ id, image, alt }` in `inlineImages[]`.
Occurrence data remains an empty managed span containing B's ID and, only for
wrapping, `data-papijo-inline-image-style="alignLeft"` / `"alignRight"`.
No src, ALT, dimensions, imageBlock, native classes or arbitrary CSS are saved
in occurrence HTML. The managed-path validator and its security grammar are
unchanged. Runtime rendering and `H5P.getPath()` need no changes.

Retaining A keeps its semantic image field/file discoverable by H5P even when
no current marker references it. Actual PHP `processParameters` old/new file
comparison retains A, discovers/localizes B, and exports/reimports both files.
The content clipboard copies both definitions independently of active marker
references and preserves occurrence style/IDs. No physical A deletion or
orphan cleanup is attempted; retained definitions can increase content size.

Native `insertImage` / alias `imageInsert` and `replaceImageSource` stay disabled.
No `ImageUpload`, `ImageUploadEditing`, `FileRepository` or native image
clipboard/drop pipeline is enabled. There are no manifest, core, semantics,
runtime or validator changes.

## Narrow contextual toolbar

The added icon fits normal widths. At an actual 160px viewport, CKEditor's
default balloon positioning clipped the controls. The adaptation is limited to
the visible contextual toolbar containing this provider's button. It sets
native `ToolbarView.maxWidth` to `calc(100vw - 16px)` and, only when the current
toolbar bounds exceed the viewport margin, uses native
`BalloonPanelView.generatePositions({ sideOffset: 8 })` through
`ContextualBalloon.updatePosition`. Native static layout supplies two rows.
Low-priority editor UI update and visible-view listeners handle subsequent
selection/resize updates. No global balloon change, main grouping change,
custom toolbar, pinned control or CKEditor private repository access is used.

## Automated coverage and verification

`inline-images-replace-browser.js` extends the real-build image harness. It
covers all three styles, immutable A/new B metadata, shared-reference isolation,
required explicit ALT, unsafe drafts, generation guards, cancel before/after
draft without Undo entries, deleted/changed-ID/read-only/editor-changed targets,
selection movement and current-style preservation, one-step Undo/Redo repeated
four times, Delete/Undo, ALT/style/replacement sequencing, exact serialization,
real preview bytes and save/reopen. It also verifies English/French native and
library UI, focus return and native keyboard activation. The Playwright runner
sends real Enter keystrokes; direct browser use falls back to clicking.

All 14 existing harness routes remain. The image harness additionally runs at
actual viewport widths 160 and 480 (normal 1280), in both installed builds:
CLI CKEditor **43.3.0** and WordPress CKEditor **43.0.0**. English/French checks
repeat editor widths 800, 240, 140 and 240, including viewport bounds, native
two-row layout, repeated selection/resize and provider uniqueness. Existing
main-toolbar visibility/overflow checks and Phase 1/2/3 checks are retained.

Node tests exercise actual H5P content clipboard copies of A/B through nested
and repeated destinations. PHP retains its nine previous save/export/reimport
cases and saved-child copy, and adds four replacement old/new semantic save,
foreign-path localization, inactive-file retention and byte-identical
export/reimport cases (standalone, Accordion, Column, InteractiveBook). A file
storage guard throws if semantic processing attempts deletion. Five established
live CLI cases remain, plus five replacement-result cases with real images and
float/Accordion containment checks, using GET/HEAD and disposable DOM only.

```powershell
node --test --test-reporter=spec tests/*.test.js
node tests/run-browser-harnesses.js --local
$env:PAPIJO_CKEDITOR_ROOT = 'C:\wamp64\www\wp-test\wp-content\plugins\h5p\h5p-editor-php-library\ckeditor'
node tests/run-browser-harnesses.js --local
Remove-Item Env:PAPIJO_CKEDITOR_ROOT
node tests/verify-inline-images-cli.js
php tests/phase1a-h5p-filter.test.php
php tests/inline-images-php-copy.test.php
node scripts/sync-sanitizer.js --check
node scripts/sync-inline-images.js --check
git diff --check
```

Browser checks use Playwright from the configured local runtime via `NODE_PATH`.
Also syntax-check all JavaScript/PHP and parse all tracked/untracked source JSON.
The browser H5P image widget's transport services are stubbed: the automated
draft callbacks do not prove real CMS upload/install behavior. PHP export tests
use actual installed methods with isolated temporary filesystem storage, not a
WordPress database. InteractiveBook replacement is covered by semantic nesting
and clipboard tests; live CLI runtime cases remain standalone/Accordion/Column.
The existing CLI raw-export foreign-path limitation is still characterized and
has not been changed; PHP-localized exports are self-contained.

Final automated results: **55/55 Node tests**, **14/14 established browser
harnesses plus two extra image-viewport runs per build** (16/16 on CLI 43.3.0
and 16/16 on WordPress 43.0.0), **10/10 live CLI cases**, four PHP filtering
groups, nine original PHP export/reimport cases plus saved-child copy and four
replacement cases. JavaScript syntax (30 files), PHP syntax (2), JSON (7), both
synchronization checks and `git diff --check` pass.

## Manual acceptance checklist — repeat in CLI and WordPress

1. At a text cursor, use the main Insert image icon, provide a managed image and
   ALT, and check existing insertion/caret behavior.
2. Select the image: main and contextual icons say Replace image. Try keyboard
   focus/Enter. Confirm the existing H5P picker opens with empty replacement ALT.
3. Try Apply without an image and with blank/whitespace ALT. Supply a different
   image and explicit ALT. Confirm the selected occurrence alone changes.
4. Cancel before image selection, then after uploading a draft. Confirm original
   image/ALT/style and Undo history remain unchanged.
5. Repeat replacement for Inline, Wrap left and Wrap right. Check ALT, wrapping
   and surrounding text, then Undo/Redo repeatedly and Delete/Undo.
6. Edit ALT/style after replacement, replace again, and save/reopen. Verify the
   latest file/ALT/style; check that shared references to A remain unchanged.
7. Repeat within AccordionPapiJo, ColumnPapiJo and InteractiveBookPapiJo. Check
   save/reopen, Accordion collapse/reopen, wrapping and float containment.
8. Copy/paste replaced content/children into each parent, save, export/reimport,
   and verify B renders while retained A still exists in the managed store/files.
9. In normal and narrow/nested layouts, check all contextual controls are
   accessible, including subsequent image selection and resizing. At genuinely
   insufficient main-toolbar widths, verify normal overflow remains usable.
10. Repeat in English/French. Confirm the form's Apply/error text, native labels
    and keyboard focus return. Finish ordinary text/table/tooltip regression checks.

## Deferred features

Image links, captions, resizing, imageBlock, centered/block styles, native
upload/drop/paste and orphan cleanup remain deferred.
