# Managed inline-image copy/paste path fix — 2026-10-07

The production change is restricted to `validPath()` in the shared managed
inline-image contract and its independently packaged runtime/editor copies.
Semantics, IDs, marker HTML, native `imageInline`, toolbar, runtime resolution,
tooltip code, and installed H5P/H5PEditor code are unchanged by this fix.

## 1. Old validator

After stripping a terminal `#tmp` for validation and decoding once, the path
had to start with `images/`. All segments had to be nonempty and different
from `.` and `..`; schemes, backslashes, query/fragment characters, remaining
percent signs, controls, and encoded separators were rejected.

Consequently `../text-01/images/file.jpg` failed before lookup/resolution could
call `H5P.getPath()`. The same source file was accessible through H5P's ordinary
resolver and already rendered through the tooltip implementation.

## 2. Exact accepted grammar

```text
PATH = HOP* ROOT? images/SEGMENT (/SEGMENT)* [#tmp]
HOP  = ../ID/
ROOT = ../content/ID/ | ../../content/ID/
ID   = one or more literal ASCII letters, digits, underscores, or hyphens
```

`ROOT`, when present, ends the prefix: no further traversal is permitted after
it. Repeated traversal is allowed only through complete `../ID/` copy hops.
`SEGMENT` is a nonempty decoded filename/directory segment, other than `.` or
`..`, containing none of backslash, colon, `?`, `#`, `%`, U+0000–U+001F or
U+007F. Unicode filenames, spaces, and single-encoded spaces continue to work.
Raw outer whitespace is rejected. Decode once; reject malformed encoding and
any decoding that adds a slash. Parent segments must be literal `..`, never
encoded. Prefix IDs must be literal, never encoded. The existing decoded
`images` token behavior is retained. `#tmp` is ignored only during validation.

This is a structural check; it does not establish that a source content exists
or that a file is owned by a particular content instance.

The installed `h5p-php-library/js/h5p.js` `parseClipboard()` prepends
`../<source contentId>/` when the destination has a content ID. Every later
copy may add another complete hop. With no destination ID it prepends
`(contentRelUrl || '../content/') + sourceId + '/'`. The default and the
explicit `../../content/` configuration are tested by executing the installed
function. No arbitrary `contentRelUrl` override is granted general traversal
permission. Custom layouts and content IDs outside the profile above remain
unsupported and require a separate review.

Accepted examples:

```text
images/file.jpg
../text-01/images/file.jpg
../acordion-papijo-001/../text-01/images/file.jpg
../col-pj/../acordion-papijo-001/../text-01/images/file.jpg
../42/images/file.jpg
../content/42/images/file.jpg
../../content/42/images/file.jpg
```

No prefix is removed or normalized. `resolve()` still passes the original
`definition.image.path`, including its source prefix, to
`H5P.getPath(image.path, destinationContentId)`.

## 3. Security checks

Tests reject HTTP/HTTPS, javascript/data/blob/file schemes, protocol-relative
URLs, leading slash/backslash, Windows drive paths, backslash traversal,
arbitrary `../../source/` and `../../../content/` traversal, extra directories
between source ID and `images`, traversal within the image suffix, traversal
after a content-root prefix, empty/dot segments, non-image destinations,
queries/fragments, encoded parent/slash/backslash/control segments, double
encoding, malformed escapes, and literal controls. Rejected definitions still
fail before `getPath` and image loading. The deliberately supported
`../../content/ID/images/...` form is not a general `../../` exception.

## 4. Exact files changed in this fix

Production:

- `shared/advanced-text-papijo-inline-images.js` — canonical segment validator.
- `advanced-text-papijo-inline-images.js` — synchronized runtime copy.
- `editor/advanced-text-papijo-inline-images.js` — synchronized editor copy.

Tests and documentation:

- `tests/inline-images.test.js`
- `tests/inline-images-copy.test.js` (new)
- `tests/h5p-inline-image-copy-fixtures.js` (new)
- `tests/fixtures/inline-image-copy-source.json` (new captured source parameters)
- `tests/inline-images-cli-export.test.js` (new)
- `tests/inline-images-php-copy.test.php` (new)
- `tests/verify-inline-images-cli.js` (new optional GET-only live check)
- `tests/inline-images-harness.html`
- `tests/phase1a-harness-server.js`
- `tests/README.md`
- `tests/INLINE-IMAGES-COPY-PASTE.md` (this report)

## 5–7. Copy/paste, getPath, and tooltip results

The tests execute the installed H5P clipboard section, not a substitute
rewriter. Source data contains five retained inline definitions, two active
occurrences, and one tooltip definition. Clipboard parsing preserves all
managed IDs, alt, MIME, dimensions, copyright, and marker HTML. It clears the
copied library child's `subContentId` independently of managed occurrence IDs.

The captured real occurrence paths include:

```text
Accordion cow: ../text-01/images/bde121d522e93dba9bc7e80efbac0c63.jpg
Column pig:    ../text-01/images/cb5b8cb112fe972fbfeb21a9f3112ca7.jpg
Column cow:    ../text-01/images/bde121d522e93dba9bc7e80efbac0c63.jpg
Tooltip:       ../text-01/images/90d25dbc176af53faa20f8c1997ae38e.jpg
```

Browser harness: standalone → Accordion; standalone → Column; Accordion child
→ Column; another copy → Book destination ID. Each case loads both editor
previews and runtime images, calls `getPath` with the exact foreign reference
and destination ID, edits alt through the native form, validates, serializes
and reopens successfully. Tooltip store data and popup loading remain intact.
The reopen is an isolated parameter round trip, not a live CMS save.

Live CLI: actual standalone, AccordionPapiJo, and ColumnPapiJo constructors,
actual H5P resolver, actual source file bytes. Both inline images load at
natural widths 425 and 460; the tooltip image loads at width 320. Tested direct
copy, child copy, and three-hop repeated copy. Exact references and parent
content IDs are recorded by the optional live script. It constructs copied
content in disposable browser DOM on the real CLI pages; it does not save or
alter the user's current panels/content/clipboard. Physical bytes remain in
`content/text-01/images/`; foreign paths resolve to those files.

Same-parent and InteractiveBook destination path generation are covered by
installed-core tests. Full InteractiveBook navigation and real CMS UI
copy/paste/save remain manual acceptance tasks.

## 8. PHP-backed save

The test invokes installed `H5peditor::processParameters()` using actual
AdvancedText/Accordion/Column semantics and actual `H5PDefaultStorage`.
Framework/database lookups are isolated; storage writes only a unique test
temporary tree. The relative-path expression comes from installed H5PCore.

For numeric CMS source IDs, the semantic image dispatch matches the foreign
reference, calls `cloneContentFile()`, and replaces it with local `images/...`.
All inline definitions and the tooltip definition survive with identical image
bytes. A local re-save keeps both stores' files. A saved Column child copied
again into Accordion also becomes destination-local. No library cloning code
was added. CMS copies normally start from files already localized by the
preceding save, rather than accumulating the CLI's unsaved reference chains.

## 9. Export/reimport

| Environment/check | Result |
| --- | --- |
| Actual CLI standalone content export/import in isolated folders | Self-contained; all managed inline and tooltip files present |
| Actual CLI copied Accordion content export/import | Not self-contained; five inline definitions and one tooltip definition retain foreign references; source files absent |
| Actual CLI copied Column content export/import | Same limitation |
| Installed PHP editor + storage + H5PExport + storage reimport | Nine isolated round trips pass: standalone/Accordion/Column × three numeric-source reference prefixes; local image paths and identical bytes preserved |
| Live WordPress CMS copy/save/export/import | Not run; no WordPress site/content/library changes made |

CLI export simply archives the destination folder; CLI save does not perform
the PHP semantic cloning step. Reimport into an environment without the source
folder therefore leaves foreign inline **and tooltip** files unavailable.
The isolated CLI test also withholds the source folder and verifies this.
This limitation is reported separately and is not repaired by the validator.

PHP export tests intentionally omit library dependencies to test the content
and file round trip without creating a release package. They establish
self-contained parameters/files after PHP save, not full CMS dependency
validation, installation, or WordPress UI acceptance. They do not prove that
PHP can repair a non-self-contained CLI archive containing slug/chained paths.

## 10. Complete regression results

- Node: **51/51 pass**, including actual installed clipboard and CLI export/import.
- Browser: **14/14 harnesses pass**, including new copied-image/native-alt cases.
- Main toolbar regression remains passing: image visible at 916, 724, 564,
  404, 284 and 180 px; normal grouping moves it into overflow at 100 px,
  in both English and French.
- Live CLI rendering: **5/5 cases pass** with real image bytes and exact resolver calls.
- Existing PHP filter/marker/semantic-image checks: **all pass**.
- New PHP: **9/9 save/export/reimport cases pass**, plus saved-child second copy.
- PHP syntax: **2 files pass**; JavaScript syntax: **28 files pass**.
- JSON: **7 files parse**.
- Sanitizer and inline-image synchronization checks: **pass**.
- `git diff --check`: **pass**.

## 11–12. Limits and Git state

The accepted source path still requires its source file to exist until the
host localizes it. CLI cross-content exports remain dependent on that source.
Unsupported custom relative layouts/IDs are rejected, rather than widening
the traversal exception. Live WordPress and full InteractiveBook acceptance
remain unverified as described above.

Branch `master`, HEAD `855c476b9f123bbaa6080e7c2c15852ea9a9b42f` unchanged.
The working tree has **27 modified tracked files and 18 untracked files**,
including all intentional Phase 1/2 work. Nothing is staged. No commit,
version bump, release package, push, revert, or cleanup of existing work.
Temporary content exports were test artifacts only and were removed with their
isolated temporary trees. Runtime/editor versions remain 1.2.6/1.1.2.
