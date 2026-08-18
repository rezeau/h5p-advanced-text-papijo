[CmdletBinding()]
param (
  [Parameter()]
  [ValidateNotNullOrEmpty()]
  [string] $H5pCliRoot = 'C:\my_first_h5p_environment'
)

$ErrorActionPreference = 'Stop'

function Get-NormalizedPath {
  param (
    [Parameter(Mandatory = $true)]
    [string] $Path
  )

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  $pathRoot = [System.IO.Path]::GetPathRoot($fullPath)
  while ($fullPath.Length -gt $pathRoot.Length -and
      ($fullPath.EndsWith('\') -or $fullPath.EndsWith('/'))) {
    $fullPath = $fullPath.Substring(0, $fullPath.Length - 1)
  }
  return $fullPath
}

function Confirm-LibraryManifest {
  param (
    [Parameter(Mandatory = $true)]
    [string] $ManifestPath,

    [Parameter(Mandatory = $true)]
    [string] $ExpectedMachineName,

    [Parameter(Mandatory = $true)]
    [int] $ExpectedMajorVersion,

    [Parameter(Mandatory = $true)]
    [int] $ExpectedMinorVersion
  )

  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
    throw "Required H5P manifest not found: $ManifestPath"
  }

  try {
    $manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
  }
  catch {
    throw "Unable to read H5P manifest '$ManifestPath': $($_.Exception.Message)"
  }

  if ($manifest.machineName -ne $ExpectedMachineName) {
    throw "Manifest '$ManifestPath' has machineName '$($manifest.machineName)'; expected '$ExpectedMachineName'."
  }
  if ([int] $manifest.majorVersion -ne $ExpectedMajorVersion -or
      [int] $manifest.minorVersion -ne $ExpectedMinorVersion) {
    throw "Manifest '$ManifestPath' has version $($manifest.majorVersion).$($manifest.minorVersion); expected $ExpectedMajorVersion.$ExpectedMinorVersion."
  }

  Write-Output (
    "Validated {0} {1}.{2}.{3}: {4}" -f
    $manifest.machineName,
    $manifest.majorVersion,
    $manifest.minorVersion,
    $manifest.patchVersion,
    $ManifestPath
  )
}

function Ensure-DevelopmentJunction {
  param (
    [Parameter(Mandatory = $true)]
    [string] $JunctionPath,

    [Parameter(Mandatory = $true)]
    [string] $TargetPath
  )

  $existingItem = Get-Item -Force -LiteralPath $JunctionPath -ErrorAction SilentlyContinue
  if ($null -ne $existingItem) {
    if ($existingItem.LinkType -ne 'Junction') {
      throw "Refusing to replace existing non-junction item: $JunctionPath"
    }

    $targets = @($existingItem.Target)
    if ($targets.Count -ne 1 -or [string]::IsNullOrWhiteSpace($targets[0])) {
      throw "Unable to determine the existing junction target: $JunctionPath"
    }

    $actualTarget = Get-NormalizedPath -Path $targets[0]
    $expectedTarget = Get-NormalizedPath -Path $TargetPath
    if (-not [string]::Equals(
      $actualTarget,
      $expectedTarget,
      [System.StringComparison]::OrdinalIgnoreCase
    )) {
      throw "Refusing to replace junction '$JunctionPath'; it points to '$actualTarget', not '$expectedTarget'."
    }

    Write-Output "Junction already correct: $JunctionPath -> $expectedTarget"
    return
  }

  New-Item -ItemType Junction -Path $JunctionPath -Target $TargetPath |
    Out-Null
  Write-Output "Created junction: $JunctionPath -> $TargetPath"
}

$repositoryRoot = Get-NormalizedPath -Path (
  Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')
)
$editorRoot = Join-Path $repositoryRoot 'editor'
$runtimeManifest = Join-Path $repositoryRoot 'library.json'
$editorManifest = Join-Path $editorRoot 'library.json'

Write-Output "Repository root: $repositoryRoot"
Confirm-LibraryManifest `
  -ManifestPath $runtimeManifest `
  -ExpectedMachineName 'H5P.AdvancedTextPapiJo' `
  -ExpectedMajorVersion 1 `
  -ExpectedMinorVersion 1
Confirm-LibraryManifest `
  -ManifestPath $editorManifest `
  -ExpectedMachineName 'H5PEditor.AdvancedTextPapiJoTooltip' `
  -ExpectedMajorVersion 1 `
  -ExpectedMinorVersion 0

$normalizedCliRoot = Get-NormalizedPath -Path $H5pCliRoot
$cliRootItem = Get-Item -Force -LiteralPath $normalizedCliRoot -ErrorAction SilentlyContinue
if ($null -eq $cliRootItem -or -not $cliRootItem.PSIsContainer) {
  throw "H5P CLI environment root is not an existing directory: $normalizedCliRoot"
}

$librariesRoot = Join-Path $normalizedCliRoot 'libraries'
$librariesItem = Get-Item -Force -LiteralPath $librariesRoot -ErrorAction SilentlyContinue
if ($null -eq $librariesItem) {
  New-Item -ItemType Directory -Path $librariesRoot | Out-Null
  Write-Output "Created libraries directory: $librariesRoot"
}
elseif (-not $librariesItem.PSIsContainer) {
  throw "H5P libraries path exists but is not a directory: $librariesRoot"
}
else {
  Write-Output "Libraries directory exists: $librariesRoot"
}

Ensure-DevelopmentJunction `
  -JunctionPath (Join-Path $librariesRoot 'H5P.AdvancedTextPapiJo-1.1') `
  -TargetPath $repositoryRoot
Ensure-DevelopmentJunction `
  -JunctionPath (Join-Path $librariesRoot 'H5PEditor.AdvancedTextPapiJoTooltip-1.0') `
  -TargetPath $editorRoot

Write-Output 'Development junction setup complete.'
