# AdvancedTextPapiJo 1.3.0 local release-preparation audit

Audit date: 2026-10-10 (Europe/Paris). This record belongs to the local release-prep
commit. No final release library package, tag, push or publication is authorized.

## Exact preflight

Repository: `C:\Users\josep\OneDrive\Documents\CODEX\papi-jo-h5p-advancedtext`.
Branch: `master`. HEAD: `20cfd5a9482063aca2139663d48b60b89487fc01`.
Origin/master: `855c476b9f123bbaa6080e7c2c15852ea9a9b42f`.
Ahead/behind: **8/0**. Index empty. Exactly the expected nine modified and three
untracked release-prep files were present; no unexpected changes.

All eight original feature commits were verified in order and must remain intact:

| Commit | Change |
| --- | --- |
| 8ed270711bbcb9aecee003ddf0c085e405a1727c | Managed inline images |
| 9a6363d6abf1abfc3e5bee5875064087da070207 | Wrapping controls |
| 050c12227c51e9a080d3228f1c6fd51d0d7e3d82 | Replacement |
| a8ef9aa9ea9603ad41028ef19d715930e001bad0 | HTTP/HTTPS image links |
| ca50d5c66bc97ed5f2465582f7f24f1c3bc5bad9 | Percentage resizing |
| 7d0c5f5e8fbfceacbed350e8b3010e7e8ee92548 | Paragraph actions |
| def0989fcd467821f7365092a482aae7c3a695c4 | Occurrence-specific captions |
| 20cfd5a9482063aca2139663d48b60b89487fc01 | Paragraph-control positioning |

## Metadata and release contract

Runtime: **H5P.AdvancedTextPapiJo 1.3.0**.
Editor: **H5PEditor.AdvancedTextPapiJoTooltip 1.2.0**.
Runtime editor dependency is exactly
`[{"machineName":"H5PEditor.AdvancedTextPapiJoTooltip","majorVersion":1,"minorVersion":2}]`.

The accepted implementation includes the optional managed `inlineImages[]`
definitions (`id,image,alt`), occurrence markers, required ALT and contextual ALT
editing, Inline / Wrap left / Wrap right, replacement, absolute HTTP/HTTPS image
links, percentage resizing and Reset size, paragraph Before/After/isolation
actions, occurrence-specific plain-text captions, runtime rendering, independent
runtime/editor assets and compatibility with the existing tooltip store.

Intentional limitations remain:

- No raw unmanaged `img` support.
- No image-link target/new-window option.
- Add Caption only for an eligible image-only ordinary root paragraph; no direct
  Add into mixed text or deferred structural contexts.
- No Timeline-specific AdvancedText integration.
- Definitions are retained when an occurrence is deleted or replaced.
- CLI content exports with copied foreign image references remain non-self-contained
  until localization; the established test continues to assert that limitation.

No production implementation or semantics changes are part of this release-prep
diff. Asset declarations and EN/FR keys are synchronized. Existing phase reports,
changelog entries and compatibility fixtures retain their historical versions.

## Actual public downstream candidates

| Repository | Public version | Actual HEAD | Preflight state |
| --- | --- | --- | --- |
| papi-jo-h5p-accordion | 1.2.0 | ae5e9266d93b8bb18fd3eb419bcf3fdcf9e9bb46 | Candidate uncommitted; 0 ahead/0 behind |
| papi-jo-h5p-column | 1.21.0 | dd1f5596063127e493494102606d97f0065ef1bf | Clean; 2 ahead/0 behind |
| papi-jo-h5p-interactivebook | 1.17.0 | b2aa19afde83e2af8ca419efcf6fcbc7c2bd98b3 | Clean; 2 ahead/0 behind |

Accordion semantics targets AdvancedText 1.3. Column semantics targets both
AdvancedText 1.3 and Accordion 1.2. Book semantics and its preloaded dependency
target Column 1.21. Broken Accordion 1.1.7 and private recovery 1.1.8 are excluded
from the public release contract.

Accordion's existing changes are README.md, library.json, semantics.json,
test/accordion-characterization.test.js and the untracked
test-support/installed-h5p-probe.php, test-support/installed-h5p.js,
test/accordion-upgrade-path.test.js. These belong to its separate preparation.
No downstream checkout is edited by this task.

## Upgrade and complete-chain compatibility

No `upgrades.js` is required or added. The installed H5P
`ContentUpgradeProcess` and version helper are executed directly. With no upgrade
script, compatible parameters pass through. Four representative 1.2 cases
(plain text, formatting/links, formatted tooltips, tooltip images) preserve
parameters and metadata without synthesizing `inlineImages`.

The Node upgrade test reads current repository manifests and semantics and checks
standalone, Accordion 1.1 -> 1.2, Column 1.20 -> 1.21 and Book 1.16 -> 1.17,
including nested Accordion descriptors inside Column and Book. Text descriptors
advance to 1.3, Accordion to 1.2 and Book's Column to 1.21.

The PHP candidate matrix executes installed `H5PContentValidator` and `H5PCore`
with filesystem-backed dependency lookup. Five cases (the four legacy cases plus
a managed image/caption) run through six paths: standalone, Accordion, direct
Column, direct Book/Column, Column/Accordion and Book/Column/Accordion. It checks
non-null children, exact HTML and semantic-store preservation, removal of unknown
properties, onclick and unmanaged images, and exact runtime/editor dependencies.
Manifests are checked as read; no version is substituted.

The established PHP lifecycle test initially failed because the live CLI no
longer contains its historical Column 1.20 semantics path. The user explicitly
approved one additional test-support file, `tests/inline-images-php-copy.test.php`,
in the commit. Its descriptors and semantics loader now use the actual public
candidate repositories, with exact manifest checks. Every original file-byte,
copy, save, retention, filtering and export/reimport assertion remains intact.

## Verification totals

| Check | Final result |
| --- | --- |
| Complete Node suite | PASS 80/80; 0 failures, skipped, cancelled or todo |
| CLI CKEditor browser suite | PASS 15/15 routes, 21/21 runs; process exit 0 |
| WordPress CKEditor browser suite | PASS 15/15 routes, 21/21 runs; process exit 0 |
| CLI and WordPress PHP filtering | PASS 7/7 groups per core; 14/14 total |
| CLI and WordPress PHP lifecycle | PASS 25/25 content export/reimport cases plus saved Column-child -> Accordion copy per core; 50 exports and 2 saved-child checks total |
| Actual-candidate PHP matrix | PASS 30/30 per core; 60/60 total |
| Installed-engine upgrade scenarios | PASS 24/24 paths: 4 cases x 6 paths, included in Node suite |
| Live CLI rendering | PASS 80/80 cases; process exit 0 |
| JavaScript syntax | PASS 42/42 |
| PHP syntax | PASS 3/3 |
| Tracked JSON validation | PASS 8/8 |
| Metadata and declared asset existence | PASS runtime 1.3.0/editor 1.2.0 and exact dependency |
| Editor EN/FR synchronization | PASS 58 identical keys; recursive French semantics coverage in Node |
| Canonical source synchronization | PASS sanitizer and inline-image copies |
| PowerShell syntax | PASS 1/1 script |
| Development junctions | PASS creation and idempotence in isolated temporary root; junctions removed |
| git diff --check | PASS |

Initial sandbox runs failed on temporary-file renames (Node/PHP), Edge startup,
and temporary junction creation. Re-execution with the necessary filesystem/
process access resolved those environment restrictions; no assertions were
weakened. Content-only archives created by lifecycle tests are disposable test
fixtures and are cleaned up; no final installable release library package is built.

User-supplied real WordPress acceptance has already passed standalone Text,
Accordion/Text, Column with direct/nested children and the complete Book chain.
This local audit does not claim a new WordPress authoring/save acceptance run.

Browser host identity: installed CLI CKEditor 43.3.0 with HTML widget SHA-256
`df502fda21def7831ffe6cfa3cd3c6386d352bd1c5b34db02761639ee5e87e43`;
installed WordPress CKEditor 43.0.0 with HTML widget SHA-256
`6fe1a7854f4624fecabcbb32a3e8cc79ec8ff21ff339a3fa20a0e4cda877d3e9`.
Harnesses serve production source directly from this checkout on loopback and
retain all established assertions, routes and 1280/160/320/480px image widths.
All iframe proofs show zero editor navigation attempts, prevented editor defaults
and successful native runtime image-link navigation in the editor frame, with and
without captions, at every width on both builds.

## Commit boundary and final checks

The approved commit contains exactly these 13 files:

- library.json
- editor/library.json
- README.md
- CHANGELOG.md
- scripts/setup-dev-junctions.ps1
- tests/README.md
- tests/phase1a-editor-widget.test.js
- tests/inline-images-paragraph.test.js
- tests/inline-images-resize.test.js
- tests/release-candidate-upgrade.test.js
- tests/release-candidate-parents.test.php
- tests/RELEASE-CANDIDATE-1.3.0.md
- tests/inline-images-php-copy.test.php (explicit additional approval)

Scope is versions, metadata, documentation, tests and release support. The local
commit message is `chore: prepare AdvancedTextPapiJo 1.3.0 release`.
Post-commit verification must confirm a clean worktree/index, master ahead 9/behind
0, the unchanged origin SHA and the eight original commits as exact ancestors.

All 153 downstream tracked/untracked candidate files were verified byte-for-byte
unchanged (Accordion 16, Column 74, Book 63); HEADs and Git states also match
their preflight snapshots.
WordPress files and database are untouched. No push, tag, publication, final .h5p
release package or downstream commit is performed.
