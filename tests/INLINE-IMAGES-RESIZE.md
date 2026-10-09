# Managed Image Resize: Phase 1

Baseline: `master` at `a8ef9aa9ea9603ad41028ef19d715930e001bad0`, clean,
ahead 4/behind 0. Runtime **1.2.6** and editor **1.1.2** remain unchanged.
This feature is uncommitted. **User-reported manual acceptance: PASS** in H5P CLI
and WordPress. The final checkpoint acceptance and UI cleanup are recorded below;
acceptance of the earlier image milestones is separate.

## Size contract

Native `imageInline` adds occurrence-local numeric `papijoImageWidth`.
Definitions remain exactly `{ id, image, alt }`. The optional canonical marker
attribute is `data-papijo-inline-image-width="55.5"`. Data output contains no
image URL, raw style, intrinsic width/height, editing handles or native anchor.

Plain decimal percentages from **0.1 through 100**, with at most one decimal
place, are accepted. `30.0` normalizes to `30`. Signs, exponents, whitespace,
percent text, non-finite values, CSS, markup, malformed values and values outside
the range are rejected. Shared validation runs on import, direct model state,
data downcast and DOM-decoded runtime input. Invalid state becomes default.
Calculated drag/keyboard values round to the nearest tenth.

An absent attribute means existing natural/default responsive sizing. Explicit
`100` remains a distinct author choice. Reset removes the attribute.

## Rendering

Controlled classes and numeric CSS custom properties size the outer widget or
runtime marker. The image fills that box with automatic height; an image link
fills it too. Percentages use the containing layout region's **content box**,
including local paragraphs, list regions and table cells, rather than the
viewport, remaining line space or an image/link wrapper.

Displayed width is capped by the source image's actual intrinsic CSS width and
available containing space. A 128px source cannot grow past 128px at 100%.
Wrapped occurrences retain the existing 0.75em gutter, responsive maximum width
and flow-root containment. Loaded/cached source dimensions are projected, never
persisted as occurrence height or file metadata.

Inline/Wrap transitions, Link/edit/unlink, ALT changes and Replace preserve size.
Replace retains old/new definitions; the replacement uses its own aspect ratio
and intrinsic cap. Repeated references can independently use default, 30%, 70%,
linked 70% and wrapped 40%. No derivative files or definition clones are created
by resizing.

## Editor controls and history

Four native ButtonViews in the editor's public UI-body collection mark the image
corners. They are outside editable image/link content, have translated accessible
labels, visible keyboard focus and current-size instructions, and disappear for
text selection, unavailable images, loss of editor focus, read-only mode and
destruction. No additional balloon or main-toolbar alteration is introduced.
Control positions use a minimum 32px corner frame for tiny images, without
changing the image dimensions, so four hit targets do not collapse together.

Primary Pointer Events capture one target occurrence and geometry. Corner motion
projects onto its aspect-ratio diagonal. Movement changes only the editing view;
release commits only `papijoImageWidth` in one undoable model transaction. There
is no history or store mutation during preview. Click/no effective movement
creates no history entry.

Escape, pointercancel, unexpected lost capture, read-only, destruction,
selection/target/model changes and changed containing width cancel. Restoration
uses the latest model projection; a captured stale gesture cannot overwrite a
replacement or redirect to another image. Capture is cleared before release to
avoid double handling of lostpointercapture.

Focused handles accept **Right/Up = larger, Left/Down = smaller**:

The southeast handle is the single sequential keyboard entry. From a selected
managed image in the editable, **Tab** focuses it with the visible focus outline.
The other three corners remain pointer controls, without extra sequential Tab
stops. **Escape** or **Shift+Tab** from a handle returns to the selected image in
its native editable (the nested cell editable for a table). Further Shift+Tab
continues backward normally; table cells may visit the outer editable first. Forward **Tab**
from a handle continues to the editor's next ordinary field: the controller
returns the browser's navigation origin to the editable and temporarily removes
the external entry from that one Tab event. Hidden handles have tabindex -1.
Focus and navigation alone do not change content or history.
Tab navigation with a selected managed image also bypasses native list
indentation/outdent handling; ordinary text/list editing keeps its native keys.

- Arrow: **0.1 percentage point**.
- Shift+Arrow: **5 percentage points**.
- Each effective key operation is one undoable step; boundary/no-change keys
  create no model change.

The only added contextual toolbar button is **Reset size / Réinitialiser la
taille**, with a local SVG icon. It removes width in one Undo step, preserves
ID/ALT/Wrap/Link, and is disabled at default size. Existing six controls remain
reachable, including beside native Link forms/actions. At 160px the native
toolbar wraps into additional rows as necessary. Main-toolbar grouping remains
enabled. There are no Smaller/Larger buttons or numeric dialogs.

43.3.0 automatically tracks UI-body focus. 43.0.0 requires explicit registration;
the controller removes only registrations it owns. Native editor keystrokes
are registered only on the owned handles, so Ctrl+Z/Y
and Ctrl+K remain available there; those subscriptions are also removed on destroy.
Owner-document scroll and window resize listeners exist only while handles are visible. Escape/blur
listeners exist only during a gesture. Destruction releases capture, removes
views/listeners/focus registrations, disconnects observers and cancels frames.
Projection checks for actual differences before writing, preventing a continuous
render/animation-frame feedback loop.

## Automated verification

`inline-images-resize.test.js` tests numeric security, distinct default/100,
unchanged definitions/versions, local asset order and actual installed H5P
clipboard paths/files across standalone/Accordion/Column/InteractiveBook copies.

`inline-images-resize-browser.js` extends the existing native-host harness:

Sequential-keyboard regressions use Playwright `page.keyboard.press()` starting
in the selected-image editable, without focusing a handle locator. They cover
Tab entry, focus outline, fine/coarse steps, Ctrl+Z/Y, Escape, forward/backward
exit, linked image isolation, multiple instances, destruction/recreation, list
and table contexts, and English/French on both installed CKEditor hosts. Earlier
`locator.press()` checks focused the handle automatically and therefore tested
key operation without proving sequential reachability. The new Tab-entry
regression failed on both pre-fix builds before the controller was corrected.
real mouse capture for all corners, smaller/larger, one Undo/Redo, view-only
pointermoves, no-motion and cancellation; stale/deleted/replaced/read-only/model/
selection/basis/destruction targets; fine/coarse keyboard focus and Reset; strict
import/model/runtime validation; same-editor clipboard insertion; real H5P
replacement provider with different ratio; occurrence isolation; padded,
indented, list and table bases; English/French; multiple instances/recreation.

Responsive tests compare actual editor/runtime geometry for 144 combinations of
four container widths, three presentations, linked/unlinked, large/small source
and default/55.5/100. At narrow actual viewports, larger requested containers are
constrained to the available viewport; the desktop run exercises all four full
container widths. The runner tests actual viewports 1280/480/320/160 on both
installed host builds/configurations and retains the previous 14 routes.

Both actual PHP cores filter width data and exercise 21 isolated
save/localize/retain/export/reimport cases (9 original, 4 Replace, 4 Link,
4 Resize), plus saved-child copy. All retained image bytes are compared.
The live CLI check adds 20 resized original/linked/replacement cases to the
established 20. Syntax, JSON, synchronized contracts/sanitizer and diff checks
remain part of verification.

Final automated results from the completed pre-commit review:

| Check | Result |
| --- | --- |
| Node | 66/66 PASS |
| CLI CKEditor 43.3.0 + actual host configuration | 14 harnesses; 17/17 viewport runs PASS |
| WordPress CKEditor 43.0.0 + actual host configuration | 14 harnesses; 17/17 viewport runs PASS |
| PHP filtering, each actual host core | 6/6 groups PASS |
| PHP lifecycle/export/reimport, each actual host core | 21/21 cases PASS plus saved-child copy |
| Syntax | 35 JavaScript files, 28 inline scripts, 2 PHP files PASS |
| JSON / translations | 7 JSON files valid; 46 EN/FR keys synchronized |
| Manifest / load order / synchronization | Asset declarations, load order, both contracts/sanitizer checks PASS |
| Diff whitespace | git diff --check PASS |

The live CLI script was reviewed but **not rerun** during the final pre-commit
review. Its earlier 40/40 PASS result is historical, not a result of that review.

Final pre-commit checkpoint: **34 modified tracked files, 5 untracked,
39 total, zero staged**. HEAD remains
`a8ef9aa9ea9603ad41028ef19d715930e001bad0` on `master`, ahead 4/behind 0.
Runtime **1.2.6** and editor **1.1.2** remain unchanged. The final review changed
no files and performed no staging, development packaging, commit, version bump,
tag, push or publication.

## Final checkpoint acceptance and UI cleanup

**User-reported H5P CLI manual acceptance: PASS**, covering pointer resizing,
Reset size, real Tab to the southeast keyboard resize handle, Arrow/Shift+Arrow
resizing, Undo/Redo, wrapping/link/ALT/Replace width preservation, toolbar Insert
image, picker validation, Replace image and final UI cleanup.

**User-reported WordPress manual acceptance: PASS**, covering pointer resizing,
Reset size, keyboard resize, persistence after save/reopen,
wrapping/link/ALT/Replace width preservation, runtime responsive sizing and
toolbar/picker behavior. These manual results were reported by the user;
Codex did not perform the manual acceptance tests.

The final accepted UI behavior, including the latest CLI UI acceptance, is:

- Before editor activation, no Create tooltip UI is visible.
- The obsolete external Insert image UI and cursor instruction are absent.
- Create tooltip appears only for a valid text selection; merely clicking in text
  does not need to expose it, and image selections remain excluded.
- Managed image insertion uses the CKEditor toolbar.
- Validation messages are local to the active picker.

The accepted cleanup removes the external Insert image button and cursor
instruction. The toolbar `papijoH5p` provider invokes shared `openPicker()`
directly, while Insert and Replace continue sharing picker machinery.
Validation messages live inside the active picker, and the unused
`placeInlineImageCursor` EN/FR translation was removed. The Create-tooltip
wrapper is hidden before activation; its controls remain selection-dependent,
and lifecycle callbacks use owned-editor identity guards.

## Limits and manual acceptance checklist

This is a library-local controller: installed ImageResize and WidgetResize
classes are absent. No core/bundle changes or dependencies are added. The
existing CLI foreign-reference export limitation remains out of scope.

Physical touch/pen, mobile browsers and pointer movement across CMS iframe
boundaries require manual acceptance. Only handles use `touch-action:none`;
scrolling elsewhere is unchanged. Multi-touch and legacy pointer fallbacks are
deferred. Keyboard handles and Reset are provided; this approved first scope
does not provide non-drag pointer size adjustment besides Reset and makes no
claim of full dragging-accessibility conformance.

In both CLI and WordPress, check:

- Insert an image; select it and verify four handles and all seven toolbar
  controls. Check English/French and 480/320/160px/nested layouts.
- Resize smaller/larger from every corner; verify aspect ratio, one Ctrl+Z and
  one Ctrl+Y, and no history steps for click/Escape/cancel.
- Tab to the southeast handle, use Arrow and Shift+Arrow, verify focus/status and Reset;
- Verify Escape/Shift+Tab return to the image and forward Tab reaches the next ordinary field;
  Undo/Redo Reset. Test very small sizes and a small source at 100%.
- Switch Inline/Wrap left/Wrap right; link/edit/unlink, edit ALT, and Replace
  with a different source ratio. Size must survive each action and history.
- Verify resize does not open a linked image; native Link toolbar coexistence
  and Add Tooltip image exclusion still work.
- Use repeated shared references with different widths. Save/reopen, same-editor
  copy, H5P content copy into all three parents, export/reimport and narrow
  float containment must retain independent widths and files.
- Cancel active drag by read-only/deletion/replacement or changing container
  width; recreate editors and switch between multiple instances.
- Test real touch/pen where available, scrolling, collapsed/reopened parents,
  and iframe boundaries. Confirm no detached/stale handles remain.
