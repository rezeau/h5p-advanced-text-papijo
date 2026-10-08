# Managed inline images — Phase 1 proof of concept

## Preflight and scope

Verified on 2026-10-07 before modifying files:

- Working tree: clean, including no untracked files.
- Branch: `master`.
- HEAD: `855c476b9f123bbaa6080e7c2c15852ea9a9b42f`.
- Runtime: `H5P.AdvancedTextPapiJo 1.2.6`.
- Editor: `H5PEditor.AdvancedTextPapiJoTooltip 1.1.2`.
- Baseline: all 35 existing Node tests passed; existing PHP filtering test passed.

No versions, commits, tags, release packages, or pushes were made. Changes stay
inside this repository. H5P core, H5PEditor core, and NDLATimelinePapiJo were not
modified. Timeline support is outside this proof of concept.

## Implemented architecture and exact representation

The optional root `inlineImages` semantic list has its own hidden editor store,
independent from `tooltipImages`. Each list item is a group with three required
fields: `id` (`text`), `image` (`image`), and `alt` (`text`). The local insertion
form requires a valid uploaded-image path and nonblank trimmed alternative text.
The normal H5P image widget supplies metadata; the store clones the complete
metadata rather than extracting a URL.

Example saved parameters:

```json
{
  "text": "<p>Before <span class=\"papijo-inline-image\" data-papijo-inline-image-id=\"inline-example\"></span>after</p>",
  "inlineImages": [
    {
      "id": "inline-example",
      "image": {
        "path": "images/photo.png",
        "mime": "image/png",
        "width": 640,
        "height": 480,
        "copyright": { "license": "U" }
      },
      "alt": "A photograph"
    }
  ]
}
```

The occurrence's exact persisted HTML is:

```html
<span class="papijo-inline-image" data-papijo-inline-image-id="inline-example"></span>
```

Actual new IDs use `crypto.randomUUID()` where available, with a timestamp,
counter, and random fallback. ID syntax is restricted to 1–128 letters, digits,
underscores, or hyphens, starting with a letter or digit. A single definition
can be referenced by several occurrences. Duplicate definition IDs fail lookup
and store validation instead of choosing an ambiguous owner.

The canonical contract is independently copied into both H5P libraries by
`scripts/sync-inline-images.js`, following the existing sanitizer packaging
pattern. It validates IDs, paths, definitions, lookup, and path resolution.

Paths must be relative `images/...` paths. The standard pre-save `#tmp` suffix
is accepted. Absolute paths, remote URLs, protocols, backslashes, control
characters, query strings, unrelated fragments, empty segments, dot traversal,
encoded separators/traversal, malformed encoding, and double encoding are
rejected. Runtime and editor both resolve valid metadata through
`H5P.getPath(image.path, contentId)`; a missing, malformed, unsafe, or ambiguous
definition produces no image request.

The runtime resolver is reusable as
`H5P.AdvancedTextPapiJoInlineImageRuntime(root, contentId, definitions, onResize)`.
It scopes lookup to one root/store, creates images through `createElement`,
assigns `src` and `alt` as DOM properties, and attaches load/error resize
callbacks. Reinitialization and AdvancedText reattachment remove previous image
listeners. The CSS class `papijo-managed-inline-image` has `max-width: 100%` and
`height: auto` within `.h5p-advanced-text`. Tooltip initialization is unchanged.

## CKEditor model and conversion

The local text widget adds a native **Insert image** toolbar button and a local
image/alt form. Before CKEditor activation, a local insertion button tells the
author to place the cursor in the text first. Insertion requires a collapsed
selection and uses `model.insertObject` with selection placed after the image.

The dedicated model element is `papijoInlineImage`, inheriting `$inlineObject`,
with one attribute, `inlineImageId`. It has proper model/schema conversion and
native CKEditor image widget behavior; it is not a GeneralHtmlSupport annotation.

- Upcast: the managed span becomes `papijoInlineImage` with its stable ID.
- Data downcast: an empty span with only the class and managed ID is serialized.
  Using an EmptyElement prevents CKEditor's container filler from being saved.
- Editing downcast: the sibling semantic store supplies a preview image inside
  a native selectable widget using the installed `ImageUtils.toImageWidget`.
  Missing definitions retain the ID and show an unavailable image with no `src`.
- Undo/redo: CKEditor's object insertion participates in its normal history;
  the independently stored definition remains available for redo.

The installed H5P CKEditor bundle exports only ClassicEditor. The toolbar uses
the ButtonView constructor obtained from Essentials' public undo component,
then destroys that temporary component. This dependency is covered by the real
installed-build browser harness and should be rechecked when that bundle changes.

The Image plugin supplies native widget helpers, but schema checks disable its
ordinary `imageInline` and `imageBlock` URL models. The text semantics still do
not allow `img`, and no GHS rule enables arbitrary image HTML. Both the browser
editor harness and PHP filtering test reject unmanaged remote images.

The local text widget temporarily relaxes its core text-only required-field
check when it contains a marker resolving to a valid managed definition. It
restores the original field configuration immediately afterward; this permits
image-only content without enabling general image HTML.

## Automated verification

Final checks:

- Node suite: 46/46 tests pass, including all 35 prior tests.
- PHP: existing tooltip filtering, managed marker preservation, arbitrary image
  removal, and recursive inline list/group/image validation pass. The actual
  PHP image validator strips `#tmp` and preserves normal H5P image metadata.
- Browser: all 14 harnesses pass in headless installed Edge. Existing harnesses
  now load the new assets, so they exercise the changed production configuration.
- All repository JavaScript syntax and JSON parsing checks pass.
- Both sanitizer synchronization and inline-image contract synchronization pass.
- `git diff --check` passes.

New tests cover semantic discoverability, IDs and cloned metadata, required alt,
managed paths, unsafe/encoded paths, lookup, `getPath`, safe DOM construction,
responsive CSS, missing/malformed definitions, duplicates, multiple images,
tooltip coexistence, multiple AdvancedText instances, reinitialization, and
listener cleanup. The new browser harness additionally covers the native toolbar,
the installed H5P image widget, insertion, exact serialization, validation,
reopen conversion, text editing after an image, actual PNG loading in editor and
runtime, image-only validation, and basic undo/redo. Existing tooltip and table
regression harnesses remain green.

The browser harness stubs upload transport, popups, and `getPath` while using
the real installed image widget and CKEditor; it serves a real local PNG for
preview/runtime loading. A real CLI upload/save/export/reimport cycle has not
been executed by this phase. PHP recursion proves that H5P recognizes the
semantic image field; it does not prove byte inclusion in a real exported zip.

## Known limitations

- This phase supports insertion only. Replacement/editing of existing inline
  definitions, resizing handles, captions, floats, URL images, drag/drop upload,
  cross-field copying, and orphan cleanup are not implemented.
- Selection must be a cursor within an allowed text block. Selections of text
  or other objects are rejected. Moving/editing the text while the upload form
  is open is not covered by an advanced history/selection policy.
- The inactive H5P source field contains only markers; previews appear when
  CKEditor is activated. Runtime previews resolve on attach.
- H5P upload/copyright/picker changes are outside CKEditor's history. Canceling
  during an in-flight upload ignores late callbacks, but server-side temporary
  file lifetime remains H5P's responsibility.
- Definitions are deliberately retained through removal, validation, and undo.
  Unreferenced definitions can therefore increase saved/exported file size.
- IDs copied to another text field/content do not copy definitions. The receiving
  field renders them as unavailable; cross-field transfer is outside this phase.
- Existing metadata can have image editing/copyright information from the normal
  widget. The proof of concept does not introduce its own file lifetime policy.
- Actual save/export integration and all target-container layouts still require
  the manual checks below. Standalone and Accordion have automated integration
  coverage; Column/InteractiveBook embedding has not been browser-verified here.

## Exact manual H5P CLI browser procedure

1. In a separate PowerShell terminal, start the existing environment:

   ```powershell
   Set-Location 'C:\my_first_h5p_environment'
   h5p server
   ```

   Open `http://localhost:8080` (or the URL printed by your configured server).
   Restart an already running server and hard-refresh the editor so it reloads
   semantics and both library manifests. The currently verified junctions are
   `libraries\H5P.AdvancedTextPapiJo-1.2` to the repository root and
   `libraries\H5PEditor.AdvancedTextPapiJoTooltip-1.1` to `editor/`.
   The older README/setup helper still names 1.1/1.0; do not run that helper for
   these current versions.

2. On the dashboard, create new content titled `Inline images Phase 1`, using
   **Advanced Text Papi Jo**. Click inside Text to activate CKEditor. Type
   `Before after`, then place the cursor immediately before `after`.

3. Click **Insert image** in the CKEditor toolbar. Use the normal H5P image
   widget's Add/upload control to upload a local PNG or JPEG. Wait for its upload
   thumbnail. Leave alternative text empty and click the form's **Insert image**.
   Confirm a required-alt message appears and no image is inserted. Repeat with
   spaces only; it must still fail. Enter `A photograph of a tree` and apply.

4. Confirm an image appears between the text, remains in normal flow, and does
   not float. Type `More ` at the caret after it. Confirm the text reads as
   `Before [image]More after`. Click the image and confirm it is a selectable
   object. Undo the insertion/editing operations, then redo them; the image must
   return with its preview and alt. Do not expect upload changes to undo.

5. Insert a second image at another cursor position with a different alt. Add
   a normal tooltip to a word elsewhere in the same field, optionally including
   a tooltip image. Confirm both features remain usable. Save with the CLI's
   **Save all changes** control and wait for save completion.

6. Inspect `C:\my_first_h5p_environment\content\<content-folder>\content.json`.
   `text` must contain `span.papijo-inline-image` markers with managed IDs and
   no persisted image URL. `inlineImages` must contain matching IDs, image
   metadata, and nonblank alt. `tooltipImages` must remain a separate list.
   Confirm the corresponding image files exist in the saved content's `images`
   directory. On a normal persisted H5P save, temporary suffixes should be gone;
   record any CLI-specific temporary-path behavior if it differs.

7. Leave the editor, reopen this content's editor, and click inside Text.
   Confirm both previews reappear with unchanged IDs, positions, and alt.
   Type another word before/after an image and save again. Repeat reopen once
   more to verify the managed reference survives a second editing cycle.

8. Open the content's runtime View. Confirm both images load, the surrounding
   text remains editable only in authoring, and normal/tooltip-image tooltips
   behave as before. Narrow the browser viewport: images must fit the containing
   text width with their aspect ratio preserved. In browser DevTools inspect a
   generated `img.papijo-managed-inline-image`: its `alt` must match the store;
   `src` must resolve to the current content's managed file. The saved `text`
   must still contain only ID markers. Reload and confirm image loading causes
   the parent content layout to settle without clipping.

9. Create a separate image-only AdvancedText content. Insert one image with alt,
   save, reopen/focus, and view. It must pass the required Text validation.
   Return to the first item, delete one image occurrence and save; its definition
   may remain in `inlineImages`. Reinsert/undo within the same editor session as
   appropriate; no definition should be pruned just because its marker vanished.

10. Create disposable AccordionPapiJo, ColumnPapiJo, and InteractiveBookPapiJo
    items. Embed AdvancedTextPapiJo through each container's supported text field
    (InteractiveBook through its page/Column). Repeat upload, alt, save, reopen,
    and runtime checks. Put two AdvancedText fields in one parent, give their
    images distinct alts, and confirm they resolve independently. In Accordion,
    collapse/expand the panel; images must fit and panel heights must settle.

11. For a **disposable content export test**, use the runtime's export/download
    control. Open the resulting `.h5p` with a ZIP viewer. Confirm its
    `content/content.json` retains IDs and the independent store, and each
    referenced `inlineImages[].image.path` corresponds to an actual file under
    `content/images/`. Retained unreferenced definitions may include extra files.
    Import the disposable export as a separate test item and check View plus
    editor reopening. Record this result; semantic discoverability alone is not
    the final packaging acceptance check. This procedure does not call for
    building/publishing a library release.

Stop after these Phase 1 checks. Do not advance to replacement, advanced history
handling, or garbage collection as part of this proof of concept.

## Changed files and Git state

All edits are uncommitted on the original `master` HEAD. Existing changed files:

```text
README.md
editor/advanced-text-papijo-tooltip.css
editor/advanced-text-papijo-tooltip.js
editor/language/en.json
editor/language/fr.json
editor/library.json
language/fr.json
library.json
semantics.json
tests/README.md
tests/integration-stability-harness.html
tests/phase1a-ckeditor-harness.html
tests/phase1a-editor-widget.test.js
tests/phase1a-h5p-filter.test.php
tests/phase1a-harness-server.js
tests/phase1b-ckeditor-harness.html
tests/phase1c-ckeditor-harness.html
tests/phase1d-runtime-harness.html
tests/phase1f-editor-harness.html
tests/phase1f-runtime-harness.html
tests/r0-characterization-harness.html
tests/r2-editor-lifecycle-harness.html
tests/r3-selection-classifier-harness.html
tests/selection-validation-harness.html
tests/table-sort-ckeditor-harness.html
text.css
text.js
```

New untracked files:

```text
advanced-text-papijo-inline-image-runtime.js
advanced-text-papijo-inline-images.js
editor/advanced-text-papijo-inline-image.js
editor/advanced-text-papijo-inline-images.js
scripts/sync-inline-images.js
shared/advanced-text-papijo-inline-images.js
tests/INLINE-IMAGES-PHASE1.md
tests/inline-images-harness.html
tests/inline-images.test.js
tests/run-browser-harnesses.js
```
