# Managed inline images — Phase 2

## Preflight

Branch: `master`. HEAD: `855c476b9f123bbaa6080e7c2c15852ea9a9b42f`.
The intentional Phase 1 working tree had 27 modified tracked files and 10
untracked files. It was preserved. Before implementation, all 46 Node tests,
all 14 browser harnesses, and all three PHP filtering/semantic checks passed.

Runtime remains `H5P.AdvancedTextPapiJo 1.2.6`; editor remains
`H5PEditor.AdvancedTextPapiJoTooltip 1.1.2`. No commit, tag, version bump, release
package, or push. No changes to H5P core, H5PEditor core, or NDLATimelinePapiJo.

## Native integration

The actual installed CKEditor build is 43.3.0 at
`C:\my_first_h5p_environment\libraries\h5p-editor-php-library\ckeditor\ckeditor.js`.
The local configuration loads the bundled `ImageInline` constructor through
`Image.requires`, plus `ImageToolbar`. This enables ImageInlineEditing,
ImageTextAlternative and ImageInsertUI with native Widget behavior; ImageBlock,
ImageUpload, ImageStyle and ImageCaption are not activated.

The adapter runs in the local plugin's `init()` after the native schemas and
commands are registered. It extends native `imageInline` with `inlineImageId`.
ImageUtils is unchanged. Native editing converters produce the normal
`span.image-inline` widget containing an image.

The native main-toolbar `insertImage` component uses
`ImageInsertUI.registerIntegration()`. Its sole provider, `papijoH5p`, opens the
existing H5P image widget and required-alt insertion flow. The provider returns
a native CKEditor ButtonView with the standard CKEditor image SVG icon,
`withText: false`, and the translated Insert image label/tooltip. The SVG is
copied from the audited build's `ckeditor5-core/theme/icons/image.svg`, since
the build does not export its icons separately. The item is immediately after
Underline; normal automatic grouping remains enabled. It is
disabled for noncollapsed selections, read-only editors, missing stores, or
positions where inline images are disallowed. Selecting an existing image
does not expose replacement.

`image.toolbar` is explicitly `['imageTextAlternative']`. The normal image
balloon therefore has only Alternative text, with CKEditor's own input,
Save/Cancel buttons and focus behavior. Tables keep their separate contextual
toolbar; the native widget repository prioritizes the selected image in a cell.

## Conversion and ownership

The canonical format is unchanged:

```html
<span class="papijo-inline-image" data-papijo-inline-image-id="ID"></span>
```

The independent `inlineImages` store still contains `{ id, image, alt }`.
H5P image metadata/path owns the file; H5P.getPath resolves editor/runtime URLs.

Upcast turns a valid managed marker ID into `imageInline`, with projected src
and alt from the sibling store. Missing or invalid definitions retain a valid
marker ID and render an unavailable image without src. Malformed IDs do not
become native images. A highest-priority img handler stops arbitrary native
and GHS image upcasts before a URL-owned model can be created.

Data downcast overrides the native img element with an empty managed span.
Changes to inlineImageId reconvert that span. A highest-priority attribute
handler consumes other image attributes before native src/alt/size converters
can act on the span: preview URLs, alternative text and dimensions do not leak.
Editing downcast keeps native image rendering and consumes the managed ID
without rendering it as a preview DOM attribute.

A model post-fixer removes unmanaged imageInline objects, restores preview
src/alt from their managed definition, and removes unsupported image source,
size, style and link attributes. Native insertImage/imageInsert and
replaceImageSource commands are force-disabled. Image upload/URL insertion
providers are not loaded or configured. Native Delete/Backspace removes only
the occurrence; definitions remain retained.

## Alternative text and history

The native decorated imageTextAlternative command is adapted locally. Nonblank
trimmed alt is required, both for form submissions and direct command calls.
The public ContextualBalloon visible-view event attaches a high-priority submit
validator to the native alt form; invalid submission keeps it open and displays
the existing translated error. No separate alt dialog or private method patch.

Changing alt clones the previous complete H5P image metadata into a new retained
definition with a fresh stable ID. The occurrence's ID and projected alt change
together in one model batch. Undo restores the previous ID/alt; redo restores
the revised ID/alt. Both definitions remain. A repeated reference elsewhere
keeps its original definition. Submitting unchanged trimmed alt creates no
definition. Cancel changes nothing. Missing definitions disable alt editing.

## Files changed specifically for Phase 2

- `editor/advanced-text-papijo-inline-image.js`: native model, conversion,
  insertion provider, contextual alt validation/history, security guards.
- `editor/advanced-text-papijo-tooltip.js`: native adapter initialization order.
- `editor/advanced-text-papijo-tooltip.css`: responsive native image-inline preview.
- `tests/inline-images-harness.html`: expanded real-build Phase 2 checks.
- `tests/phase1a-harness-server.js`: installed French CKEditor translations for
  toolbar localization checks.
- `tests/run-browser-harnesses.js`: fail if injected remote test images load.
- `tests/phase1a-h5p-filter.test.php`: retained alt revisions sharing a file.
- `README.md`, `tests/README.md`, this report: current behavior and checklist.

Semantics, shared contract, runtime code, translations and manifest versions
needed no further Phase 2 changes. Their existing Phase 1 changes remain.

## Automated verification

- Complete Node suite: 46/46 pass.
- Complete installed-Edge browser suite: 14/14 harnesses pass, using the actual
  installed CKEditor, H5P Html and H5P image widget. The image transport/popup
  services are stubbed; previews and runtime load real fixture PNG bytes.
- PHP: H5P FILTER PASS, INLINE IMAGE FILTER PASS, INLINE IMAGE SEMANTIC FILE PASS.
- All repository JavaScript syntax and JSON parsing pass.
- Managed-image and tooltip-sanitizer copy synchronization checks pass.
- `git diff --check` passes.

The image harness covers Phase 1 reopening and exact marker round trips; no
preview leakage; native insertion and contextual toolbar; alt display, valid
edit, blank/whitespace rejection, direct command validation and cancel; retained
metadata; insertion and alt undo/redo; DOM Delete/Backspace; definition retention;
save/reopen after alt edits; multiple images and repeated-reference isolation;
missing, malformed and unsafe references; remote/data/file HTML and clipboard
image rejection; disabled URL commands; unmanaged direct-model rejection;
read-only behavior; tooltipImages and table-toolbar coexistence; independent
editor stores; safe runtime loading, responsive CSS and resize events.

The toolbar fix additionally checks English and the installed French CKEditor
translations, icon rendering, hidden text, accessible label/tooltip, effective
item order, and actual toolbar visibility. At toolbar widths 916, 724, 564,
404, 284 and 180 px the image icon stays directly visible, while later controls
overflow as needed. At 100 px the image enters normal overflow. No global
`shouldNotGroupWhenFull` setting or custom pinned-control mechanism is added.

The existing tooltip editing/runtime, selection/filtering, table, nested-editor,
lifecycle and cleanup harnesses all remain passing. Standalone runtime is
exercised locally; full CMS save/export/reimport and live Accordion, Column and
InteractiveBook acceptance remain manual. Those host libraries were not modified.

## Limits and deferred scope

No alignment/styles, block images, captions, interactive resize, image links,
replacement, orphan cleanup, unmanaged images or Timeline integration. Retained
alt revisions can increase semantic-list size; file metadata is reused rather
than issuing uploads. Invalid stores still fail store validation. Deleted image
definitions stay in content, including history definitions.

The local adapter depends on the audited build's Image.requires constructor and
native alt-form view contract. Re-run these harnesses when H5P changes CKEditor.
No new CKEditor build or external package is installed.

## Exact manual browser acceptance checklist

Use the existing local H5P installation and junctions. From
`C:\my_first_h5p_environment`, run `h5p server`, then open
`http://localhost:8080`. In the dashboard create AdvancedTextPapiJo content, or
edit a saved Phase 1 example. Use the content's save control after each save
step. Compare image selection/alt editing with Backdrop's normal CKEditor UX.

1. Focus the text editor. Confirm Insert image appears directly in the main
   toolbar, with no URL insertion choices.
2. Type `Before after`, put the cursor between the words, click Insert image,
   select/upload using the H5P image widget, and apply nonblank alt. Confirm the
   image appears at the saved cursor position.
3. Click the image. Confirm normal native widget selection and the contextual
   Image toolbar appear.
4. Confirm Alternative text is the only image-toolbar command. Open it and
   confirm the current managed alt appears in CKEditor's normal form.
5. Try empty alt and spaces only. Each must keep the form open with the required
   alt error. Enter a valid description and Save; reopen the form to verify it.
6. Type a different description and Cancel. Reopen and confirm no change.
7. Save content and reopen its editor. Confirm image, alt and surrounding text
   survive. Repeat with an existing Phase 1 saved marker.
8. Change alt, Undo, reopen the alt form and verify the old text; Redo and verify
   the new text. Undo/redo a new image insertion too.
9. Select an image and press Delete; Undo. Repeat with Backspace; Undo. Confirm
   surrounding text survives and restored images have the correct alt.
10. Type and edit text immediately before and after the image, including after
    save/reopen. Add a second image and edit each alt independently.
11. Add a text tooltip and an image tooltip near the inline image. Save/reopen;
    verify tooltip editing and runtime popup behavior remain correct.
12. Add a table, place an inline image in a cell and select it: its alt toolbar
    appears. Move the caret to ordinary cell text: the table toolbar appears.
    Verify existing table editing and sorting controls.
13. Export this test content through the normal H5P content export control,
    reimport it, and verify images and revised alt without original-site paths.
    This is a content round trip, not a library release package.
14. Open the standalone AdvancedTextPapiJo runtime. Verify image display,
    responsive width, alt and tooltip behavior.
15. Put AdvancedTextPapiJo in AccordionPapiJo. Save/reopen, expand/collapse, and
    verify image/alt editing, runtime sizing and tooltips.
16. Repeat inside ColumnPapiJo, including two independent AdvancedText children.
    Verify each image/alt belongs to its own content instance.
17. Repeat inside InteractiveBookPapiJo. Navigate pages, save/reopen and verify
    image loading, alt, tooltip placement and resizing on the containing page.

Automated checks do not substitute for these CMS/container/export steps.

## Final Git state

Branch and HEAD unchanged. All changes remain uncommitted: 27 modified tracked
files and 11 untracked files (the new Phase 2 report adds one to Phase 1's list).
No files were staged, cleaned, reverted, committed, tagged, packaged or pushed.
