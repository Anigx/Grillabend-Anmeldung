#Requires -Version 5.1
# Kleiner, ASCII-only Bootstrap fuer install-native.ps1.
# Aufruf: irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/bootstrap-native.ps1 | iex

$ErrorActionPreference = 'Stop'
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
}

$dir = Join-Path $env:LOCALAPPDATA 'Grillabend-Installer'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir 'install-native.ps1'
$url = 'https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install-native.ps1'

Write-Host 'Lade Bare-Metal-Installer ...' -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri $url -OutFile $file -ErrorAction Stop
} catch {
    Write-Host "Download fehlgeschlagen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

$argString = "-NoProfile -ExecutionPolicy Bypass -File `"$file`""
if ($args -and $args.Count -gt 0) {
    $argString += ' ' + (($args | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }) -join ' ')
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Start-Process -FilePath 'powershell.exe' -ArgumentList $argString -NoNewWindow -Wait | Out-Null
    exit 0
}

try {
    Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argString | Out-Null
} catch {
    Write-Host "UAC abgebrochen: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
