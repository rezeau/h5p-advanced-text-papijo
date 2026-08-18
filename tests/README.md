# AdvancedTextPapiJo verification

Run all commands from the repository root in PowerShell. The browser harness
server uses the existing local H5P development environment configured in
`phase1a-harness-server.js`; this document does not introduce additional
machine-specific paths.

## Command-line checks

Run the Node tests:

```powershell
node --test tests/phase1a-editor-widget.test.js tests/integration-stability.test.js tests/sanitizer-source-management.test.js
```

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
| `/` | Phase 1A CKEditor serialization |
| `/phase1b.html` | Phase 1B creation |
| `/phase1c.html` | Phase 1C edit, remove, and localization |
| `/selection-validation.html` | Existing 16-case selection acceptance baseline |
| `/integration-stability.html` | Accordion and nested-editor integration |
| `/phase1d-runtime.html` | Phase 1D runtime behavior |
| `/phase1f-editor.html` | Phase 1F editor formatting and security |
| `/phase1f-runtime.html` | Phase 1F runtime formatting and security |
| `/r0-characterization.html` | R0 lifecycle and ownership characterization |
| `/r2-lifecycle.html` | R2 editor listener and control ownership |
| `/r3-selection-classifier.html` | R3 isolated classifier contract |
| `/r5-runtime-lifecycle.html` | R5 runtime cleanup and shared-control ownership |

Stop the server with `Ctrl+C` after all harnesses pass.
