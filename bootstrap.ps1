#Requires -Version 5.1
# ASCII-only bootstrap. No BOM, so "irm ... | iex" works reliably.
$ErrorActionPreference = 'Stop'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
} catch {
}

# Per-user directory: %PUBLIC% is writable by other interactive users and must
# not hold the script that is later started elevated.
$url = 'https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.ps1'
$targetDir = if ($env:LOCALAPPDATA) {
    Join-Path $env:LOCALAPPDATA 'Grillabend-Installer'
} else {
    Join-Path $env:TEMP 'Grillabend-Installer'
}
$targetFile = Join-Path $targetDir 'install.ps1'

try {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Write-Host 'Grillabend installer: downloading ...' -ForegroundColor Cyan
    Invoke-RestMethod -Uri $url -OutFile $targetFile
} catch {
    Write-Host "Download failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$profilePath = $env:USERPROFILE
$userName = "$env:USERDOMAIN\$env:USERNAME"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$targetFile`" -OriginalProfile `"$profilePath`" -OriginalUser `"$userName`""

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

try {
    if ($isAdmin) {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -NoNewWindow -Wait -ErrorAction Stop | Out-Null
    } else {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $arguments -ErrorAction Stop | Out-Null
    }
} catch {
    Write-Host "Start failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
exit 0
