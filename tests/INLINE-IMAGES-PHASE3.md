# Managed inline images: Phase 3

Development baseline: clean `master` at
`8ed270711bbcb9aecee003ddf0c085e405a1727c`. Versions stay runtime **1.2.6** and
editor **1.1.2**. Phase 1/2 reports describe their earlier snapshots.

## Scope and native editor configuration

Managed occurrences remain native `imageInline` model elements. The adapter adds
the installed native `ImageStyle` plugin beside `ImageInline` and `ImageToolbar`.
It never loads the `Image` glue plugin or `ImageBlock`. The existing main Insert
image icon, fourth immediately after Underline, and automatic overflow are unchanged.

```js
image: {
  styles: { options: ['inline', 'alignLeft', 'alignRight'] },
  toolbar: [
    'imageStyle:inline', 'imageStyle:alignLeft', 'imageStyle:alignRight',
    '|', 'imageTextAlternative'
  ],
  insert: { integrations: ['papijoH5p'] }
}
```

Other existing image configuration and insert properties are preserved when
merging configuration. Native CKEditor icons, labels, tooltips, active state and
keyboard navigation are used. English labels are “In line”, “Left aligned image”
and “Right aligned image”; French uses the installed native translations.

Native `imageStyle` execution is constrained to these three choices and forced
to `setImageSizes: false`. Unsupported direct command values are rejected. The
post-fixer retains only the two supported nondefault `imageStyle` values and
continues protecting managed IDs and removing unmanaged images/preview attributes.

## Persistence and history

Default inline (including all old markers):

```html
<span class="papijo-inline-image" data-papijo-inline-image-id="ID"></span>
```

Left/right wrapping adds one occurrence attribute:

```html
<span class="papijo-inline-image" data-papijo-inline-image-id="ID" data-papijo-inline-image-style="alignLeft"></span>
<span class="papijo-inline-image" data-papijo-inline-image-id="ID" data-papijo-inline-image-style="alignRight"></span>
```

The shared finite enum accepts only `alignLeft` and `alignRight`. Missing,
unsupported, malformed, whitespace-modified and incorrectly cased values become
default inline. The default never serializes a style attribute. PHP preserves
the data attribute, including unsupported values; editor/runtime normalization
is the enforcement boundary. Saved markers contain no preview URL, alt,
dimensions, native style classes, link or arbitrary CSS.

Definitions remain exactly `{ id, image, alt }` in `inlineImages[]`. Presentation
changes neither IDs nor definitions. Two occurrences with one ID may have
different presentation. Existing alt editing still retains the original
definition and switches the edited occurrence to a new definition; its style
survives. Style, alt and deletion have independent native undo/redo steps,
including combined histories. Definitions are retained conservatively.

Managed-path validation is unchanged. Runtime still calls
`H5P.getPath(image.path, contentId)` with the original accepted path. No semantic
field, manifest or version change is needed.

## Runtime layout and containment

Runtime creates `img.papijo-managed-inline-image` within each managed span,
assigning the resolved URL and literal alt through DOM properties. Finite styles
map to `papijo-inline-image-wrap-left` or `papijo-inline-image-wrap-right` on that
span. These classes are generated at runtime, not persisted by the editor.
Unknown styles never become CSS/classes. Known generated style classes are
removed before rebuilding and on destroy.

Images retain `max-width: 100%` and `height: auto`. Floated spans use a 0.5em
vertical margin and 0.75em margin toward surrounding text, with maximum width
`calc(100% - 0.75em)` so the image plus margin fits a narrow root.

For roots containing a supported floated occurrence, runtime marks the root
`papijo-inline-image-floats` and moves its content into one generated
`div.papijo-inline-image-flow`, styled `display: flow-root`. This inner formatting
context contains floats without clearing external floats. It leaves the root's
display untouched: live Accordion sets its root to block/none during expansion
and collapse, which overrides root-only `flow-root` containment. The inner
container avoids interfering with that behavior. Default-only content gets no
wrapper. Destroy unwraps children in their original order; reattachment never
nests wrappers. The wrapper is runtime-only, absent from saved/exported markers.

The editor separately marks its editable root when it has floats, using scoped
`display: flow-root`. The existing `figure.table + * { clear: both }` rule is
unchanged and still works inside the runtime container. Image load/error resize
notifications and tooltip behavior remain active.

## Automated verification

Run the commands in [tests/README.md](README.md). Native editor checks run with
both actual installed builds: CLI CKEditor 43.3.0 and WordPress CKEditor 43.0.0.
No new CKEditor modules/build are installed.

Verification on 2026-10-08: **54/54 Node tests**, **14/14 browser harnesses on
each build**, and **5/5 live CLI cases** pass. PHP filtering/semantic checks,
nine copy/save/export/reimport cases and the additional saved-child copy pass.
Syntax checks pass for 29 JavaScript files and two PHP files; all seven JSON
files, both synchronization checks and `git diff --check` pass. Automated
WordPress-build compatibility was checked through the harness; Phase 3 manual
CMS acceptance has not yet been performed.

| Requested coverage | Verification |
| --- | --- |
| 1–9: old/new/default markers, style transitions, reopen, exact serialization, invalid values | Existing insertion checks plus focused real-build Phase 3 browser checks and shared enum Node checks |
| 10–14: stable IDs/store, repeated references, alt/style independence | Native browser commands, shared-reference/peer editors, definition snapshots |
| 15–18: style/combined history, Delete/Backspace undo, inline-only | Native style/alt/delete operations and absence of block editing/type command |
| 19–25: paragraph, heading, list, table cell, ordinary link, tooltip, table balloon | Exact before/after HTML, unchanged model parents and native contextual toolbar switching |
| 26–27: English/French and narrow controls | Native icons, translated labels/tooltips, active state, focus/arrow navigation in 240px editors |
| 28–33: runtime/default wrapping, large/narrow images, root height, adjacent child | Actual 1280×960 SVG in 220px roots, measured geometry/aspect ratio and following sibling position |
| 34–35: clipboard and PHP save/export/reimport | Actual installed H5P clipboard; nine isolated real PHP storage/export/reimport cases and a second saved-child copy |
| 36–38: path security, instance isolation and resize lifecycle | Unchanged path acceptance/rejection cases, isolated editors/runtime, load/error and reattachment |

Live CLI GET-only verification constructs disposable standalone, Accordion and
Column content from the current runtime. All five existing copy cases now also
check both float classes, root height and, for Accordion, collapse/reopen after
its animation completes. No content is saved/uploaded by this check.

The installed CLI's raw content exporter still does not localize pre-existing
foreign file references in complex-content fixtures. This previously documented
limitation remains characterized by the passing Node test; it is separate from
PHP semantic save, which copies files before export. CMS acceptance is still
required, especially InteractiveBook and WordPress integration.

## Manual acceptance checklist

Perform each applicable check in **H5P CLI** and **WordPress**, with standalone
AdvancedTextPapiJo and children of **AccordionPapiJo**, **ColumnPapiJo** and
**InteractiveBookPapiJo**. Confirm the installed editor assets actually contain
this development build before testing; no Phase 3 package is produced here.

1. Open an old image marker. Confirm default inline and a visible main Insert
   image icon immediately after Underline. Insert a new image through the normal
   H5P picker with required alt; it starts inline.
2. Select the image. Confirm exactly Inline, Wrap left, Wrap right, separator,
   Alternative text. Check English/French native labels, active state, keyboard
   focus/arrow navigation and a narrow editor. Main-toolbar overflow stays normal.
3. Try each style in paragraphs, headings, lists and table cells, beside ordinary
   links and tooltips. Confirm surrounding structure is unchanged and switching
   to a table still shows its native toolbar.
4. Change style, then alt, then style again. Undo/redo every step; alt survives
   style edits and presentation survives alt edits. Delete/Backspace the image,
   then undo. Repeated references to the same ID can have different styles.
5. Save/reopen each style. Inspect parameters if available: only left/right add
   `data-papijo-inline-image-style`; definitions gain no presentation fields or
   extra IDs from styling. Preview attributes/classes do not appear in markers.
6. View all containers. Use a large portrait and landscape image in a narrow
   layout. Confirm text wraps on the intended side, images stay within the root
   with preserved aspect ratio, and the next H5P child begins below the image.
7. Expand/collapse/reopen Accordion panels and change InteractiveBook pages.
   Check complete root/iframe height, no clipping, table clearing and tooltip
   image opening/closing. Repeat after resizing the window.
8. H5P content-copy styled standalone into each complex parent; copy a saved
   child between parents and within a parent where supported. Save/reopen and
   verify presentation, alt and actual image bytes still resolve.
9. Export **saved** CMS content and reimport it into a fresh test content.
   Verify each style, alt and image file in editor/runtime, including nested
   content. Record CLI raw-export foreign-reference behavior separately.

## Deferred work

No center/block/side styles or imageBlock; no image links, replacement,
captions, resize UI, orphan cleanup, image drag/drop, external pasted images,
arbitrary sizing or new CKEditor modules. Native float behavior does not reorder
the inline model or create a block/caption structure. The wrapper can affect
custom CSS relying on direct children; check site-specific styling manually.

Work stays unstaged and uncommitted. No version bump, package, tag, push or
publication belongs to this phase.
