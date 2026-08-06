<#
.SYNOPSIS
    Builds the Windows app and packages Muffin_Setup.exe.

.DESCRIPTION
    The build command lived nowhere in this repository, so it had to be guessed,
    and the obvious guess is wrong in a way that only shows up on somebody
    else's machine:

        dotnet publish -c Release -r win-x64 --self-contained false
            373 files, 162 MB published, 41 MB installer
            installs fine, then fails to launch without the .NET 10 runtime

        dotnet publish -c Release -r win-x64 --self-contained true
            639 files, 310 MB published, 79.4 MB installer
            matches the published v1.12.5 asset to within 0.1%

    The csproj pins WindowsAppSDKSelfContained, so the App SDK is bundled either
    way. It says nothing about .NET itself, which is what the flag below decides.
    The extra 38 MB is the runtime, and it is not optional for anyone who has
    not installed .NET 10 by hand.

.PARAMETER SkipPublish
    Package whatever is already in the publish folder. For iterating on the
    installer script without waiting for a rebuild.

.EXAMPLE
    pwsh scripts/build-windows.ps1
#>
[CmdletBinding()]
param(
    [string] $Runtime = "win-x64",
    [switch] $SkipPublish
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root "windows_app"
$publish = Join-Path $app "bin\Release\net10.0-windows10.0.26100.0\$Runtime\publish"

# The version in AppStrings.cs and the one in muffin_installer.iss have drifted
# apart before, and the updater compares them arithmetically, so a mismatch
# silently means nobody is ever offered anything.
Write-Host "== version ==" -ForegroundColor Cyan
& python (Join-Path $PSScriptRoot "check-version.py")
if ($LASTEXITCODE -ne 0) { throw "version check failed" }

if (-not $SkipPublish) {
    Write-Host "`n== publish ==" -ForegroundColor Cyan
    # --self-contained true is the whole point of this script. See the notes above.
    & dotnet publish $app -c Release -r $Runtime --self-contained true --nologo
    if ($LASTEXITCODE -ne 0) { throw "publish failed" }
}

if (-not (Test-Path (Join-Path $publish "MuffinTranscriber.exe"))) {
    throw "no publish output at $publish"
}

# Inno reads every published file by full path, and Windows still stops at 260
# characters. Building from a deep folder fails late, during compression, with
# "The system cannot find the path specified" and no clue which file.
$longest = (Get-ChildItem -Recurse -File $publish |
            Sort-Object { $_.FullName.Length } -Descending |
            Select-Object -First 1).FullName
if ($longest.Length -ge 250) {
    Write-Warning "Longest path is $($longest.Length) chars, near the 260 limit."
    Write-Warning "If the installer fails while compressing, build from a shorter folder."
}

$iscc = @(
    "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $iscc) {
    Write-Host "`nInno Setup 6 not found, so no installer was built." -ForegroundColor Yellow
    Write-Host "The app is complete at $publish"
    exit 0
}

Write-Host "`n== installer ==" -ForegroundColor Cyan
& $iscc "/DAppFilesDir=$publish" (Join-Path $root "muffin_installer.iss")
if ($LASTEXITCODE -ne 0) { throw "ISCC failed" }

$setup = Join-Path $root "dist\Muffin_Setup.exe"
$mb = [math]::Round((Get-Item $setup).Length / 1MB, 1)
Write-Host "`n$setup  $mb MB" -ForegroundColor Green
Write-Host "A framework-dependent build lands near 41 MB. If you see that, the"
Write-Host "runtime is missing and the app will not start on a clean machine."
