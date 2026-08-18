H5P Advanced Text
==========

A simple library for displaying text with advanced styling.
Useful when the editor dynamially add texts to other content.

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
