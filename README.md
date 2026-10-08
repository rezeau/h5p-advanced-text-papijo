# H5P Advanced Text Papi Jo

An enhanced version of the H5P Advanced Text library, with support for
author-defined tooltips and additional text presentation features.

Current runtime release: `H5P.AdvancedTextPapiJo 1.2.6`. The companion tooltip
editor remains `H5PEditor.AdvancedTextPapiJoTooltip 1.1.2`.

Tooltips can be created, edited, and removed directly in the H5P editor.
Tooltip text supports a restricted set of inline formatting elements: `<em>`,
`<strong>`, `<sup>`, `<sub>`, `<s>`, and `<br>`.

## Languages

AdvancedTextPapiJo supports English through the canonical strings in
`semantics.json` and French through `language/fr.json`. The French translation
must cover every semantics entry, including nested list and group fields.
The separate tooltip editor retains its English and French `libraryStrings`
under `editor/language/`.

## Managed tooltip image development notes

Managed inline-image Phase 1 development is documented in
[the implementation report and manual checklist](tests/INLINE-IMAGES-PHASE1.md).
It uses an independent optional `inlineImages` semantic store and ID-only span
markers. Definitions are retained conservatively through deletion and undo.

Phase 2 adds native CKEditor inline-image editing, Insert image, contextual
Alternative text, and managed alt history. See [the Phase 2 report and browser
checklist](tests/INLINE-IMAGES-PHASE2.md). Storage and runtime resolution remain
unchanged; the development work is uncommitted.

Phase 3 adds native contextual Inline, Wrap left, and Wrap right controls while
keeping managed images inline-only. Presentation belongs to each HTML occurrence;
the managed definition and H5P path resolution remain unchanged. See the
[Phase 3 development report and manual checklist](tests/INLINE-IMAGES-PHASE3.md).

Managed replacement now uses the same native Insert/Replace provider and H5P
picker. It creates a retained definition for the replacement, requires fresh
ALT, and switches only the captured occurrence while preserving wrapping and
Undo/Redo. See the [replacement report and acceptance checklist](tests/INLINE-IMAGES-REPLACE.md).

Managed image links reuse native CKEditor Link UI with an image-specific chain
button and Ctrl+K. This first scope permits absolute HTTP/HTTPS URLs only. The
optional URL belongs to each occurrence, independently of shared definitions,
ALT and wrapping. Runtime creates a validated semantic anchor around the managed
image. See the [Image Link report and manual checklist](tests/INLINE-IMAGES-LINK.md).

Tooltip images are stored in the optional root `tooltipImages` semantic list.
The annotated span contains only the sanitized tooltip text and, when needed,
`data-papijo-tooltip-id`; image URLs and markup are never stored in the text
attribute. Orphaned image definitions are removed when the editor validates the
content for serialization.

CKEditor undo and redo cover the span annotation, including its tooltip image
ID. Changes made inside H5P's separate image picker (upload, replacement, and
alternative text) are not part of CKEditor's history. Definition deletion is
deliberately deferred until serialization so undoing removal of an annotation
does not immediately lose its image. Copying an annotated span within the same
content shares the referenced definition; copying it to another content does
not copy the root definition, so the destination safely behaves as a
missing-image tooltip until an image is selected there.

## H5P CLI development junctions

This Git repository contains the source for two separately installed H5P
libraries:

- `H5P.AdvancedTextPapiJo-1.1`, sourced from the repository root.
- `H5PEditor.AdvancedTextPapiJoTooltip-1.0`, sourced from `editor/`.

The editor library remains in the same repository because its CKEditor support
is developed and tested in lockstep with AdvancedTextPapiJo. H5P still resolves
it as an independent editor dependency, so the CLI development environment
needs two sibling library junctions:

```text
<H5P CLI root>\libraries\H5P.AdvancedTextPapiJo-1.1
  -> <repository root>
<H5P CLI root>\libraries\H5PEditor.AdvancedTextPapiJoTooltip-1.0
  -> <repository root>\editor
```

After installing or recreating the local H5P CLI environment, run this command
from the repository root to validate the manifests and recreate any missing
junctions:

```powershell
.\scripts\setup-dev-junctions.ps1
```

The default H5P CLI root is `C:\my_first_h5p_environment`. To use another
environment, supply it explicitly:

```powershell
.\scripts\setup-dev-junctions.ps1 -H5pCliRoot 'D:\h5p-cli-environment'
```

The script is idempotent. It leaves correct junctions unchanged and refuses to
replace an existing directory, file, symlink, or junction with a different
target.

## License

(The MIT License)

Copyright (c) 2012-2014 Joubel AS

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
