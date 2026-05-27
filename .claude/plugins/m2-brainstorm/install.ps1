param(
  [string]$Version = "latest"
)

$ErrorActionPreference = "Stop"
$InstallDir = if ($Env:M2_BRAINSTORM_HOME) { $Env:M2_BRAINSTORM_HOME } else { "$Env:USERPROFILE\.config\m2-brainstorm" }
$BinDir = Join-Path $InstallDir "bin"
$SrcDir = Join-Path $InstallDir "src"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$Arch = (Get-CimInstance Win32_Processor).Architecture
# Architecture 9 = x64; 12 = ARM64 (not yet a Deno target).
$Target = if ($Arch -eq 9) { "x86_64-pc-windows-msvc" } else { "" }

$GhOwner = if ($Env:GH_OWNER) { $Env:GH_OWNER } else { "kellenff" }
$GhRepo = if ($Env:GH_REPO) { $Env:GH_REPO } else { "m2-deep-research" }
$ReleaseUrl = if ($Version -eq "latest") {
  "https://github.com/$GhOwner/$GhRepo/releases/latest/download"
} else {
  "https://github.com/$GhOwner/$GhRepo/releases/download/$Version"
}

if ($Target) {
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-brainstorm-$Target.exe" -OutFile (Join-Path $BinDir "m2-brainstorm.exe")
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-research-$Target.exe"   -OutFile (Join-Path $BinDir "m2-research.exe")
  Write-Host "Installed pre-compiled binaries for $Target to $BinDir"
} else {
  if (-not (Get-Command deno -ErrorAction SilentlyContinue)) {
    Write-Error @"
No pre-compiled binary available for this platform, and 'deno' is not on PATH.

Options:
  1. Install Deno: https://docs.deno.com/runtime/manual/getting_started/installation
  2. File a request: https://github.com/$GhOwner/$GhRepo/issues
"@
    exit 1
  }
  New-Item -ItemType Directory -Force -Path $SrcDir | Out-Null
  $Tar = Join-Path $Env:TEMP "m2-brainstorm-source.tar.gz"
  Invoke-WebRequest -Uri "$ReleaseUrl/m2-brainstorm-source.tar.gz" -OutFile $Tar
  tar -xzf $Tar -C $SrcDir
  $BrainstormCmd = "@echo off`r`ndeno run --allow-net --allow-env --allow-read --allow-write --allow-run `"$SrcDir\brainstorm.ts`" %*"
  $ResearchCmd   = "@echo off`r`ndeno run --allow-net --allow-env --allow-read --allow-write --allow-run `"$SrcDir\research.ts`" %*"
  Set-Content -Path (Join-Path $BinDir "m2-brainstorm.cmd") -Value $BrainstormCmd
  Set-Content -Path (Join-Path $BinDir "m2-research.cmd") -Value $ResearchCmd
  Write-Host "Installed source + deno-run wrappers to $BinDir"
}
