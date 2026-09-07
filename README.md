# H5P Advanced Text Papi Jo

An enhanced version of the H5P Advanced Text library, with support for
author-defined tooltips and additional text presentation features.

Tooltips can be created, edited, and removed directly in the H5P editor.
Tooltip text supports a restricted set of inline formatting elements: `<em>`,
`<strong>`, `<sup>`, `<sub>`, `<s>`, and `<br>`.

## Managed tooltip image development notes

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
