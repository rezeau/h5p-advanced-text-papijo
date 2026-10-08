# AdvancedTextPapiJo verification

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
CLI/PHP export findings. The captured source is
`tests/fixtures/inline-image-copy-source.json`; image bytes and clipboard/core
modules come from the installed `C:\my_first_h5p_environment` fixture.

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
Set `PAPIJO_CLI_ORIGIN` to change the origin. The Node suite includes an isolated
test of the installed CLI's content export/import functions. These checks need
temporary file renames; the Windows sandbox may require an escalated run.
