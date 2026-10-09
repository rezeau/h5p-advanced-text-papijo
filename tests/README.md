# AdvancedTextPapiJo verification

See [Paragraph actions](INLINE-IMAGES-PARAGRAPH.md) for the root-paragraph scope,
separator policy, native/external UI, keyboard path and acceptance checklist.
Its browser extension runs inside `/inline-images.html` on both native hosts.

Run all commands from the repository root in PowerShell. The browser harness
server uses the existing local H5P development environment configured in
`phase1a-harness-server.js`; this document does not introduce additional
machine-specific paths.

## Command-line checks

Run the Node tests:

```powershell
node --test tests/*.test.js
```

The semantics translation tests enforce the French-only root language directory
and recursively check French labels and positional coverage of list `field` and
group `fields` entries against the canonical English semantics.

Check every tracked JavaScript file:

```powershell
$jsFiles = @(rg --files -g '*.js')
foreach ($file in $jsFiles) {
  node --check $file
  if ($LASTEXITCODE -ne 0) { throw "JavaScript syntax failed: $file" }
}
```

Run the H5P PHP filtering test:

```powershell
php tests/phase1a-h5p-filter.test.php
```

Validate every tracked JSON file:

```powershell
$jsonFiles = @(git ls-files '*.json')
foreach ($file in $jsonFiles) {
  Get-Content -Raw -LiteralPath $file | ConvertFrom-Json | Out-Null
}
```

Verify that both independently packaged sanitizer assets match their canonical
development source:

```powershell
node scripts/sync-sanitizer.js --check
node scripts/sync-inline-images.js --check
```

The canonical implementation is
`shared/advanced-text-papijo-tooltip-sanitizer.js`. After changing that file,
regenerate both required H5P package copies with:

```powershell
node scripts/sync-sanitizer.js
```

The runtime and editor remain independently packaged; the synchronization step
does not change their existing asset paths or introduce a cross-library runtime
dependency.

Check patch formatting:

```powershell
git diff --check
```

## Real-browser harnesses

Start the existing local harness server:

```powershell
node tests/phase1a-harness-server.js
```

The command prints a loopback URL with an automatically selected port. Open
each path below on that same origin and wait for the result block to report
`"status": "PASS"`. The document element will also have
`data-test-status="pass"`.

| Path | Coverage |
| --- | --- |
| `/inline-images.html` | Native imageInline, H5P Insert image provider, contextual alt form, nonblank validation, retained alt history, undo/redo, keyboard deletion, serialization/reopen, clipboard/security, table/tooltip coexistence, runtime loading, and instance isolation |
| `/` | Phase 1A CKEditor serialization |
| `/phase1b.html` | Phase 1B creation |
| `/phase1c.html` | Phase 1C edit, remove, and localization |
| `/table-sort.html` | Table sorting, alignment, clearing before focus and after reopen, and editor styling scope |
| `/selection-validation.html` | Existing 16-case selection acceptance baseline |
| `/integration-stability.html` | Accordion and nested-editor integration |
| `/phase1d-runtime.html` | Phase 1D runtime behavior and margin-collapse convergence |
| `/phase1f-editor.html` | Phase 1F editor formatting and security |
| `/phase1f-runtime.html` | Phase 1F runtime formatting and security |
| `/r0-characterization.html` | R0 lifecycle and ownership characterization |
| `/r2-lifecycle.html` | R2 editor listener and control ownership |
| `/r3-selection-classifier.html` | R3 isolated classifier contract |
| `/r5-runtime-lifecycle.html` | R5 runtime cleanup and shared-control ownership |

Stop the server with `Ctrl+C` after all harnesses pass.

When Playwright is available through the local runtime or `NODE_PATH`, run all
harnesses automatically with the installed Edge browser:

```powershell
node tests/run-browser-harnesses.js --local
```

This starts and stops its own loopback harness server. Set
`PAPIJO_BROWSER_CHANNEL=chrome` to use an installed Chrome instead. A specific
harness can be selected with a third argument, for example
`node tests/run-browser-harnesses.js --local /inline-images.html`.

The inline-image contract is canonical in
`shared/advanced-text-papijo-inline-images.js`. After editing it, regenerate the
independently packaged runtime/editor copies with
`node scripts/sync-inline-images.js`.

See [the Phase 1 implementation report](INLINE-IMAGES-PHASE1.md) for the exact
persisted representation, verification limits, and the CLI browser checklist.
See [the Phase 2 report](INLINE-IMAGES-PHASE2.md) for native image integration,
the expanded test coverage, and the current manual acceptance checklist.

See [the managed-path copy/paste fix report](INLINE-IMAGES-COPY-PASTE.md) for the
accepted reference grammar, security boundary, clipboard tests, and separate
CLI/PHP export findings. `tests/fixtures/inline-image-copy-source.json` preserves
the captured IDs/occurrences but now references deterministic test images.
`tests/fixtures/inline-image-copy-files.json` maps its four distinct image paths
to the existing repository-owned small/large SVG fixtures. MIME and dimensions
match those SVGs; the tooltip has its own file path, separate from inline files.

`contentFixture()` in `h5p-inline-image-copy-fixtures.js` builds unique temporary
standalone/Accordion/Column/Book content folders and metadata, using the actual
installed clipboard to construct foreign references. Tests clean up those
folders after each run, including failures. No image bytes or content parameters
are read from live `content/text-01` or another manual-content folder.
The installed `C:\my_first_h5p_environment` is used only for real core/CLI/library
code and library semantics. The two copy/export tests still verify both semantic
stores, exact paths, physical file existence and identical bytes. The documented
CLI foreign-reference export limitation remains an explicit assertion.

Additional PHP save/file/export checks (isolated temporary storage only):

```powershell
php tests/inline-images-php-copy.test.php
```

Optional rendering checks against the running CLI on port 8080:

```powershell
node tests/verify-inline-images-cli.js
```

This requires Playwright through the local runtime or `NODE_PATH`. It uses
GET/HEAD requests and disposable runtime DOM, with no content saves or uploads.
Fixture image requests are fulfilled from repository SVGs after the real
`H5P.getPath()` resolves the original or repeated foreign reference; this script
also requires no live manual-content image bytes.
Set `PAPIJO_CLI_ORIGIN` to change the origin. The Node suite includes an isolated
test of the installed CLI's content export/import functions. These checks need
temporary file renames; the Windows sandbox may require an escalated run.

Phase 3 presentation coverage extends `/inline-images.html` through
`inline-images-phase3-browser.js`: native localized style controls, exact marker
conversion, combined alt/style history, repeated-reference isolation, structural
contexts, clipboard preservation, large-image responsiveness, containment and
resize lifecycle. See [the Phase 3 report/checklist](INLINE-IMAGES-PHASE3.md).
PHP filtering and copy/save/export/reimport also exercise styled occurrences;
the live CLI check verifies styled images and Accordion collapse/reopen.

To run the same harnesses against the installed WordPress CKEditor build without
changing WordPress:

```powershell
$env:PAPIJO_CKEDITOR_ROOT = 'C:\wamp64\www\wp-test\wp-content\plugins\h5p\h5p-editor-php-library\ckeditor'
node tests/run-browser-harnesses.js --local
Remove-Item Env:PAPIJO_CKEDITOR_ROOT
```

The default remains the installed CLI build. These are real-build browser tests,
not a replacement for CMS installation and manual acceptance checks.

The server also selects `h5peditor-html.js` from the same installed editor root
as that CKEditor bundle. `/harness-host.json` reports the actual file path and
SHA-256. WordPress runs therefore use its real automatic external-link setting;
CLI runs retain its manual new-tab decorator. Legacy assertions compare text
links by DOM attributes and ignore only WordPress's generated trailing empty
table guard when checking editor round trips.

Managed replacement coverage extends the same image harness through
`inline-images-replace-browser.js`. The runner retains all 14 routes and runs
the image route at actual 1280/160/480px viewports, sending real native-button
Enter keystrokes. Node adds retained A/B clipboard coverage; PHP adds four
old/new semantic save/localization/retention/export/reimport cases; live CLI
adds five replacement-result cases. See the
[replacement report and manual checklist](INLINE-IMAGES-REPLACE.md) for coverage
and limits. Historical phase reports remain unchanged.

Image Link coverage extends `/inline-images.html` through
`inline-images-link-browser.js`: native chain/form/actions/Ctrl+K, English/French
at all three widths, add/edit/unlink and combined history, shared X/Y/unlinked
occurrences, strict URL boundaries, stale targets, decorator isolation, ordinary
text links, runtime anchors and native Enter activation. Node adds six focused
tests; PHP adds four linked save/export/reimport cases; live CLI adds ten linked
cases. See [the Image Link report and manual checklist](INLINE-IMAGES-LINK.md).

Manual-acceptance regressions additionally use real mouse clicks and native
focus transitions. They require the same image-toolbar view to remain physically
visible and hit-testable beside native Link actions/forms, and exercise Save,
Cancel, Escape, Unlink, image/text transitions and ordinary Link UI. Add Tooltip
is checked against textual, collapsed, image, mixed and other object selections;
real text tooltip Add/Edit still passes. The chain helper cannot substitute a
detached button when the contextual toolbar is missing.

Both PHP checks can also use the installed WordPress core/editor without
changing the site:

```powershell
$env:PAPIJO_PHP_ROOT = 'C:\wamp64\www\wp-test\wp-content\plugins\h5p'
php tests/phase1a-h5p-filter.test.php
php tests/inline-images-php-copy.test.php
Remove-Item Env:PAPIJO_PHP_ROOT
```

The copy test uses repository-owned content/image fixtures and installed library
semantics, calls the selected actual PHP core/editor methods, and writes only
isolated temporary storage which it removes afterward. These temporary content
exports exercise the lifecycle; they are not development-library packages for installation.

Image Resize Phase 1 adds five Node tests and `inline-images-resize-browser.js`
to the native image route. The runner now tests 1280/480/320/160px on both hosts,
with real captured mouse gestures and keyboard events. PHP adds a width filter
group and four resize save/export/reimport cases; live CLI adds 20 resized cases.
All editor harnesses load the new declared local controller before its adapter.
See [the Resize report/checklist](INLINE-IMAGES-RESIZE.md) for coverage and limits.

Caption Phase B adds six Node tests, `inline-images-caption-browser.js`, and the
declared local Caption controller before the adapter. The existing image route
exercises production round trips/form/history/target safety and 852 editor plus
852 runtime layout combinations in each run. Supplemental font/handle/description
checks can run through `/inline-images.html?caption-supplement`; the complete
suite still uses all four viewports by default. PHP lifecycle adds captioned
standalone/Accordion/Column/Book and saved-child cases, CLI export/reimport keeps
its foreign-file limitation assertion, and live CLI rendering has 80 cases.
Final automated verification passed **15/15 routes and 21/21 runs** on each
installed CKEditor build. User-reported manual acceptance: **PASS** in H5P CLI
and WordPress. See [the Caption contract, verification and user-reported manual
acceptance](INLINE-IMAGES-CAPTION.md).
