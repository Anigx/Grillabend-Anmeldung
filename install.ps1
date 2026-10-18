#Requires -Version 5.1
<#
.SYNOPSIS
    Interaktiver Installer für die Grillabend-Anmeldung unter Windows.

.DESCRIPTION
    Richtet Docker Desktop, WSL2 als Docker-Backend, das Projekt, das
    Daten-Volume, die LAN-Freigabe, den Autostart sowie Updates und eine
    vollständige Deinstallation ein. Die Oberfläche ist eine Fullscreen-TUI.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install.ps1

.EXAMPLE
    .\install.ps1 -Uninstall
    .\install.ps1 -Purge -Yes
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Purge,
    [switch]$Yes,
    [switch]$NoPause,
    [string]$Bind,
    [string]$InstallDir,
    [string]$OriginalProfile,
    [string]$OriginalUser,
    [switch]$Help,
    [switch]$Version
)

$ErrorActionPreference = 'Continue'
$script:InstallerVersion = '1.0.0'
$script:AppName = 'Grillabend-Anmeldung'
$script:ContainerName = 'grillabend'
$script:VolumeName = 'grillabend-data'
$script:ImageName = 'ghcr.io/anigx/grillabend-anmeldung:latest'
$script:HostPort = 1621
$script:RepoUrl = 'https://github.com/Anigx/Grillabend-Anmeldung.git'
$script:RepoBranch = 'main'
$script:RawUrl = 'https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.ps1'
$script:StateDir = Join-Path $env:ProgramData 'Grillabend-Installer'
$script:StateFile = Join-Path $script:StateDir 'state.json'
$script:LogDir = Join-Path $script:StateDir 'Logs'
$script:ComposeMinVersion = '2.24.4'
$script:BackupKeep = 5
$script:TaskName = 'Grillabend-Anmeldung Docker Desktop'
$script:FirewallRuleName = 'Grillabend-Anmeldung (TCP 1621)'

$script:LogFile = $null
$script:State = @{}
$script:UiInitialized = $false
$script:UiActive = $false
$script:MenuDefault = $null
$script:OriginalProfile = $null
$script:OriginalUser = $null
$script:DefaultInstallDir = $null
$script:RequestedBind = $null
$script:RequestedInstallDir = $null
$script:BindMode = 'local'

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
}

function Write-Help {
    Write-Host @'
Grillabend-Anmeldung - Installer für Windows (Docker Desktop)

Schnellstart (PowerShell):
  irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/bootstrap.ps1 | iex

Aufruf:
  .\install.ps1                       Interaktive TUI (Installieren/Aktualisieren/Entfernen)
  .\install.ps1 -Uninstall            App entfernen, Projektordner und Daten behalten
  .\install.ps1 -Purge                App, Projektordner, Backups und Daten löschen
  .\install.ps1 -Help                 Diese Hilfe anzeigen
  .\install.ps1 -Version              Installer-Version anzeigen

Optionen:
  -InstallDir PFAD    Zielverzeichnis vorbelegen (Standard: %USERPROFILE%\Grillabend-Anmeldung)
  -Bind local|lan     Host-Bindung vorbelegen (Standard: lan)
  -Yes                Sicherheitsabfragen bei -Uninstall/-Purge überspringen
  -NoPause            Nicht auf Enter warten, wenn das Skript endet

Der Installer startet sich für die Systemänderungen per UAC neu. WSL wird
ausschließlich als von Docker Desktop benötigtes Backend aktiviert; es wird
keine Ubuntu-Distribution eingerichtet. Das fertige GHCR-Image gibt es nur
für linux/amd64.

Status: %ProgramData%\Grillabend-Installer\state.json
Logs:   %ProgramData%\Grillabend-Installer\Logs\
'@
}

if ($Help) {
    Write-Help
    exit 0
}
if ($Version) {
    Write-Host $script:InstallerVersion
    exit 0
}

$script:RequestedBind = $Bind
$script:RequestedInstallDir = $InstallDir
$script:OriginalProfile = $OriginalProfile
$script:OriginalUser = $OriginalUser

if ($script:RequestedBind) {
    $script:RequestedBind = $script:RequestedBind.ToLowerInvariant()
    if ($script:RequestedBind -notin @('local', 'lan')) {
        Write-Host "Ungültiger Wert für -Bind: $Bind (erlaubt: local, lan)" -ForegroundColor Red
        exit 2
    }
}

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$scriptPath = $PSCommandPath
$profilePath = if ($script:OriginalProfile) { $script:OriginalProfile } else { $env:USERPROFILE }
$userName = if ($script:OriginalUser) { $script:OriginalUser } else { "$env:USERDOMAIN\$env:USERNAME" }
$pipedMode = -not $scriptPath

if ($pipedMode) {
    $bootstrapDir = if ($env:PUBLIC) { Join-Path $env:PUBLIC 'Grillabend-Installer' } else { Join-Path $env:TEMP 'Grillabend-Installer' }
    try {
        New-Item -ItemType Directory -Force -Path $bootstrapDir -ErrorAction Stop | Out-Null
        $scriptPath = Join-Path $bootstrapDir 'install.ps1'
        Write-Host 'Installer wird geladen ...' -ForegroundColor Cyan
        Invoke-RestMethod -Uri $script:RawUrl -OutFile $scriptPath -ErrorAction Stop
    } catch {
        Write-Host "Der Installer konnte nicht geladen werden: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

$argString = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -OriginalProfile `"$profilePath`" -OriginalUser `"$userName`""
if ($script:RequestedBind) { $argString += " -Bind $($script:RequestedBind)" }
if ($script:RequestedInstallDir) { $argString += " -InstallDir `"$($script:RequestedInstallDir)`"" }
if ($Uninstall) { $argString += ' -Uninstall' }
if ($Purge) { $argString += ' -Purge' }
if ($Yes) { $argString += ' -Yes' }
if ($NoPause) { $argString += ' -NoPause' }

if ($pipedMode -and (Test-Admin)) {
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $argString -NoNewWindow -Wait -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "Der Installer konnte nicht gestartet werden: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    exit 0
}

if (-not (Test-Admin)) {
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argString | Out-Null
    } catch {
        Write-Host "Die Erhöhung über UAC wurde abgebrochen: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    exit 0
}

if (-not $script:OriginalProfile) { $script:OriginalProfile = $env:USERPROFILE }
if (-not $script:OriginalUser) { $script:OriginalUser = "$env:USERDOMAIN\$env:USERNAME" }
$script:DefaultInstallDir = Join-Path $script:OriginalProfile 'Grillabend-Anmeldung'
$script:PauseOnExit = -not $NoPause

function Write-Log {
    param([string]$Message)
    if (-not $script:LogFile) { return }
    try {
        $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
        Add-Content -LiteralPath $script:LogFile -Value $line -Encoding Unicode -ErrorAction SilentlyContinue
    } catch {
    }
}

function Throw-Fatal {
    param([string]$Message)
    Write-Log "FEHLER: $Message"
    throw $Message
}

function Initialize-StateDir {
    New-Item -ItemType Directory -Force -Path $script:StateDir -ErrorAction Stop | Out-Null
    New-Item -ItemType Directory -Force -Path $script:LogDir -ErrorAction Stop | Out-Null
    $script:LogFile = Join-Path $script:LogDir ('install-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Set-Content -LiteralPath $script:LogFile -Value '' -Encoding Unicode -ErrorAction Stop
    Write-Log "Installer $script:InstallerVersion gestartet."
}

function Read-State {
    $script:State = @{}
    if (-not (Test-Path -LiteralPath $script:StateFile)) { return }
    try {
        $json = Get-Content -LiteralPath $script:StateFile -Raw -Encoding UTF8 -ErrorAction Stop
        if (-not $json) { return }
        $obj = $json | ConvertFrom-Json -ErrorAction Stop
        foreach ($prop in $obj.PSObject.Properties) {
            $script:State[$prop.Name] = $prop.Value
        }
    } catch {
        Write-Log "Statusdatei konnte nicht gelesen werden: $($_.Exception.Message)"
        $script:State = @{}
    }
}

function Save-State {
    if (-not (Test-Path -LiteralPath $script:StateDir)) { return }
    $script:State['version'] = $script:InstallerVersion
    $script:State['updated_at'] = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    try {
        $tmp = "${script:StateFile}.tmp"
        ($script:State | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $tmp -Encoding UTF8 -ErrorAction Stop
        Move-Item -LiteralPath $tmp -Destination $script:StateFile -Force -ErrorAction Stop
    } catch {
        Write-Log "Statusdatei konnte nicht gespeichert werden: $($_.Exception.Message)"
    }
}

function Set-State {
    param([string]$Key, $Value)
    $script:State[$Key] = $Value
    Save-State
}

function Get-State {
    param([string]$Key)
    if ($script:State.ContainsKey($Key)) { return $script:State[$Key] }
    return $null
}

function Clear-State {
    $script:State = @{}
    Remove-Item -LiteralPath $script:StateFile -Force -ErrorAction SilentlyContinue
}

function Test-NativeCommand {
    param([string]$Name)
    return ($null -ne (Get-Command $Name -ErrorAction SilentlyContinue))
}

function Invoke-Capture {
    param([scriptblock]$Action)
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $out = @()
    $rc = 0
    try {
        $global:LASTEXITCODE = 0
        $out = & $Action 2>&1
        if ($null -ne $LASTEXITCODE) { $rc = [int]$LASTEXITCODE }
    } catch {
        $out = @($_.Exception.Message)
        $rc = 1
    } finally {
        $ErrorActionPreference = $old
    }
    $text = (($out | Out-String) -replace "`r`n", "`n").Trim()
    Write-Log "Prüfung: $text"
    return [pscustomobject]@{ Output = $text; Code = $rc }
}

function Refresh-Path {
    $parts = @()
    $parts += [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $parts += [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts += $env:Path
    $parts += 'C:\Program Files\Git\cmd'
    $parts += 'C:\Program Files\Docker\Docker\resources\bin'
    $script:PathParts = ($parts | Where-Object { $_ }) -join ';'
    $env:Path = $script:PathParts
}

function Initialize-Tui {
    if ($Host.Name -ne 'ConsoleHost') {
        throw 'Die TUI benötigt die Windows-Konsole (powershell.exe), nicht ISE oder eine Pipeline.'
    }
    if ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected) {
        throw 'Die TUI benötigt ein interaktives Terminal ohne umgeleitete Ein-/Ausgabe.'
    }
    if ([Console]::WindowWidth -lt 60 -or [Console]::WindowHeight -lt 20) {
        throw 'Das Konsolenfenster ist zu klein. Bitte mindestens 60x20 Zeichen einstellen.'
    }
    try { & chcp.com 65001 > $null } catch { }
    try {
        [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
        [Console]::CursorVisible = $false
    } catch {
    }
    $script:UiInitialized = $true
    $script:UiActive = $true
    Clear-Host
}

function Restore-Tui {
    if ($script:UiInitialized) {
        try { [Console]::CursorVisible = $true } catch { }
    }
    $script:UiActive = $false
}

function Suspend-Tui {
    try { [Console]::CursorVisible = $true } catch { }
    $script:UiActive = $false
}

function Resume-Tui {
    try { [Console]::CursorVisible = $false } catch { }
    $script:UiActive = $true
    Clear-Host
}

function Write-Header {
    $width = [Math]::Max(50, [Console]::WindowWidth - 2)
    $border = '+' + ('-' * $width) + '+'
    $title = " $script:AppName - Installer $script:InstallerVersion "
    $pad = [Math]::Max(0, $width - $title.Length)
    Write-Host $border -ForegroundColor Magenta
    Write-Host ('|' + $title + (' ' * $pad) + '|') -ForegroundColor Cyan
    Write-Host $border -ForegroundColor Magenta
}

function Write-Footer {
    param([string]$Text)
    try {
        $width = [Console]::WindowWidth
        $row = [Math]::Max(0, [Console]::WindowHeight - 1)
        [Console]::SetCursorPosition(0, $row)
        Write-Host (' ' * $width) -NoNewline
        [Console]::SetCursorPosition(0, $row)
        if ($Text.Length -gt $width) { $Text = $Text.Substring(0, $width) }
        Write-Host $Text -ForegroundColor DarkGray -NoNewline
    } catch {
    }
}

function Write-Wrapped {
    param([string]$Text, [int]$Width)
    if ($Width -lt 20) { $Width = 20 }
    foreach ($raw in ($Text -split "`r?`n")) {
        $line = ''
        $words = $raw -split '\s+'
        foreach ($word in $words) {
            if (-not $word) { continue }
            if ($line.Length -eq 0) {
                $line = $word
            } elseif (($line.Length + 1 + $word.Length) -le $Width) {
                $line = $line + ' ' + $word
            } else {
                Write-Host ('  ' + $line)
                $line = $word
            }
        }
        if ($line.Length -gt 0) {
            Write-Host ('  ' + $line)
        } else {
            Write-Host ''
        }
    }
}

function Show-Message {
    param([string]$Title, [string]$Body)
    Clear-Host
    Write-Header
    Write-Host ''
    Write-Host (' ' + $Title) -ForegroundColor Cyan
    Write-Host ''
    Write-Wrapped $Body ([Math]::Max(20, [Console]::WindowWidth - 4))
    Write-Host ''
    Write-Footer 'Enter, Leertaste oder q zum Fortfahren'
    do {
        $key = [Console]::ReadKey($true)
    } until ($key.Key -eq [ConsoleKey]::Enter -or $key.Key -eq [ConsoleKey]::Spacebar -or $key.KeyChar -eq 'q' -or $key.KeyChar -eq 'Q')
}

function Show-Pause {
    param([string]$Text = 'Enter zum Fortfahren')
    Suspend-Tui
    try {
        Write-Host ''
        Read-Host $Text | Out-Null
    } finally {
        Resume-Tui
    }
}

function Show-Input {
    param([string]$Title, [string]$Prompt, [string]$Default = '')
    Suspend-Tui
    try {
        Clear-Host
        Write-Header
        Write-Host ''
        Write-Host (' ' + $Title) -ForegroundColor Cyan
        Write-Host ''
        Write-Host (' ' + $Prompt)
        if ($Default) { Write-Host (' [Standard: ' + $Default + ']') -ForegroundColor DarkGray }
        Write-Host ''
        $value = Read-Host '>'
    } finally {
        Resume-Tui
    }
    $value = ([string]$value).Trim()
    if (-not $value) { $value = $Default }
    return $value
}

function Show-Menu {
    param([string]$Title, [string]$Question, [string[]]$Items)
    if ($Items.Count -eq 0) { return -1 }
    $selected = 0
    if ($null -ne $script:MenuDefault) { $selected = [int]$script:MenuDefault }
    $script:MenuDefault = $null
    if ($selected -lt 0 -or $selected -ge $Items.Count) { $selected = 0 }

    while ($true) {
        Clear-Host
        Write-Header
        Write-Host ''
        Write-Host (' ' + $Title) -ForegroundColor Cyan
        Write-Host ''
        if ($Question) {
            Write-Wrapped $Question ([Math]::Max(20, [Console]::WindowWidth - 4))
            Write-Host ''
        }
        for ($i = 0; $i -lt $Items.Count; $i++) {
            $parts = $Items[$i] -split '::', 2
            $label = $parts[0]
            if ($i -eq $selected) {
                Write-Host ('  > ' + $label) -ForegroundColor Black -BackgroundColor Magenta
            } else {
                Write-Host ('    ' + $label)
            }
        }
        $descParts = $Items[$selected] -split '::', 2
        if ($descParts.Count -gt 1 -and $descParts[1]) {
            Write-Host ''
            Write-Wrapped $descParts[1] ([Math]::Max(20, [Console]::WindowWidth - 4))
        }
        Write-Host ''
        Write-Footer 'Pfeiltasten oder j/k wählen - Enter bestätigen - q beenden'

        $key = [Console]::ReadKey($true)
        if ($key.Key -eq [ConsoleKey]::UpArrow -or $key.KeyChar -eq 'k' -or $key.KeyChar -eq 'K') {
            $selected = ($selected - 1 + $Items.Count) % $Items.Count
        } elseif ($key.Key -eq [ConsoleKey]::DownArrow -or $key.KeyChar -eq 'j' -or $key.KeyChar -eq 'J') {
            $selected = ($selected + 1) % $Items.Count
        } elseif ($key.Key -eq [ConsoleKey]::Enter) {
            return $selected
        } elseif ($key.Key -eq [ConsoleKey]::Escape -or $key.KeyChar -eq 'q' -or $key.KeyChar -eq 'Q') {
            return -1
        } elseif ($key.KeyChar -match '^[1-9]$') {
            $number = [int]([string]$key.KeyChar)
            if (($number - 1) -lt $Items.Count) { $selected = $number - 1 }
        }
    }
}

function Show-Confirm {
    param([string]$Title, [string]$Question, [bool]$Default = $true)
    $script:MenuDefault = if ($Default) { 0 } else { 1 }
    $result = Show-Menu $Title $Question @('Ja::Bestätigen', 'Nein::Abbrechen')
    $script:MenuDefault = $null
    return ($result -eq 0)
}

function Show-TypedConfirm {
    param([string]$Title, [string]$Question, [string]$Expected)
    while ($true) {
        $answer = Show-Input $Title "$Question (tippe $Expected)" ''
        if (-not $answer) { return $false }
        if ($answer.ToUpperInvariant() -eq $Expected.ToUpperInvariant()) { return $true }
        Show-Message 'Nicht bestätigt' "Die Eingabe stimmte nicht mit $Expected überein."
    }
}

function Invoke-External {
    param([string]$Title, [string]$CommandText, [scriptblock]$Action)
    Write-Log "Befehl: $CommandText"
    Suspend-Tui
    Clear-Host
    Write-Host "== $Title ==" -ForegroundColor Cyan
    Write-Host ''
    Write-Host ('$ ' + $CommandText) -ForegroundColor DarkGray
    Write-Host ''
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = 0
    $rc = 0
    try {
        & $Action 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Host
        if ($null -ne $LASTEXITCODE) { $rc = [int]$LASTEXITCODE }
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Log "FEHLER: $($_.Exception.Message)"
        $rc = 1
    } finally {
        $ErrorActionPreference = $old
    }
    if ($rc -ne 0) {
        Write-Host ''
        Write-Host "Fehler (Exit-Code $rc)." -ForegroundColor Red
        try { Read-Host 'Enter zum Fortfahren' | Out-Null } catch { }
    }
    Resume-Tui
    return $rc
}

function Assert-Windows {
    if ($env:OS -ne 'Windows_NT') {
        Throw-Fatal 'Dieser Installer läuft nur unter Windows. Unter Linux bitte install.sh verwenden.'
    }
    $version = [Environment]::OSVersion.Version
    $build = $version.Build
    Write-Log "Windows-Build: $build"
    if ($build -lt 17763) {
        Throw-Fatal "Windows 10 Build $build ist zu alt. Benötigt wird mindestens Windows 10 22H2 (Build 19045) oder Windows 11."
    }
    if ($build -lt 19045) {
        if (-not (Show-Confirm 'Windows 10' "Build $build ist älter als 22H2. Docker Desktop und WSL2 sind dort nicht offiziell unterstützt. Trotzdem fortfahren?" $false)) {
            Throw-Fatal 'Installation auf dieser Windows-Version abgebrochen.'
        }
    } elseif ($build -lt 22000) {
        Show-Message 'Windows 10' 'Windows 10 wird mit einer Warnung unterstützt. Docker Desktop kann dort eingeschränkt sein; Windows 11 ist der empfohlene Untergrund.'
    }

    if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        Throw-Fatal 'Windows on ARM wird nicht unterstützt: Das GHCR-Image ist nur für linux/amd64 verfügbar.'
    }
    $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($cpu -and $cpu.Architecture -eq 12) {
        Throw-Fatal 'Windows on ARM wird nicht unterstützt: Das GHCR-Image ist nur für linux/amd64 verfügbar.'
    }
    if ($cpu -and $cpu.VirtualizationFirmwareEnabled -eq $false) {
        Throw-Fatal 'Die Virtualisierung ist im BIOS/UEFI deaktiviert. Bitte Intel VT-x/AMD-V aktivieren und erneut starten.'
    }
    if ($cpu -and $null -eq $cpu.VirtualizationFirmwareEnabled) {
        Write-Log 'Virtualisierung konnte nicht eindeutig geprüft werden.'
    }

    try {
        $free = (Get-PSDrive -Name C -ErrorAction Stop).Free
        if ($free -lt 2GB) {
            Throw-Fatal 'Auf Laufwerk C: sind weniger als 2 GB frei. Docker Desktop und das Image benötigen mehr Speicher.'
        }
        if ($free -lt 5GB) {
            Show-Message 'Wenig Speicherplatz' 'Auf Laufwerk C: sind weniger als 5 GB frei. Der Docker-Desktop-Download und das Image können den Platzbedarf erhöhen.'
        }
    } catch {
    }
}

function Test-RebootPending {
    $keys = @(
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending',
        'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired'
    )
    foreach ($key in $keys) {
        if (Test-Path $key) { return $true }
    }
    $pending = Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager' -Name PendingFileRenameOperations -ErrorAction SilentlyContinue
    if ($pending) { return $true }
    return $false
}

function Stop-ForReboot {
    param([string]$Reason)
    Set-State 'reboot_required' $true
    Set-State 'step' 'reboot'
    Show-Message 'Neustart erforderlich' "$Reason Bitte den Rechner neu starten und den Installer anschließend erneut ausführen. Die Einrichtung wird automatisch fortgesetzt."
    return $false
}

function Get-DockerDesktopExe {
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Docker\Docker\Docker Desktop.exe') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path $env:LOCALAPPDATA 'Docker\Docker Desktop.exe') }
    foreach ($path in $candidates) {
        if ($path -and (Test-Path -LiteralPath $path)) { return $path }
    }
    return $null
}

function Install-WingetPackage {
    param([string]$Id, [string]$Title)
    if (-not (Test-NativeCommand 'winget')) {
        Throw-Fatal "winget fehlt. Bitte den Microsoft App Installer aus dem Store installieren oder $Title manuell installieren."
    }
    $rc = Invoke-External $Title "winget install --id $Id -e --source winget --silent" {
        winget install --id $Id -e --source winget --accept-source-agreements --accept-package-agreements --silent --disable-interactivity
    }
    Refresh-Path
    return $rc
}

function Ensure-Git {
    Refresh-Path
    if (Test-NativeCommand 'git') { return }
    if (-not (Show-Confirm 'Git fehlt' 'Git ist nicht installiert. Soll es jetzt per winget installiert werden?' $true)) {
        Throw-Fatal 'Git wird zum Klonen des Projekts benötigt.'
    }
    $null = Install-WingetPackage 'Git.Git' 'Git installieren'
    Refresh-Path
    if (-not (Test-NativeCommand 'git')) {
        Throw-Fatal 'Git ist nach der Installation nicht verfügbar. Bitte Git für Windows installieren und den Installer erneut starten.'
    }
}

function Ensure-DockerDesktopInstalled {
    Refresh-Path
    $exe = Get-DockerDesktopExe
    if ($exe -and (Test-NativeCommand 'docker')) { return }
    if (-not $exe) {
        Show-Message 'Docker Desktop' 'Docker Desktop ist nicht installiert. Docker Desktop ist für Privatanwender, Bildung und kleine Unternehmen kostenlos; für größere Unternehmen gelten die Lizenzbedingungen von Docker. Bitte die Bedingungen vor der Installation prüfen.'
        if (-not (Show-Confirm 'Docker Desktop installieren' 'Docker Desktop jetzt per winget installieren?' $true)) {
            Throw-Fatal 'Docker Desktop wird für die Installation benötigt.'
        }
        $null = Install-WingetPackage 'Docker.DockerDesktop' 'Docker Desktop installieren'
        Refresh-Path
        $exe = Get-DockerDesktopExe
    }
    if (-not $exe) {
        Throw-Fatal 'Docker Desktop wurde nicht gefunden. Bitte die Installation prüfen und den Installer erneut starten.'
    }
    if (-not (Test-NativeCommand 'docker')) {
        Throw-Fatal 'Der Docker-Befehl ist nicht verfügbar. Bitte Docker Desktop einmal starten und den Installer erneut ausführen.'
    }
}

function Ensure-Wsl2 {
    $features = @('Microsoft-Windows-Subsystem-Linux', 'VirtualMachinePlatform')
    $needsReboot = $false
    foreach ($featureName in $features) {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName $featureName -ErrorAction SilentlyContinue
        if ($null -eq $feature) {
            Show-Message 'WSL2-Backend' "Das Windows-Feature $featureName konnte nicht geprüft werden. Docker Desktop benötigt WSL2. Bitte die Installation prüfen."
            continue
        }
        if ($feature.State -ne 'Enabled') {
            if (-not (Show-Confirm 'WSL2-Backend' "Docker Desktop benötigt das Windows-Feature $featureName. Soll es jetzt aktiviert werden?" $true)) {
                Throw-Fatal "Das Feature $featureName wird für Docker Desktop benötigt."
            }
            $result = Enable-WindowsOptionalFeature -Online -FeatureName $featureName -NoRestart -ErrorAction Stop
            if ($result.RestartNeeded) { $needsReboot = $true }
        }
    }
    if ($needsReboot) {
        return (Stop-ForReboot 'Die WSL2-Features wurden aktiviert.')
    }
    if (Test-NativeCommand 'wsl') {
        $rc = Invoke-External 'WSL aktualisieren' 'wsl --update' { wsl --update }
        if ($rc -ne 0) { Write-Log 'wsl --update ist fehlgeschlagen; Docker Desktop eventuell trotzdem startbar.' }
        $null = Invoke-External 'WSL2 als Standard' 'wsl --set-default-version 2' { wsl --set-default-version 2 }
    }
    if (Test-RebootPending) {
        return (Stop-ForReboot 'Windows meldet einen ausstehenden Neustart.')
    }
    return $true
}

function Ensure-DockerAutostartTask {
    param([string]$DockerExe)
    try {
        $escapedExe = $DockerExe.Replace("'", "''")
        $inner = "if (-not (Get-Process 'Docker Desktop' -ErrorAction SilentlyContinue)) { Start-Process '$escapedExe' }"
        $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -Command `"$inner`"") -ErrorAction Stop
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $script:OriginalUser -ErrorAction Stop
        $principal = New-ScheduledTaskPrincipal -UserId $script:OriginalUser -LogonType Interactive -RunLevel Limited -ErrorAction Stop
        Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Principal $principal -Force -ErrorAction Stop | Out-Null
        Set-State 'task' $true
        Write-Log "Autostart-Aufgabe eingerichtet: $script:TaskName"
    } catch {
        Write-Log "Autostart-Aufgabe konnte nicht eingerichtet werden: $($_.Exception.Message)"
        Show-Message 'Autostart' "Die Autostart-Aufgabe konnte nicht eingerichtet werden: $($_.Exception.Message)`nDocker Desktop muss nach einem Neustart eventuell manuell gestartet werden."
    }
}

function Start-DockerDesktop {
    param([string]$DockerExe)
    Ensure-DockerAutostartTask -DockerExe $DockerExe
    $started = $false
    try {
        Start-ScheduledTask -TaskName $script:TaskName -ErrorAction Stop
        $started = $true
    } catch {
        Write-Log "Start über die Aufgabe fehlgeschlagen: $($_.Exception.Message)"
    }
    if (-not $started) {
        try {
            Start-Process -FilePath $DockerExe -ErrorAction Stop | Out-Null
        } catch {
            Write-Log "Docker Desktop konnte nicht gestartet werden: $($_.Exception.Message)"
        }
    }
}

function Wait-DockerEngine {
    param([int]$TimeoutSeconds = 600)
    Suspend-Tui
    Clear-Host
    Write-Host 'Docker Desktop wird gestartet ...' -ForegroundColor Cyan
    Write-Host 'Beim ersten Start gegebenenfalls die Lizenz bestätigen und die Anmeldung überspringen.'
    Write-Host ''
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $ok = $false
    while ((Get-Date) -lt $deadline) {
        & docker info *> $null
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
        Write-Host '.' -NoNewline
        Start-Sleep -Seconds 5
    }
    Write-Host ''
    Resume-Tui
    return $ok
}

function Ensure-DockerEngine {
    if (Test-NativeCommand 'docker') {
        $info = Invoke-Capture { docker info }
        if ($info.Code -eq 0) {
            Assert-LinuxContainers
            $readyVersion = Invoke-Capture { docker compose version --short }
            if ($readyVersion.Code -ne 0) { Throw-Fatal 'Docker Compose v2 ist nicht verfügbar.' }
            if (-not (Test-VersionAtLeast $readyVersion.Output $script:ComposeMinVersion)) {
                Throw-Fatal "Docker Compose $($readyVersion.Output) ist zu alt (benötigt >= $script:ComposeMinVersion). Bitte Docker Desktop aktualisieren."
            }
            try { & net localgroup docker-users $script:OriginalUser /add *> $null } catch { }
            return $true
        }
    }

    if (-not (Ensure-Wsl2)) { return $false }
    Ensure-DockerDesktopInstalled
    if (Test-RebootPending) { return (Stop-ForReboot 'Docker Desktop oder Windows meldet einen ausstehenden Neustart.') }

    $exe = Get-DockerDesktopExe
    Start-DockerDesktop -DockerExe $exe

    $attempts = 0
    while ($true) {
        if (Wait-DockerEngine -TimeoutSeconds 600) { break }
        $attempts++
        if ($attempts -ge 2) {
            Throw-Fatal 'Docker Desktop ist nach 20 Minuten nicht erreichbar. Bitte Docker Desktop manuell starten, die Lizenz bestätigen und den Installer erneut ausführen.'
        }
        if (-not (Show-Confirm 'Docker Desktop reagiert nicht' 'Docker Desktop ist noch nicht bereit. Soll weiter gewartet werden?' $true)) {
            Throw-Fatal 'Installation abgebrochen: Docker Desktop ist nicht bereit.'
        }
    }

    Assert-LinuxContainers
    $version = Invoke-Capture { docker compose version --short }
    if ($version.Code -ne 0) { Throw-Fatal 'Docker Compose v2 ist nicht verfügbar.' }
    if (-not (Test-VersionAtLeast $version.Output $script:ComposeMinVersion)) {
        Throw-Fatal "Docker Compose $($version.Output) ist zu alt (benötigt >= $script:ComposeMinVersion). Bitte Docker Desktop aktualisieren."
    }
    Write-Log "Docker Compose Version: $($version.Output)"

    try {
        & net localgroup docker-users $script:OriginalUser /add *> $null
        Write-Log "Benutzer $script:OriginalUser zur Gruppe docker-users hinzugefügt (falls nicht bereits vorhanden)."
    } catch {
        Write-Log "docker-users konnte nicht ergänzt werden: $($_.Exception.Message)"
    }
    return $true
}

function Assert-LinuxContainers {
    $info = Invoke-Capture { docker info --format '{{.OSType}}' }
    if ($info.Code -ne 0) {
        Throw-Fatal 'Docker läuft, aber der Container-Modus konnte nicht ermittelt werden.'
    }
    if ($info.Output -notmatch '(?im)^\s*linux\s*$') {
        Throw-Fatal 'Docker Desktop läuft im Windows-Container-Modus. Bitte in den Einstellungen auf Linux-Container umstellen und den Installer erneut ausführen.'
    }
}

function Test-VersionAtLeast {
    param([string]$Have, [string]$Need)
    $haveMatch = [regex]::Match($Have, '(\d+)\.(\d+)\.(\d+)')
    $needMatch = [regex]::Match($Need, '(\d+)\.(\d+)\.(\d+)')
    if (-not $haveMatch.Success -or -not $needMatch.Success) { return $false }
    $haveVersion = [version]("{0}.{1}.{2}" -f $haveMatch.Groups[1].Value, $haveMatch.Groups[2].Value, $haveMatch.Groups[3].Value)
    $needVersion = [version]("{0}.{1}.{2}" -f $needMatch.Groups[1].Value, $needMatch.Groups[2].Value, $needMatch.Groups[3].Value)
    return ($haveVersion -ge $needVersion)
}

function Resolve-TargetPath {
    param([string]$Path)
    if (-not $Path) { Throw-Fatal 'Es wurde kein Zielverzeichnis angegeben.' }
    $expanded = [Environment]::ExpandEnvironmentVariables($Path)
    if (-not [IO.Path]::IsPathRooted($expanded)) {
        $base = if ($script:OriginalProfile) { $script:OriginalProfile } else { $env:USERPROFILE }
        $expanded = Join-Path $base $expanded
    }
    try { $full = [IO.Path]::GetFullPath($expanded) } catch { Throw-Fatal "Ungültiger Pfad: $Path" }
    $root = [IO.Path]::GetPathRoot($full)
    if ($full -ieq $root) { Throw-Fatal "Der Systempfad $full ist als Projektordner nicht erlaubt." }
    $full = $full.TrimEnd('\')
    if (-not $full) { Throw-Fatal 'Ungültiger Zielpfad.' }
    $forbidden = @('C:\', 'C:\Windows', 'C:\Program Files', 'C:\Program Files (x86)', 'C:\ProgramData')
    foreach ($bad in $forbidden) {
        if ($full -ieq $bad) { Throw-Fatal "Der Systempfad $full ist als Projektordner nicht erlaubt." }
    }
    try { New-Item -ItemType Directory -Force -Path $full -ErrorAction Stop | Out-Null } catch { Throw-Fatal "Das Verzeichnis $full konnte nicht angelegt werden: $($_.Exception.Message)" }
    try {
        $testFile = Join-Path $full '.grillabend-write-test'
        Set-Content -LiteralPath $testFile -Value 'ok' -Encoding ASCII -ErrorAction Stop
        Remove-Item -LiteralPath $testFile -Force -ErrorAction Stop
    } catch {
        Throw-Fatal "Das Verzeichnis $full ist nicht beschreibbar: $($_.Exception.Message)"
    }
    return $full
}

function Ask-TargetDir {
    param([string]$Default)
    $defaultPath = if ($script:RequestedInstallDir) { $script:RequestedInstallDir } elseif ($Default) { $Default } elseif (Get-State 'install_dir') { [string](Get-State 'install_dir') } else { $script:DefaultInstallDir }
    while ($true) {
        $path = Show-Input 'Zielverzeichnis' 'Wohin soll das Projekt installiert werden?' $defaultPath
        try {
            $full = Resolve-TargetPath $path
        } catch {
            Show-Message 'Ungültiger Pfad' $_.Exception.Message
            continue
        }
        $entries = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($entries.Count -gt 0) {
            $isProject = (Test-Path -LiteralPath (Join-Path $full 'compose.yaml')) -and (Test-Path -LiteralPath (Join-Path $full '.git'))
            if ($isProject) { return $full }
            Show-Message 'Ordner nicht leer' "In $full liegen bereits fremde Dateien. Bitte einen anderen Pfad wählen."
            $defaultPath = $script:DefaultInstallDir
            continue
        }
        return $full
    }
}

function Ensure-FirewallRule {
    try {
        Get-NetFirewallRule -DisplayName $script:FirewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $script:FirewallRuleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $script:HostPort -Profile Private,Domain -RemoteAddress LocalSubnet -ErrorAction Stop | Out-Null
        Set-State 'firewall_rule' $true
        Write-Log "Firewall-Regel eingerichtet: TCP $script:HostPort, private/Domänen-Netze, lokales Subnetz."
    } catch {
        Write-Log "Firewall-Regel konnte nicht eingerichtet werden: $($_.Exception.Message)"
        Set-State 'firewall_rule' $false
        Show-Message 'Firewall' "Die Windows-Firewall-Regel konnte nicht eingerichtet werden: $($_.Exception.Message)`nAndere Geräte im LAN erreichen die App eventuell nicht."
    }
    try {
        $profiles = Get-NetConnectionProfile -ErrorAction SilentlyContinue
        if ($profiles) {
            foreach ($profile in $profiles) {
                if ($profile.NetworkCategory -eq 'Public') {
                    Show-Message 'Netzwerkprofil' "Das aktive Netzwerk '$($profile.Name)' ist als 'Öffentlich' eingestuft. Die LAN-Regel gilt nur für private und Domänen-Netze. Für den Zugriff aus dem LAN das Netzwerk als privat einstufen oder die Firewall-Regel bewusst anpassen."
                    break
                }
            }
        }
    } catch {
    }
}

function Remove-FirewallRule {
    try {
        Get-NetFirewallRule -DisplayName $script:FirewallRuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        Set-State 'firewall_rule' $false
        Write-Log 'Firewall-Regel entfernt.'
    } catch {
        Write-Log "Firewall-Regel konnte nicht entfernt werden: $($_.Exception.Message)"
    }
}

function Set-BindMode {
    param([string]$Mode, [bool]$Interactive = $true)
    if ($Mode -eq 'lan') {
        if ($Interactive) {
            Show-Message 'Sicherheitshinweis LAN' 'Im LAN ist die App ohne TLS erreichbar. Passwörter und Sitzungs-Cookies können im Netz mitgelesen werden. Die App hat außerdem keinen Origin-/CSRF-Schutz. Nutze LAN nur in einem vertrauenswürdigen Netz oder besser einen HTTPS-Reverse-Proxy.'
            if (-not (Show-TypedConfirm 'LAN wirklich aktivieren?' "Tippe JA, um die App auf 0.0.0.0:$script:HostPort freizugeben." 'JA')) {
                return $false
            }
        }
        $script:BindMode = 'lan'
        Set-State 'bind' 'lan'
        if (Show-Confirm 'Firewall-Regel' "Soll TCP $script:HostPort für das lokale Subnetz im privaten Netz freigegeben werden?" $true) {
            Ensure-FirewallRule
        } else {
            Remove-FirewallRule
        }
        return $true
    }

    $script:BindMode = 'local'
    Set-State 'bind' 'local'
    Remove-FirewallRule
    return $true
}

function Ask-BindMode {
    param([string]$Default = 'lan')
    $script:MenuDefault = if ($Default -eq 'local') { 1 } else { 0 }
    $result = Show-Menu 'Netzwerkbindung' 'Wie soll die App erreichbar sein?' @(
        "Im LAN (0.0.0.0)::Andere Geräte im vertrauenswürdigen Netz können zugreifen. HTTP ohne TLS.",
        'Nur lokal (127.0.0.1)::Nur dieser Rechner; sicherer, aber keine Gästezugriffe.'
    )
    $script:MenuDefault = $null
    switch ($result) {
        0 { return (Set-BindMode 'lan' $true) }
        1 { return (Set-BindMode 'local' $false) }
        default { return $false }
    }
}

function Write-ComposeOverride {
    param([string]$Dir)
    $file = Join-Path $Dir 'compose.override.yaml'
    $marker = '# Managed by the Grillabend installer.'
    if (Test-Path -LiteralPath $file) {
        $content = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
        if ($content -notmatch [regex]::Escape($marker)) {
            Throw-Fatal "$file existiert bereits und wurde nicht vom Installer erstellt. Bitte manuell prüfen."
        }
    }
    if ($script:BindMode -eq 'lan') {
        $lines = @(
            $marker,
            'services:',
            '  grillabend:',
            '    ports: !override',
            "      - `"0.0.0.0:${script:HostPort}:80`""
        )
        Set-Content -LiteralPath $file -Value $lines -Encoding ASCII -ErrorAction Stop
        Write-Log "Compose-Override für LAN geschrieben: 0.0.0.0:$script:HostPort -> 80"
    } else {
        if ((Test-Path -LiteralPath $file) -and ((Get-Content -LiteralPath $file -Raw) -match [regex]::Escape($marker))) {
            Remove-Item -LiteralPath $file -Force -ErrorAction Stop
            Write-Log 'Compose-Override entfernt; Bindung bleibt 127.0.0.1.'
        }
    }
}

function Write-GitExcludes {
    param([string]$Dir)
    $info = Join-Path $Dir '.git\info'
    if (-not (Test-Path -LiteralPath $info)) { return }
    $exclude = Join-Path $info 'exclude'
    $existing = @()
    if (Test-Path -LiteralPath $exclude) { $existing = Get-Content -LiteralPath $exclude -ErrorAction SilentlyContinue }
    foreach ($entry in @('compose.override.yaml', 'backups/')) {
        if ($existing -notcontains $entry) {
            Add-Content -LiteralPath $exclude -Value $entry -Encoding ASCII
        }
    }
}

function Clone-Project {
    param([string]$Dir)
    $compose = Join-Path $Dir 'compose.yaml'
    $gitDir = Join-Path $Dir '.git'
    if ((Test-Path -LiteralPath $compose) -and (Test-Path -LiteralPath $gitDir)) {
        Write-Log "Bestehendes Projekt erkannt: $Dir"
        $rc = Invoke-External 'Projekt aktualisieren' "git -C `"$Dir`" pull --ff-only" { git -C $Dir pull --ff-only }
        if ($rc -ne 0) { Write-Log 'git pull fehlgeschlagen; vorhandene Projektdateien werden verwendet.' }
        Write-GitExcludes $Dir
        return
    }
    $entries = @(Get-ChildItem -LiteralPath $Dir -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($entries.Count -gt 0) {
        Throw-Fatal "Der Zielordner $Dir ist nicht leer und enthält kein Grillabend-Repository."
    }
    $rc = Invoke-External 'Projekt klonen' "git clone --branch $script:RepoBranch $script:RepoUrl `"$Dir`"" { git clone --branch $script:RepoBranch $script:RepoUrl $Dir }
    if ($rc -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Dir 'compose.yaml'))) {
        Throw-Fatal 'git clone ist fehlgeschlagen oder unvollständig.'
    }
    Write-GitExcludes $Dir
}

function Get-ExcludedPortRanges {
    $ranges = @()
    try {
        $lines = & netsh interface ipv4 show excludedportrange protocol=tcp 2>&1
        foreach ($line in $lines) {
            $m = [regex]::Match([string]$line, '^\s*(\d+)\s+(\d+)\s*$')
            if ($m.Success) {
                $ranges += [pscustomobject]@{ Start = [int]$m.Groups[1].Value; End = [int]$m.Groups[2].Value }
            }
        }
    } catch {
    }
    return $ranges
}

function Test-PortAvailable {
    if (Test-ContainerRunning) { return }

    $portUsers = Invoke-Capture { docker ps --filter "publish=$script:HostPort" --format '{{.Names}}' }
    if ($portUsers.Code -eq 0 -and $portUsers.Output) {
        $names = @(($portUsers.Output -split "`r?`n") | Where-Object { $_ })
        if ($names.Count -gt 0 -and ($names -notcontains $script:ContainerName)) {
            Throw-Fatal "TCP-Port $script:HostPort wird bereits von einem anderen Container verwendet: $($names -join ', ')."
        }
    }

    $connection = Get-NetTCPConnection -LocalPort $script:HostPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        $processName = ''
        try {
            $proc = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) { $processName = $proc.ProcessName }
        } catch {
        }
        if ($processName -match 'docker|com\.docker') {
            Write-Log "Port $script:HostPort wird bereits von Docker verwendet."
            return
        }
        Throw-Fatal "TCP-Port $script:HostPort ist belegt (Prozess: $processName, PID $($connection.OwningProcess)). Bitte den Dienst beenden; der Installer ändert den Port nicht."
    }
    foreach ($range in Get-ExcludedPortRanges) {
        if ($script:HostPort -ge $range.Start -and $script:HostPort -le $range.End) {
            Throw-Fatal "TCP-Port $script:HostPort liegt im von Windows/Hyper-V reservierten Bereich $($range.Start)-$($range.End). Bitte den Bereich freigeben (z. B. 'net stop winnat' und 'net start winnat') und den Installer erneut starten."
        }
    }
}

function Test-ContainerExists {
    if (-not (Test-NativeCommand 'docker')) { return $false }
    $result = Invoke-Capture { docker ps -a --format '{{.Names}}' }
    if ($result.Code -ne 0) { return $false }
    return (($result.Output -split "`r?`n") -contains $script:ContainerName)
}

function Test-ContainerRunning {
    if (-not (Test-NativeCommand 'docker')) { return $false }
    $result = Invoke-Capture { docker ps --format '{{.Names}}' }
    if ($result.Code -ne 0) { return $false }
    return (($result.Output -split "`r?`n") -contains $script:ContainerName)
}

function Test-VolumeExists {
    if (-not (Test-NativeCommand 'docker')) { return $false }
    $result = Invoke-Capture { docker volume ls --format '{{.Name}}' }
    if ($result.Code -ne 0) { return $false }
    return (($result.Output -split "`r?`n") -contains $script:VolumeName)
}

function Test-VolumeHasDatabase {
    $global:LASTEXITCODE = 0
    & docker run --rm --user root -v "${script:VolumeName}:/data" --entrypoint sh $script:ImageName -c 'test -s /data/app.sqlite' *> $null
    return ($LASTEXITCODE -eq 0)
}

function Invoke-ComposePull {
    param([string]$Dir)
    $rc = Invoke-External 'Image ziehen' 'docker compose pull' {
        Push-Location -LiteralPath $Dir
        try { docker compose pull } finally { Pop-Location }
    }
    if ($rc -ne 0) { Throw-Fatal 'Das Image konnte nicht von GHCR geladen werden.' }
}

function Invoke-ComposeConfigCheck {
    param([string]$Dir)
    $rc = Invoke-External 'Compose-Konfiguration prüfen' 'docker compose config' {
        Push-Location -LiteralPath $Dir
        try { docker compose config } finally { Pop-Location }
    }
    if ($rc -ne 0) { Throw-Fatal 'Die Compose-Konfiguration ist ungültig.' }
}

function Invoke-ComposeUp {
    param([string]$Dir)
    $rc = Invoke-External 'Container starten' 'docker compose up -d' {
        Push-Location -LiteralPath $Dir
        try { docker compose up -d } finally { Pop-Location }
    }
    if ($rc -ne 0) {
        & docker start $script:ContainerName *> $null
        Throw-Fatal 'Der Container konnte nicht gestartet werden.'
    }
}

function Invoke-ComposeStop {
    param([string]$Dir)
    return (Invoke-External 'Container stoppen' 'docker compose stop' {
        Push-Location -LiteralPath $Dir
        try { docker compose stop } finally { Pop-Location }
    })
}

function Invoke-ComposeLogs {
    param([string]$Dir)
    $null = Invoke-External 'Container-Logs' 'docker compose logs --tail=80' {
        Push-Location -LiteralPath $Dir
        try { docker compose logs --tail=80 } finally { Pop-Location }
    }
}

function Test-Health {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        $code = 0
        try {
            $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$script:HostPort/")
            $request.AllowAutoRedirect = $false
            $request.Proxy = $null
            $request.Timeout = 3000
            $request.KeepAlive = $false
            try {
                $response = $request.GetResponse()
                $code = [int]$response.StatusCode
                $response.Close()
            } catch [Net.WebException] {
                if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
            }
        } catch {
            $code = 0
        }
        if ($code -eq 200 -or $code -eq 302 -or $code -eq 303) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Import-LocalDatabase {
    param([string]$Dir)
    $localDb = Join-Path $Dir 'data\app.sqlite'
    if (-not (Test-Path -LiteralPath $localDb)) { return }
    if (Test-VolumeHasDatabase) {
        Write-Log 'Volume enthält bereits eine Datenbank; lokaler Import wird übersprungen.'
        return
    }
    if (-not (Show-Confirm 'Lokale Datenbank gefunden' 'Im Projektordner liegt data\app.sqlite, das Docker-Volume ist aber leer. Soll die Datenbank ins Volume grillabend-data übernommen werden?' $true)) {
        return
    }
    $rc = Invoke-External 'Datenbank importieren' 'docker run ... cp data/app.sqlite -> Volume' {
        docker run --rm --user root -v "${script:VolumeName}:/data" -v "${Dir}\data:/src:ro" --entrypoint sh $script:ImageName -c 'cp /src/app.sqlite /data/app.sqlite && chown 1000:1000 /data/app.sqlite && chmod 600 /data/app.sqlite'
    }
    if ($rc -ne 0) { Throw-Fatal 'Der Datenbank-Import ist fehlgeschlagen.' }
    Set-State 'import' $true
}

function Backup-Database {
    param([string]$Dir)
    if (-not (Test-VolumeHasDatabase)) { return }
    $backupDir = Join-Path $Dir 'backups'
    New-Item -ItemType Directory -Force -Path $backupDir -ErrorAction Stop | Out-Null
    $name = 'app-{0}.sqlite' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    $inner = "cp /data/app.sqlite /backup/$name && (chmod 600 /backup/$name || true)"
    $rc = Invoke-External 'Datenbank sichern' 'docker run ... cp /data/app.sqlite -> backups' {
        docker run --rm --user root -v "${script:VolumeName}:/data" -v "${backupDir}:/backup" --entrypoint sh $script:ImageName -c $inner
    }
    if ($rc -ne 0) { Throw-Fatal 'Das Backup der Datenbank ist fehlgeschlagen.' }
    Get-ChildItem -LiteralPath $backupDir -Filter 'app-*.sqlite' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $script:BackupKeep |
        Remove-Item -Force -ErrorAction SilentlyContinue
    Show-Message 'Backup erstellt' "Die Datenbank wurde unter $backupDir\$name gesichert. Es werden die letzten $script:BackupKeep Backups behalten."
}

function Get-LanIPv4 {
    try {
        $addresses = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {
            $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown'
        })
        $route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
        if ($route) {
            $routed = $addresses | Where-Object { $_.InterfaceIndex -eq $route.InterfaceIndex } | Select-Object -First 1
            if ($routed) { return $routed.IPAddress }
        }
        $real = $addresses | Where-Object { $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker|Loopback|Virtual|Hyper-V' }
        $private = $real | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' } | Select-Object -First 1
        if ($private) { return $private.IPAddress }
        $any = $real | Select-Object -First 1
        if ($any) { return $any.IPAddress }
        $fallback = $addresses | Select-Object -First 1
        if ($fallback) { return $fallback.IPAddress }
    } catch {
    }
    return $null
}

function Show-AccessInfo {
    $ip = Get-LanIPv4
    if ($script:BindMode -eq 'lan') {
        $lanUrl = if ($ip) { "http://${ip}:$script:HostPort/setup" } else { "http://<LAN-IP>:$script:HostPort/setup" }
        $body = @"
Die App läuft. Ersteinrichtung: $lanUrl
Lokal: http://127.0.0.1:$script:HostPort/setup

Wichtig: Die App spricht nur HTTP. Im LAN sind Zugangsdaten unverschlüsselt.
Für dauerhaften Betrieb einen HTTPS-Reverse-Proxy davorsetzen.

Log: $script:LogFile
Status: $script:StateFile
"@
        if (-not (Get-State 'firewall_rule')) {
            $body += "`nHinweis: Es wurde keine Windows-Firewall-Regel angelegt; andere Geräte erreichen die App eventuell nicht."
        }
    } else {
        $body = @"
Die App läuft nur auf 127.0.0.1:$script:HostPort.
Ersteinrichtung: http://127.0.0.1:$script:HostPort/setup

Von anderen Geräten ist die App nicht erreichbar.
Log: $script:LogFile
Status: $script:StateFile
"@
    }
    Show-Message 'Installation abgeschlossen' $body
    if (Show-Confirm 'Browser öffnen' 'Soll die Ersteinrichtung jetzt im Browser geöffnet werden?' $true) {
        try { Start-Process -FilePath 'explorer.exe' -ArgumentList "http://127.0.0.1:$script:HostPort/setup" | Out-Null } catch { }
    }
}

function Invoke-InstallFlow {
    param([switch]$Resume)
    $dir = $null

    if ($Resume -and (Get-State 'install_dir')) {
        $dir = [string](Get-State 'install_dir')
        $savedBind = [string](Get-State 'bind')
        if ($savedBind) { $script:BindMode = $savedBind }
        Set-State 'mode' 'install'
        Show-Message 'Fortsetzen' "Die Einrichtung wird mit dem gespeicherten Stand fortgesetzt:`n$dir"
    } else {
        $oldDir = [string](Get-State 'install_dir')
        $oldBind = [string](Get-State 'bind')
        Clear-State
        Set-State 'mode' 'install'
        Set-State 'step' 'target'
        if ($script:RequestedInstallDir) { Set-State 'install_dir' $script:RequestedInstallDir }
        elseif ($oldDir) { Set-State 'install_dir' $oldDir }
        if ($script:RequestedBind) { Set-State 'bind' $script:RequestedBind }
        elseif ($oldBind) { Set-State 'bind' $oldBind }
        else { Set-State 'bind' 'lan' }
    }

    Set-State 'step' 'target'
    if (-not $dir) {
        $dir = Ask-TargetDir $script:RequestedInstallDir
    }
    $dir = Resolve-TargetPath $dir
    Set-State 'install_dir' $dir

    Set-State 'step' 'bind'
    if ($script:RequestedBind) {
        if (-not (Set-BindMode $script:RequestedBind $true)) {
            $script:RequestedBind = $null
            if (-not (Ask-BindMode ([string](Get-State 'bind')))) { return }
        }
    } elseif (-not $Resume -or -not (Get-State 'bind')) {
        if (-not (Ask-BindMode 'lan')) { return }
    } else {
        $script:BindMode = [string](Get-State 'bind')
        if (-not $script:BindMode) { $script:BindMode = 'lan' }
    }
    Set-State 'bind' $script:BindMode

    Set-State 'step' 'prerequisites'
    Ensure-Git

    Set-State 'step' 'docker'
    if (-not (Ensure-DockerEngine)) { return }

    Set-State 'step' 'clone'
    Clone-Project $dir
    Set-State 'install_dir' $dir

    Set-State 'step' 'compose'
    Write-ComposeOverride $dir
    Invoke-ComposeConfigCheck $dir
    Test-PortAvailable

    Set-State 'step' 'pull'
    Invoke-ComposePull $dir

    Set-State 'step' 'import'
    Import-LocalDatabase $dir

    Set-State 'step' 'start'
    Invoke-ComposeUp $dir
    if (-not (Test-Health)) {
        Invoke-ComposeLogs $dir
        Throw-Fatal 'Die App antwortet nach 120 Sekunden nicht auf HTTP. Logs prüfen: docker compose logs grillabend'
    }

    Set-State 'step' 'autostart'
    if ($script:BindMode -eq 'lan') {
        if (Get-State 'firewall_rule') { Ensure-FirewallRule }
    } else {
        Remove-FirewallRule
    }
    $exe = Get-DockerDesktopExe
    if ($exe) { Ensure-DockerAutostartTask -DockerExe $exe }

    Set-State 'step' 'done'
    Set-State 'bind' $script:BindMode
    Set-State 'install_dir' $dir
    Show-AccessInfo
}

function Resolve-ProjectForManagement {
    $dir = $null
    if (Get-State 'install_dir') { $dir = [string](Get-State 'install_dir') }
    elseif ($script:RequestedInstallDir) { $dir = $script:RequestedInstallDir }
    if (-not $dir -and (Test-Path -LiteralPath $script:DefaultInstallDir)) { $dir = $script:DefaultInstallDir }
    if (-not $dir) {
        $dir = Show-Input 'Projektordner' 'Wo liegt die bestehende Installation?' $script:DefaultInstallDir
    }
    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'compose.yaml'))) {
        return (Resolve-TargetPath $dir)
    }
    if ($dir) {
        $dir = Show-Input 'Projektordner' 'Wo liegt die bestehende Installation?' $dir
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'compose.yaml'))) {
            return (Resolve-TargetPath $dir)
        }
    }
    return $null
}

function Invoke-UpdateFlow {
    $dir = Resolve-ProjectForManagement
    if (-not $dir) {
        Show-Message 'Nicht gefunden' 'Es wurde keine bestehende Installation gefunden.'
        return
    }
    $currentBind = [string](Get-State 'bind')
    if (-not $currentBind) { $currentBind = $script:BindMode }
    $script:BindMode = $currentBind
    Set-State 'mode' 'update'

    if (-not (Show-Confirm 'Aktualisieren' "Die Installation in $dir wird aktualisiert. Vorher wird ein Backup der Datenbank erstellt. Fortfahren?" $true)) { return }

    if (Show-Confirm 'Bindung ändern?' "Soll die Netzwerkbindung geändert werden? Aktuell: $currentBind." $false) {
        if (-not (Ask-BindMode $currentBind)) { return }
    } else {
        Set-State 'bind' $script:BindMode
    }

    Set-State 'step' 'update-docker'
    if (-not (Ensure-DockerEngine)) { return }
    Test-PortAvailable

    Set-State 'step' 'update-pull-base'
    Invoke-ComposePull $dir

    Set-State 'step' 'update-backup'
    if (Test-ContainerRunning) {
        $stopRc = Invoke-ComposeStop $dir
        if ($stopRc -ne 0) {
            Throw-Fatal 'Der Container konnte nicht gestoppt werden. Update abgebrochen; die App läuft weiter.'
        }
    }
    try {
        Backup-Database $dir
    } catch {
        Invoke-ComposeUp $dir
        throw
    }

    Set-State 'step' 'update-git'
    $rc = Invoke-External 'Projekt aktualisieren' "git -C `"$dir`" pull --ff-only" { git -C $dir pull --ff-only }
    if ($rc -ne 0) {
        Invoke-ComposeUp $dir
        Throw-Fatal 'git pull ist fehlgeschlagen. Lokale Änderungen prüfen; die App wurde mit dem vorhandenen Stand neu gestartet.'
    }

    Set-State 'step' 'update-compose'
    Write-ComposeOverride $dir
    Invoke-ComposeConfigCheck $dir

    Set-State 'step' 'update-pull'
    $pullRc = Invoke-External 'Image ziehen' 'docker compose pull' {
        Push-Location -LiteralPath $dir
        try { docker compose pull } finally { Pop-Location }
    }
    if ($pullRc -ne 0) {
        Invoke-ComposeUp $dir
        Throw-Fatal 'Das neue Image konnte nicht geladen werden. Die Datenbank ist gesichert; die App wurde mit dem vorhandenen Image neu gestartet.'
    }

    Set-State 'step' 'update-start'
    Invoke-ComposeUp $dir
    if (-not (Test-Health)) {
        Invoke-ComposeLogs $dir
        Throw-Fatal 'Die App antwortet nach 120 Sekunden nicht. Die Datenbank ist gesichert.'
    }

    if ($script:BindMode -eq 'lan') {
        if (Get-State 'firewall_rule') { Ensure-FirewallRule }
    } else {
        Remove-FirewallRule
    }
    $exe = Get-DockerDesktopExe
    if ($exe) { Ensure-DockerAutostartTask -DockerExe $exe }

    Set-State 'step' 'done'
    Set-State 'install_dir' $dir
    Set-State 'bind' $script:BindMode
    Show-Message 'Update abgeschlossen' "Die App läuft wieder. Ersteinrichtung/Anmeldung: http://127.0.0.1:$script:HostPort/setup`nLog: $script:LogFile"
}

function Remove-DockerAutostartTask {
    try {
        Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Set-State 'task' $false
        Write-Log 'Autostart-Aufgabe entfernt.'
    } catch {
        Write-Log "Autostart-Aufgabe konnte nicht entfernt werden: $($_.Exception.Message)"
    }
}

function Remove-ProjectDirSafely {
    param([string]$Dir)
    if (-not $Dir) { return }
    $full = [IO.Path]::GetFullPath($Dir).TrimEnd('\')
    $forbidden = @('C:\', 'C:\Windows', 'C:\Program Files', 'C:\Program Files (x86)', 'C:\ProgramData')
    foreach ($bad in $forbidden) {
        if ($full -ieq $bad) { Throw-Fatal "Sicherheitsabbruch: $full wird nicht gelöscht." }
    }
    $isProject = Test-Path -LiteralPath (Join-Path $full 'compose.yaml')
    $fromState = ([string](Get-State 'install_dir')) -ieq $full
    if (-not $isProject -and -not $fromState) {
        Throw-Fatal "Sicherheitsabbruch: $full sieht nicht wie eine Grillabend-Installation aus."
    }
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Stop
}

function Invoke-UninstallFlow {
    param([bool]$Purge)
    $dir = $null
    if (Get-State 'install_dir') { $dir = [string](Get-State 'install_dir') }
    elseif ($script:RequestedInstallDir) { $dir = $script:RequestedInstallDir }
    elseif (Test-Path -LiteralPath $script:DefaultInstallDir) { $dir = $script:DefaultInstallDir }

    $found = $false
    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'compose.yaml'))) { $found = $true }
    if (Test-ContainerExists) { $found = $true }
    if (Test-VolumeExists) { $found = $true }
    if (-not $found) {
        Show-Message 'Nichts zu entfernen' 'Es wurde keine Grillabend-Installation gefunden.'
        return
    }

    if ($Purge) {
        if (-not $Yes) {
            Show-Message 'Daten löschen' "Beim vollständigen Entfernen werden Container, Image, das Daten-Volume grillabend-data, der Projektordner $dir und alle Backups gelöscht. Docker Desktop, WSL2 und Git bleiben installiert."
            if (-not (Show-Confirm 'Wirklich alles löschen?' 'Diese Aktion kann nicht rückgängig gemacht werden.' $false)) { return }
        }
    } else {
        if (-not $Yes) {
            if (-not (Show-Confirm 'App entfernen' 'Container und Image werden entfernt. Projektordner, Daten-Volume und Backups bleiben erhalten. Fortfahren?' $true)) { return }
        }
    }

    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'compose.yaml'))) {
        $downArgs = if ($Purge) { 'down -v' } else { 'down' }
        $rc = Invoke-External 'App entfernen' "docker compose $downArgs" {
            Push-Location -LiteralPath $dir
            try {
                if ($Purge) { docker compose down -v } else { docker compose down }
            } finally { Pop-Location }
        }
        if ($rc -ne 0) {
            Show-Message 'Nicht vollständig entfernt' 'Docker Compose konnte die App nicht entfernen. Bitte Docker Desktop starten und den Installer erneut ausführen. Der Status bleibt erhalten, damit ein weiterer Versuch möglich ist.'
            return
        }
        & docker rmi $script:ImageName *> $null
        if ($Purge -and (Test-VolumeExists)) { & docker volume rm $script:VolumeName *> $null }
    } else {
        if (-not (Test-NativeCommand 'docker')) {
            Show-Message 'Docker nicht verfügbar' 'Docker ist nicht verfügbar. Container und Volume konnten nicht entfernt werden. Bitte Docker Desktop starten und den Installer erneut ausführen.'
            return
        }
        if (Test-ContainerExists) { & docker rm -f $script:ContainerName *> $null }
        & docker rmi $script:ImageName *> $null
        if ($Purge -and (Test-VolumeExists)) { & docker volume rm $script:VolumeName *> $null }
    }

    Remove-FirewallRule
    Remove-DockerAutostartTask

    if ($Purge) {
        if ($dir -and (Test-Path -LiteralPath $dir)) { Remove-ProjectDirSafely $dir }
        if (Test-VolumeExists) { & docker volume rm $script:VolumeName *> $null }
        Clear-State
        Show-Message 'Vollständig entfernt' "App, Daten-Volume, Projektordner und Backups wurden entfernt. Docker Desktop, WSL2 und Git bleiben installiert. Logs liegen unter $script:LogDir."
    } else {
        Clear-State
        Show-Message 'App entfernt' 'Container und Image wurden entfernt. Projektordner, Daten-Volume und Backups bleiben erhalten.'
    }
}

function Test-Installed {
    if ((Get-State 'install_dir') -and (Test-Path -LiteralPath (Join-Path ([string](Get-State 'install_dir')) 'compose.yaml'))) { return $true }
    if ($script:RequestedInstallDir -and (Test-Path -LiteralPath (Join-Path $script:RequestedInstallDir 'compose.yaml'))) { return $true }
    if (Test-Path -LiteralPath (Join-Path $script:DefaultInstallDir 'compose.yaml')) { return $true }
    if (Test-ContainerExists) { return $true }
    if (Test-VolumeExists) { return $true }
    return $false
}

function Show-DeinstallMenu {
    $script:MenuDefault = $null
    $result = Show-Menu 'Deinstallieren' 'Was soll entfernt werden?' @(
        'App entfernen (Daten behalten)::Container und Image entfernen; Volume und Projektordner bleiben.',
        'Alles löschen::Zusätzlich Daten-Volume, Projektordner und Backups löschen.',
        'Zurück::Zum Hauptmenü.'
    )
    switch ($result) {
        0 { Invoke-UninstallFlow $false; return $true }
        1 { Invoke-UninstallFlow $true; return $true }
        default { return $false }
    }
}

function Show-MainMenu {
    while ($true) {
        $stateStep = [string](Get-State 'step')
        if ($stateStep -and $stateStep -ne 'done' -and (Get-State 'install_dir')) {
            if (Show-Confirm 'Unvollständige Installation' 'Es wurde eine unvollständige Einrichtung gefunden. Soll sie fortgesetzt werden?' $true) {
                if ([string](Get-State 'mode') -eq 'update') {
                    Invoke-UpdateFlow
                } else {
                    Invoke-InstallFlow -Resume
                }
                return
            }
        }

        $installed = Test-Installed
        if ($installed) {
            $result = Show-Menu 'Hauptmenü' 'Eine Installation wurde erkannt.' @(
                'Aktualisieren::Image und Projekt aktualisieren, Datenbank automatisch sichern.',
                'Neu installieren::Projekt erneut einrichten; das Daten-Volume bleibt erhalten.',
                'Deinstallieren::App entfernen oder alle Daten löschen.',
                'Beenden::Installer schließen.'
            )
            switch ($result) {
                0 { Invoke-UpdateFlow; return }
                1 {
                    if (Show-Confirm 'Neu installieren' 'Projektdateien werden neu eingerichtet; das Daten-Volume grillabend-data bleibt erhalten. Fortfahren?' $true) {
                        Invoke-InstallFlow
                        return
                    }
                }
                2 { if (Show-DeinstallMenu) { return } }
                default { return }
            }
        } else {
            $result = Show-Menu 'Hauptmenü' 'Willkommen beim Installer.' @(
                'Installieren::Docker Desktop prüfen/installieren und die App einrichten.',
                'Deinstallieren::Vorhandene Reste entfernen.',
                'Beenden::Installer schließen.'
            )
            switch ($result) {
                0 { Invoke-InstallFlow; return }
                1 { if (Show-DeinstallMenu) { return } }
                default { return }
            }
        }
    }
}

try {
    Initialize-StateDir
    Read-State
    Initialize-Tui
    Assert-Windows

    if ($Purge) {
        Invoke-UninstallFlow $true
    } elseif ($Uninstall) {
        Invoke-UninstallFlow $false
    } else {
        Show-MainMenu
    }
} catch {
    $message = $_.Exception.Message
    Write-Log "ABBRUCH: $message"
    try {
        if ($script:UiActive) {
            Show-Message 'Fehler' "$message`n`nDetails: $script:LogFile"
        } else {
            Write-Host ''
            Write-Host "Fehler: $message" -ForegroundColor Red
            if ($script:LogFile) { Write-Host "Details: $script:LogFile" -ForegroundColor DarkGray }
        }
    } catch {
    }
} finally {
    Restore-Tui
    if ($script:PauseOnExit -and [Environment]::UserInteractive) {
        try {
            Write-Host ''
            Read-Host 'Enter zum Schließen' | Out-Null
        } catch {
        }
    }
}
