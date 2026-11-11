<#
.SYNOPSIS
  Builds, signs, verifies and (with -Publish) releases the Windows installer.

.DESCRIPTION
  Run from a clean, up-to-date main whose version is already bumped. Without
  -Publish it stops after signing and verifying, so nothing leaves the machine.
  The installer is signed with the self-signed code-signing certificate whose
  subject is -Subject, found in the current user's certificate store, and
  timestamped so the signature outlives the certificate.

  One-time setup, if no such certificate exists yet:
    New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Strata" `
      -CertStoreLocation Cert:\CurrentUser\My -KeyExportPolicy Exportable `
      -NotAfter (Get-Date).AddYears(3)

.EXAMPLE
  pwsh scripts/release-windows.ps1              # build, sign, verify
  pwsh scripts/release-windows.ps1 -Publish     # ... then create the GitHub release
#>
[CmdletBinding()]
param(
  [switch]$Publish,
  [string]$Subject = 'CN=Strata',
  [string]$TimestampUrl = 'http://timestamp.digicert.com',
  [string]$Notes = ''
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Fail($message) { Write-Error $message; exit 1 }

# A release is built from main exactly as published, so nothing local leaks in.
if ((git branch --show-current) -ne 'main') { Fail 'Switch to main first.' }
git fetch --quiet
if (git status --porcelain --untracked-files=no) { Fail 'The working tree has uncommitted changes.' }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) { Fail 'main is not up to date with origin/main (git pull).' }

$config = Get-Content apps/desktop/src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
$version = $config.version
$tag = "v$version"
if (git tag --list $tag) { Fail "Tag $tag already exists. Bump the version first." }

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Where-Object { $_.Subject -eq $Subject -and $_.NotAfter -gt (Get-Date) } |
  Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) { Fail "No valid code-signing certificate with subject '$Subject' in Cert:\CurrentUser\My." }

$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter signtool.exe -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -like '*\x64\*' } | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { Fail 'signtool.exe not found (install the Windows SDK).' }

Write-Host "Building $tag"
pnpm install --frozen-lockfile; if ($LASTEXITCODE) { Fail 'pnpm install failed.' }
pnpm --filter '@research-notebook/desktop' tauri build; if ($LASTEXITCODE) { Fail 'tauri build failed.' }

$installer = "apps/desktop/src-tauri/target/release/bundle/nsis/Strata_${version}_x64-setup.exe"
if (-not (Test-Path $installer)) { Fail "Expected installer not found: $installer" }

Write-Host "Signing with $($cert.Thumbprint)"
& $signtool.FullName sign /sha1 $cert.Thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $installer
if ($LASTEXITCODE) { Fail 'signtool failed.' }

# The root is untrusted on purpose (self-signed), so check who signed it and that it is timestamped.
$sig = Get-AuthenticodeSignature $installer
if ($sig.SignerCertificate.Thumbprint -ne $cert.Thumbprint) { Fail 'The installer is not signed by the expected certificate.' }
if (-not $sig.TimeStamperCertificate) { Fail 'The signature has no timestamp.' }

$out = Join-Path $root 'release-out'
New-Item -ItemType Directory -Force $out | Out-Null
Export-Certificate -Cert $cert -FilePath (Join-Path $out 'strata-selfsigned.cer') | Out-Null
Copy-Item $installer $out -Force

Push-Location extensions/vscode
pnpm build; if ($LASTEXITCODE) { Pop-Location; Fail 'extension build failed.' }
npx --yes '@vscode/vsce' package --no-dependencies --skip-license --allow-missing-repository -o (Join-Path $out 'research-notebook.vsix')
if ($LASTEXITCODE) { Pop-Location; Fail 'vsce package failed.' }
Pop-Location

Write-Host "Signed and verified. Files are in $out"
if (-not $Publish) { Write-Host 'Re-run with -Publish to create the GitHub release.'; exit 0 }

$body = if ($Notes) { $Notes } else { "Strata $version. Self-signed: import strata-selfsigned.cer into Trusted Root and Trusted Publishers, or accept the SmartScreen warning. Install the VS Code extension with: code --install-extension research-notebook.vsix" }
gh release create $tag --target main --title "Strata $version" --notes $body `
  (Join-Path $out (Split-Path $installer -Leaf)) (Join-Path $out 'strata-selfsigned.cer') (Join-Path $out 'research-notebook.vsix')
