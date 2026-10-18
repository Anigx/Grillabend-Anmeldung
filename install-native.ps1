#Requires -Version 5.1
<#
.SYNOPSIS
    Interaktiver Bare-Metal-Installer für die Grillabend-Anmeldung unter Windows.

.DESCRIPTION
    Installiert Node.js 22 und die Anwendung ohne Docker oder WSL. Die App
    läuft als geplante Aufgabe unter SYSTEM, startet beim Systemstart und
    schreibt ihre Daten nach %ProgramData%\Grillabend. Die Oberfläche ist
    eine Fullscreen-TUI wie bei install.ps1.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File .\install-native.ps1

.EXAMPLE
    .\install-native.ps1 -Uninstall
    .\install-native.ps1 -Purge -Yes
#>
[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$Purge,
    [switch]$Yes,
    [switch]$NoPause,
    [switch]$SelfTest,
    [string]$Bind,
    [string]$InstallDir,
    [int]$Port = 1621,
    [string]$OriginalProfile,
    [string]$OriginalUser,
    [switch]$Help,
    [switch]$Version
)

$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
$script:InstallerVersion = '1.0.0'
$script:AppName = 'Grillabend-Anmeldung'
$script:HostPort = $Port
$script:RepoZipUrl = 'https://github.com/Anigx/Grillabend-Anmeldung/archive/refs/heads/main.zip'
$script:RawUrl = 'https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install-native.ps1'
$script:NodeMajor = '22'
$script:NodeMinVersion = '22.13.0'
$script:StateDir = Join-Path $env:ProgramData 'Grillabend-Installer-Native'
$script:StateFile = Join-Path $script:StateDir 'state.json'
$script:LogDir = Join-Path $script:StateDir 'Logs'
$script:DataDir = Join-Path $env:ProgramData 'Grillabend'
$script:TaskName = 'Grillabend-Anmeldung'
$script:FirewallRuleName = "Grillabend-Anmeldung (TCP $script:HostPort)"
$script:BackupKeep = 5

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
$script:BindMode = 'lan'
$script:InstallRoot = $null
$script:AppDir = $null
$script:NodeDir = $null
$script:StartScript = $null
$script:SelfTestMode = $false

try {
    [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    $OutputEncoding = New-Object System.Text.UTF8Encoding($false)
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
}

function Write-Help {
    Write-Host @'
Grillabend-Anmeldung - Bare-Metal-Installer für Windows (ohne Docker)

Schnellstart (PowerShell):
  irm https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/bootstrap-native.ps1 | iex

Aufruf:
  .\install-native.ps1                    Interaktive TUI (Installieren/Aktualisieren/Entfernen)
  .\install-native.ps1 -Uninstall         App entfernen, Daten behalten
  .\install-native.ps1 -Purge             App, Node.js, Daten und Backups löschen
  .\install-native.ps1 -SelfTest          Nur Download/npm/Start testen (temporäres Verzeichnis)
  .\install-native.ps1 -Help              Diese Hilfe anzeigen
  .\install-native.ps1 -Version           Installer-Version anzeigen

Optionen:
  -InstallDir PFAD    Zielverzeichnis vorbelegen (Standard: C:\Program Files\Grillabend)
  -Bind local|lan     Netzwerkbindung vorbelegen (Standard: lan)
  -Port NUMMER        TCP-Port vorbelegen (Standard: 1621)
  -Yes                Sicherheitsabfragen bei -Uninstall/-Purge überspringen
  -NoPause            Nicht auf Enter warten, wenn das Skript endet

Der Installer lädt Node.js 22 als offizielles ZIP (SHA-256-geprüft) und die
App als GitHub-ZIP. Es werden weder Docker noch WSL oder Git benötigt. Die
App läuft als geplante Aufgabe unter SYSTEM und startet beim Systemstart.
Daten: %ProgramData%\Grillabend
Status: %ProgramData%\Grillabend-Installer-Native\state.json
Logs:   %ProgramData%\Grillabend-Installer-Native\Logs\
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
if ($Port -lt 1 -or $Port -gt 65535) {
    Write-Host "Ungültiger Port: $Port (erlaubt: 1-65535)." -ForegroundColor Red
    exit 2
}
$script:FirewallRuleName = "Grillabend-Anmeldung (TCP $script:HostPort)"

$script:RequestedBind = $Bind
$script:RequestedInstallDir = $InstallDir
if ($script:RequestedInstallDir) {
    $script:RequestedInstallDir = $script:RequestedInstallDir.TrimEnd('\')
    if ($script:RequestedInstallDir -match '^[A-Za-z]:$') { $script:RequestedInstallDir += '\' }
}
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
    $bootstrapDir = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'Grillabend-Installer' } else { Join-Path $env:TEMP 'Grillabend-Installer' }
    try {
        New-Item -ItemType Directory -Force -Path $bootstrapDir -ErrorAction Stop | Out-Null
        $scriptPath = Join-Path $bootstrapDir 'install-native.ps1'
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
if ($Port -ne 1621) { $argString += " -Port $Port" }
if ($Uninstall) { $argString += ' -Uninstall' }
if ($Purge) { $argString += ' -Purge' }
if ($Yes) { $argString += ' -Yes' }
if ($NoPause) { $argString += ' -NoPause' }
if ($SelfTest) { $argString += ' -SelfTest' }

if (-not $SelfTest -and -not $Help -and -not $Version -and -not (Test-Admin)) {
    try {
        Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $argString | Out-Null
    } catch {
        Write-Host "Die Erhöhung über UAC wurde abgebrochen: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    exit 0
}
if ($pipedMode -and (Test-Admin)) {
    try {
        Start-Process -FilePath 'powershell.exe' -ArgumentList $argString -NoNewWindow -Wait -ErrorAction Stop | Out-Null
    } catch {
        Write-Host "Der Installer konnte nicht gestartet werden: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
    exit 0
}

if (-not $script:OriginalProfile) { $script:OriginalProfile = $env:USERPROFILE }
if (-not $script:OriginalUser) { $script:OriginalUser = "$env:USERDOMAIN\$env:USERNAME" }
$script:DefaultInstallDir = Join-Path $env:ProgramFiles 'Grillabend'
$script:PauseOnExit = -not $NoPause
$script:SelfTestMode = [bool]$SelfTest

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
    $title = " $script:AppName - Bare-Metal-Installer $script:InstallerVersion "
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
    if (-not $script:SelfTestMode) {
        Suspend-Tui
        Clear-Host
        Write-Host "== $Title ==" -ForegroundColor Cyan
        Write-Host ''
        Write-Host ('$ ' + $CommandText) -ForegroundColor DarkGray
        Write-Host ''
    } else {
        Write-Host "== $Title ==" -ForegroundColor Cyan
    }
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = 0
    $rc = 0
    try {
        if ($script:LogFile) {
            & $Action 2>&1 | Tee-Object -FilePath $script:LogFile -Append | Out-Host
        } else {
            & $Action 2>&1 | Out-Host
        }
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
        if (-not $script:SelfTestMode) {
            try { Read-Host 'Enter zum Fortfahren' | Out-Null } catch { }
        }
    }
    if (-not $script:SelfTestMode) { Resume-Tui }
    return $rc
}

function Assert-Windows {
    if ($env:OS -ne 'Windows_NT') {
        Throw-Fatal 'Dieser Installer läuft nur unter Windows.'
    }
    $version = [Environment]::OSVersion.Version
    $build = $version.Build
    Write-Log "Windows-Build: $build"
    if ($build -lt 17763) {
        Throw-Fatal "Windows 10 Build $build ist zu alt. Benötigt wird mindestens Windows 10 22H2 (Build 19045) oder Windows 11."
    }
    if ($build -lt 19045) {
        if (-not (Show-Confirm 'Windows 10' "Build $build ist älter als 22H2. Der Installer kann funktionieren, ist dort aber nicht getestet. Trotzdem fortfahren?" $false)) {
            Throw-Fatal 'Installation auf dieser Windows-Version abgebrochen.'
        }
    } elseif ($build -lt 22000) {
        Show-Message 'Windows 10' 'Windows 10 wird mit einer Warnung unterstützt. Windows 11 ist der empfohlene Untergrund.'
    }

    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'ARM64' }
    if ($arch -eq 'x86') {
        Throw-Fatal '32-Bit-Windows wird nicht unterstützt. Benötigt wird Windows x64 oder ARM64.'
    }
    if ($arch -notin @('AMD64', 'ARM64')) {
        Throw-Fatal "Nicht unterstützte Prozessorarchitektur: $arch."
    }

    $free = $null
    try {
        $free = (Get-PSDrive -Name C -ErrorAction Stop).Free
    } catch {
        Write-Log "Freier Speicher auf Laufwerk C: konnte nicht ermittelt werden: $($_.Exception.Message)"
    }
    if ($null -ne $free) {
        if ($free -lt 1GB) {
            Throw-Fatal 'Auf Laufwerk C: ist weniger als 1 GB frei. Node.js und die npm-Abhängigkeiten benötigen mehr Speicher.'
        }
        if ($free -lt 2GB) {
            Show-Message 'Wenig Speicherplatz' 'Auf Laufwerk C: sind weniger als 2 GB frei. Node.js und die npm-Abhängigkeiten können den Platzbedarf erhöhen.'
        }
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

function Get-ForbiddenProjectPaths {
    $paths = @(
        'C:\Windows',
        'C:\Program Files',
        'C:\Program Files (x86)',
        'C:\ProgramData'
    )
    foreach ($candidate in @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData, $env:USERPROFILE, $env:PUBLIC, $env:LOCALAPPDATA, $env:APPDATA)) {
        if ($candidate) { $paths += $candidate }
    }
    if ($env:USERPROFILE) {
        $usersRoot = Split-Path -Parent $env:USERPROFILE
        if ($usersRoot) { $paths += $usersRoot }
        $paths += (Join-Path $env:USERPROFILE 'Default')
    }
    return @($paths | Where-Object { $_ } | ForEach-Object { ([IO.Path]::GetFullPath($_)).TrimEnd('\') } | Select-Object -Unique)
}

function Resolve-TargetPath {
    param([string]$Path)
    if (-not $Path) { Throw-Fatal 'Es wurde kein Zielverzeichnis angegeben.' }
    $base = if ($script:OriginalProfile) { $script:OriginalProfile } else { $env:USERPROFILE }
    $expanded = [Environment]::ExpandEnvironmentVariables($Path)
    if ($expanded -eq '~') {
        $expanded = $base
    } elseif ($expanded -like '~\*' -or $expanded -like '~/*') {
        $expanded = Join-Path $base $expanded.Substring(2)
    }
    if (-not [IO.Path]::IsPathRooted($expanded)) {
        $expanded = Join-Path $base $expanded
    }
    try { $full = [IO.Path]::GetFullPath($expanded) } catch { Throw-Fatal "Ungültiger Pfad: $Path" }
    $root = [IO.Path]::GetPathRoot($full)
    if ($full.TrimEnd('\') -ieq $root.TrimEnd('\')) { Throw-Fatal "Der Systempfad $full ist als Projektordner nicht erlaubt." }
    $full = $full.TrimEnd('\')
    if (-not $full) { Throw-Fatal 'Ungültiger Zielpfad.' }
    foreach ($bad in (Get-ForbiddenProjectPaths)) {
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
        $path = Show-Input 'Zielverzeichnis' 'Wohin soll die App installiert werden?' $defaultPath
        try {
            $full = Resolve-TargetPath $path
        } catch {
            Show-Message 'Ungültiger Pfad' $_.Exception.Message
            continue
        }
        $entries = @(Get-ChildItem -LiteralPath $full -Force -ErrorAction SilentlyContinue | Select-Object -First 1)
        if ($entries.Count -gt 0) {
            $isProject = Test-Path -LiteralPath (Join-Path $full 'app\package.json')
            $isKnown = ([string](Get-State 'install_dir')) -ieq $full
            if ($isProject -or $isKnown) { return $full }
            Show-Message 'Ordner nicht leer' "In $full liegen bereits fremde Dateien. Bitte einen anderen Pfad wählen."
            $defaultPath = $script:DefaultInstallDir
            continue
        }
        return $full
    }
}

function Set-NativePaths {
    param([string]$InstallRoot)
    $script:InstallRoot = $InstallRoot.TrimEnd('\')
    $script:AppDir = Join-Path $script:InstallRoot 'app'
    $script:NodeDir = Join-Path $script:InstallRoot 'node'
    $script:StartScript = Join-Path $script:InstallRoot 'start.cmd'
}

function Get-WindowsNodeArch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { $arch = 'ARM64' }
    switch ($arch) {
        'AMD64' { return 'x64' }
        'ARM64' { return 'arm64' }
        default { Throw-Fatal "Nicht unterstützte Architektur für Node.js: $arch." }
    }
}

function Get-NodeExeVersion {
    param([string]$NodeExe)
    if (-not (Test-Path -LiteralPath $NodeExe)) { return $null }
    $result = Invoke-Capture { & $NodeExe --version }
    if ($result.Code -ne 0) { return $null }
    return ($result.Output -replace '^v', '').Trim()
}

function Install-NodeRuntime {
    param([string]$TargetNodeDir)
    $nodeExe = Join-Path $TargetNodeDir 'node.exe'
    $current = Get-NodeExeVersion $nodeExe
    if ($current -and (Test-VersionAtLeast $current $script:NodeMinVersion)) {
        Write-Log "Vorhandenes Node.js $current wird verwendet: $nodeExe"
        return $nodeExe
    }

    $arch = Get-WindowsNodeArch
    $baseUrl = "https://nodejs.org/dist/latest-v$($script:NodeMajor).x"
    $shasumsUrl = "$baseUrl/SHASUMS256.txt"
    Write-Log "Lade Node.js-Prüfsummen: $shasumsUrl"
    $shasums = $null
    try {
        $shasums = (Invoke-WebRequest -Uri $shasumsUrl -UseBasicParsing -ErrorAction Stop).Content
    } catch {
        Throw-Fatal "Node.js-Prüfsummen konnten nicht geladen werden: $($_.Exception.Message)"
    }
    $pattern = '^([0-9a-fA-F]{64})\s+(node-v' + [regex]::Escape($script:NodeMajor) + '\.[0-9.]+-win-' + [regex]::Escape($arch) + '\.zip)\s*$'
    $match = [regex]::Match($shasums, $pattern, [Text.RegularExpressions.RegexOptions]::Multiline)
    if (-not $match.Success) {
        Throw-Fatal "Kein passendes Node.js-$($script:NodeMajor)-Archiv für $arch gefunden."
    }
    $expectedHash = $match.Groups[1].Value.ToLowerInvariant()
    $fileName = $match.Groups[2].Value
    $zipPath = Join-Path $env:TEMP $fileName
    Write-Log "Lade Node.js: $baseUrl/$fileName"

    $rc = Invoke-External 'Node.js herunterladen' "Invoke-WebRequest $baseUrl/$fileName" {
        Invoke-WebRequest -Uri "$baseUrl/$fileName" -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
    }
    if ($rc -ne 0 -or -not (Test-Path -LiteralPath $zipPath)) {
        Throw-Fatal 'Node.js konnte nicht heruntergeladen werden.'
    }
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        Throw-Fatal "SHA-256 von $fileName stimmt nicht. Download abgebrochen."
    }
    Write-Log "SHA-256 geprüft: $fileName"

    $extractDir = Join-Path $env:TEMP ('grillabend-node-' + [guid]::NewGuid().ToString('N'))
    try {
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force -ErrorAction Stop
        $root = Get-ChildItem -LiteralPath $extractDir -Directory -ErrorAction Stop | Select-Object -First 1
        if (-not $root) { Throw-Fatal 'Das Node.js-Archiv ist leer.' }
        if (Test-Path -LiteralPath $TargetNodeDir) {
            Remove-Item -LiteralPath $TargetNodeDir -Recurse -Force -ErrorAction Stop
        }
        New-Item -ItemType Directory -Force -Path $TargetNodeDir -ErrorAction Stop | Out-Null
        Get-ChildItem -LiteralPath $root.FullName -Force | Move-Item -Destination $TargetNodeDir -Force -ErrorAction Stop
    } catch {
        Throw-Fatal "Node.js konnte nicht entpackt werden: $($_.Exception.Message)"
    } finally {
        Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    }

    $installed = Get-NodeExeVersion $nodeExe
    if (-not $installed -or -not (Test-VersionAtLeast $installed $script:NodeMinVersion)) {
        Throw-Fatal "Node.js wurde installiert, meldet aber keine passende Version (gefunden: $installed)."
    }
    Write-Log "Node.js $installed installiert: $nodeExe"
    return $nodeExe
}

function Install-AppFiles {
    param([string]$TargetDir)
    $zipPath = Join-Path $env:TEMP ('grillabend-app-' + [guid]::NewGuid().ToString('N') + '.zip')
    $extractDir = Join-Path $env:TEMP ('grillabend-app-' + [guid]::NewGuid().ToString('N'))
    try {
        $rc = Invoke-External 'App herunterladen' "Invoke-WebRequest $script:RepoZipUrl" {
            Invoke-WebRequest -Uri $script:RepoZipUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
        }
        if ($rc -ne 0 -or -not (Test-Path -LiteralPath $zipPath)) {
            Throw-Fatal 'Die App konnte nicht von GitHub geladen werden.'
        }
        Expand-Archive -LiteralPath $zipPath -DestinationPath $extractDir -Force -ErrorAction Stop
        $root = Get-ChildItem -LiteralPath $extractDir -Directory -ErrorAction Stop | Select-Object -First 1
        if (-not $root -or -not (Test-Path -LiteralPath (Join-Path $root.FullName 'package.json'))) {
            Throw-Fatal 'Das App-Archiv ist unvollständig (package.json fehlt).'
        }
        if (Test-Path -LiteralPath $TargetDir) {
            Remove-Item -LiteralPath $TargetDir -Recurse -Force -ErrorAction Stop
        }
        New-Item -ItemType Directory -Force -Path $TargetDir -ErrorAction Stop | Out-Null
        foreach ($item in @('server.js', 'src', 'public', 'package.json', 'package-lock.json')) {
            $source = Join-Path $root.FullName $item
            if (-not (Test-Path -LiteralPath $source)) {
                Throw-Fatal "Im App-Archiv fehlt: $item"
            }
            Copy-Item -LiteralPath $source -Destination $TargetDir -Recurse -Force -ErrorAction Stop
        }
        Write-Log "App-Dateien installiert: $TargetDir"
    } finally {
        Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Invoke-NpmCi {
    param([string]$AppDir, [string]$NodeExe)
    $npmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $npmCli)) {
        Throw-Fatal "npm wurde neben Node.js nicht gefunden: $npmCli"
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $script:DataDir 'npm-cache') -ErrorAction SilentlyContinue | Out-Null
    $rc = Invoke-External 'npm-Abhängigkeiten installieren' 'npm ci --omit=dev --ignore-scripts' {
        Push-Location -LiteralPath $AppDir
        try {
            $env:Path = (Split-Path -Parent $NodeExe) + ';' + $env:Path
            $env:npm_config_cache = Join-Path $script:DataDir 'npm-cache'
            $env:npm_config_update_notifier = 'false'
            & $NodeExe $npmCli ci --omit=dev --ignore-scripts
        } finally {
            Pop-Location
        }
    }
    if ($rc -ne 0) {
        Throw-Fatal 'npm ci ist fehlgeschlagen. Internetverbindung und App-Archiv prüfen.'
    }
    Write-Log 'npm-Abhängigkeiten installiert.'
}

function Write-StartScript {
    param([string]$NodeExe, [string]$BindMode)
    $hostAddress = if ($BindMode -eq 'lan') { '0.0.0.0' } else { '127.0.0.1' }
    $lines = @(
        '@echo off',
        'setlocal',
        "cd /d `"$script:AppDir`"",
        'set "NODE_ENV=production"',
        "set `"PORT=$script:HostPort`"",
        "set `"HOST=$hostAddress`"",
        "set `"DATA_DIR=$script:DataDir`"",
        "if not exist `"$script:DataDir`" mkdir `"$script:DataDir`"",
        "if exist `"$script:DataDir\app.log`" move /y `"$script:DataDir\app.log`" `"$script:DataDir\app.log.1`" >nul 2>&1",
        "`"$NodeExe`" server.js >> `"$script:DataDir\app.log`" 2>&1",
        'endlocal'
    )
    Set-Content -LiteralPath $script:StartScript -Value $lines -Encoding ASCII -ErrorAction Stop
    Write-Log "Startskript geschrieben: $script:StartScript (HOST=$hostAddress, PORT=$script:HostPort)"
}

function Test-PortAvailable {
    $connection = Get-NetTCPConnection -LocalPort $script:HostPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($connection) {
        $processName = ''
        try {
            $proc = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
            if ($proc) { $processName = $proc.ProcessName }
        } catch {
        }
        Throw-Fatal "TCP-Port $script:HostPort ist belegt (Prozess: $processName, PID $($connection.OwningProcess)). Bitte den Dienst beenden oder einen anderen Port mit -Port wählen."
    }
    try {
        $lines = & netsh interface ipv4 show excludedportrange protocol=tcp 2>&1
        foreach ($line in $lines) {
            $m = [regex]::Match([string]$line, '^\s*(\d+)\s+(\d+)\s*$')
            if ($m.Success) {
                $start = [int]$m.Groups[1].Value
                $end = [int]$m.Groups[2].Value
                if ($script:HostPort -ge $start -and $script:HostPort -le $end) {
                    Throw-Fatal "TCP-Port $script:HostPort liegt im von Windows/Hyper-V reservierten Bereich $start-$end. Bitte den Bereich freigeben (z. B. 'net stop winnat' und 'net start winnat') und den Installer erneut starten."
                }
            }
        }
    } catch {
        Write-Log "Reservierte Portbereiche konnten nicht geprüft werden: $($_.Exception.Message)"
    }
}

function Register-AppTask {
    try {
        $action = New-ScheduledTaskAction -Execute $env:ComSpec -Argument "/c `"$script:StartScript`"" -WorkingDirectory $script:InstallRoot -ErrorAction Stop
        $trigger = New-ScheduledTaskTrigger -AtStartup -ErrorAction Stop
        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest -ErrorAction Stop
        $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -ErrorAction Stop
        Register-ScheduledTask -TaskName $script:TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force -ErrorAction Stop | Out-Null
        Set-State 'task' $true
        Write-Log "Geplante Aufgabe eingerichtet: $script:TaskName"
    } catch {
        Throw-Fatal "Die geplante Aufgabe konnte nicht eingerichtet werden: $($_.Exception.Message)"
    }
}

function Start-AppTask {
    try {
        Start-ScheduledTask -TaskName $script:TaskName -ErrorAction Stop
        Write-Log "Geplante Aufgabe gestartet: $script:TaskName"
    } catch {
        Throw-Fatal "Die App konnte nicht über die geplante Aufgabe gestartet werden: $($_.Exception.Message)"
    }
}

function Stop-AppTask {
    try {
        $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-Log "Geplante Aufgabe gestoppt: $script:TaskName"
        }
    } catch {
        Write-Log "Aufgabe konnte nicht gestoppt werden: $($_.Exception.Message)"
    }
}

function Remove-AppTask {
    try {
        $task = Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
        if ($task) {
            Stop-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue
            Unregister-ScheduledTask -TaskName $script:TaskName -Confirm:$false -ErrorAction Stop
        }
        Set-State 'task' $false
        Write-Log 'Geplante Aufgabe entfernt.'
    } catch {
        Write-Log "Geplante Aufgabe konnte nicht entfernt werden: $($_.Exception.Message)"
    }
}

function Test-AppHealth {
    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
        $code = 0
        try {
            $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$script:HostPort/api/session")
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
        if ($code -eq 200) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Show-AppLogTail {
    $log = Join-Path $script:DataDir 'app.log'
    if (-not (Test-Path -LiteralPath $log)) { return }
    $tail = Get-Content -LiteralPath $log -Tail 25 -ErrorAction SilentlyContinue
    if ($tail) {
        Show-Message 'App-Log (letzte Zeilen)' (($tail -join "`n"))
    }
}

function Backup-NativeDatabase {
    $db = Join-Path $script:DataDir 'app.sqlite'
    if (-not (Test-Path -LiteralPath $db)) {
        Write-Log 'Keine Datenbank zum Sichern vorhanden.'
        return
    }
    $backupDir = Join-Path $script:DataDir 'backups'
    New-Item -ItemType Directory -Force -Path $backupDir -ErrorAction Stop | Out-Null
    $name = 'app-{0}.sqlite' -f (Get-Date -Format 'yyyyMMdd-HHmmss')
    $target = Join-Path $backupDir $name
    Copy-Item -LiteralPath $db -Destination $target -Force -ErrorAction Stop
    Get-ChildItem -LiteralPath $backupDir -Filter 'app-*.sqlite' -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -Skip $script:BackupKeep |
        Remove-Item -Force -ErrorAction SilentlyContinue
    Show-Message 'Backup erstellt' "Die Datenbank wurde unter $target gesichert. Es werden die letzten $script:BackupKeep Backups behalten."
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
Die App läuft als geplante Aufgabe '$script:TaskName' unter SYSTEM.
Ersteinrichtung: $lanUrl
Lokal: http://127.0.0.1:$script:HostPort/setup

Wichtig: Die App spricht nur HTTP. Im LAN sind Zugangsdaten unverschlüsselt.
Für dauerhaften Betrieb einen HTTPS-Reverse-Proxy davorsetzen.

App:     $script:AppDir
Node.js: $script:NodeDir
Daten:   $script:DataDir
App-Log: $script:DataDir\app.log
Log:     $script:LogFile
Status:  $script:StateFile
"@
        if (-not (Get-State 'firewall_rule')) {
            $body += "`nHinweis: Es wurde keine Windows-Firewall-Regel angelegt; andere Geräte erreichen die App eventuell nicht."
        }
    } else {
        $body = @"
Die App läuft als geplante Aufgabe '$script:TaskName' unter SYSTEM, nur auf 127.0.0.1:$script:HostPort.
Ersteinrichtung: http://127.0.0.1:$script:HostPort/setup

Von anderen Geräten ist die App nicht erreichbar.

App:     $script:AppDir
Node.js: $script:NodeDir
Daten:   $script:DataDir
App-Log: $script:DataDir\app.log
Log:     $script:LogFile
Status:  $script:StateFile
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
    Set-NativePaths $dir
    Set-State 'install_dir' $dir
    Set-State 'data_dir' $script:DataDir
    Set-State 'port' $script:HostPort

    Set-State 'step' 'bind'
    if ($script:RequestedBind) {
        if (-not (Set-BindMode $script:RequestedBind $true)) {
            $script:RequestedBind = $null
            if (-not (Ask-BindMode ([string](Get-State 'bind')))) { return $false }
        }
    } elseif (-not $Resume -or -not (Get-State 'bind')) {
        if (-not (Ask-BindMode 'lan')) { return $false }
    } else {
        $script:BindMode = [string](Get-State 'bind')
        if (-not $script:BindMode) { $script:BindMode = 'lan' }
    }
    Set-State 'bind' $script:BindMode

    Set-State 'step' 'stop'
    Stop-AppTask

    Set-State 'step' 'node'
    $nodeExe = Install-NodeRuntime $script:NodeDir

    Set-State 'step' 'app'
    Install-AppFiles $script:AppDir

    Set-State 'step' 'npm'
    Invoke-NpmCi $script:AppDir $nodeExe

    Set-State 'step' 'port'
    Test-PortAvailable

    Set-State 'step' 'start-script'
    Write-StartScript $nodeExe $script:BindMode

    Set-State 'step' 'task'
    Register-AppTask
    Start-AppTask

    Set-State 'step' 'firewall'
    if ($script:BindMode -eq 'lan') {
        if (Get-State 'firewall_rule') { Ensure-FirewallRule }
    } else {
        Remove-FirewallRule
    }

    Set-State 'step' 'health'
    if (-not (Test-AppHealth)) {
        Show-AppLogTail
        Throw-Fatal "Die App antwortet nach 120 Sekunden nicht auf HTTP. Log prüfen: $script:DataDir\app.log"
    }

    Set-State 'step' 'done'
    Set-State 'bind' $script:BindMode
    Set-State 'install_dir' $dir
    Set-State 'data_dir' $script:DataDir
    Set-State 'port' $script:HostPort
    Show-AccessInfo
    return $true
}

function Resolve-ProjectForManagement {
    $dir = $null
    if (Get-State 'install_dir') { $dir = [string](Get-State 'install_dir') }
    elseif ($script:RequestedInstallDir) { $dir = $script:RequestedInstallDir }
    if (-not $dir -and (Test-Path -LiteralPath $script:DefaultInstallDir)) { $dir = $script:DefaultInstallDir }
    if (-not $dir) {
        $dir = Show-Input 'Projektordner' 'Wo liegt die bestehende Installation?' $script:DefaultInstallDir
    }
    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'app\package.json'))) {
        return (Resolve-TargetPath $dir)
    }
    if ($dir) {
        $dir = Show-Input 'Projektordner' 'Wo liegt die bestehende Installation?' $dir
        if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'app\package.json'))) {
            return (Resolve-TargetPath $dir)
        }
    }
    return $null
}

function Invoke-UpdateFlow {
    $dir = Resolve-ProjectForManagement
    if (-not $dir) {
        Show-Message 'Nicht gefunden' 'Es wurde keine bestehende Installation gefunden.'
        return $false
    }
    Set-NativePaths $dir
    $currentBind = [string](Get-State 'bind')
    if (-not $currentBind) { $currentBind = $script:BindMode }
    $script:BindMode = $currentBind
    Set-State 'mode' 'update'

    if (-not (Show-Confirm 'Aktualisieren' "Die Installation in $dir wird aktualisiert. Vorher wird ein Backup der Datenbank erstellt. Fortfahren?" $true)) { return $false }

    if (Show-Confirm 'Bindung ändern?' "Soll die Netzwerkbindung geändert werden? Aktuell: $currentBind." $false) {
        if (-not (Ask-BindMode $currentBind)) { return $false }
    } else {
        Set-State 'bind' $script:BindMode
    }

    Set-State 'step' 'update-stop'
    Stop-AppTask
    $staging = Join-Path $dir 'app.new'
    $backupApp = Join-Path $dir 'app.old'
    $nodeExe = $null
    try {
        Test-PortAvailable

        Set-State 'step' 'update-backup'
        Backup-NativeDatabase

        Set-State 'step' 'update-node'
        $nodeExe = Install-NodeRuntime $script:NodeDir

        Set-State 'step' 'update-app'
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $backupApp -Recurse -Force -ErrorAction SilentlyContinue
        Install-AppFiles $staging
        Invoke-NpmCi $staging $nodeExe

        Set-State 'step' 'update-swap'
        if (Test-Path -LiteralPath $script:AppDir) {
            Move-Item -LiteralPath $script:AppDir -Destination $backupApp -Force -ErrorAction Stop
        }
        Move-Item -LiteralPath $staging -Destination $script:AppDir -Force -ErrorAction Stop

        Set-State 'step' 'update-start-script'
        Write-StartScript $nodeExe $script:BindMode

        Set-State 'step' 'update-start'
        Register-AppTask
        Start-AppTask

        Set-State 'step' 'update-firewall'
        if ($script:BindMode -eq 'lan') {
            if (Get-State 'firewall_rule') { Ensure-FirewallRule }
        } else {
            Remove-FirewallRule
        }

        Set-State 'step' 'update-health'
        if (-not (Test-AppHealth)) {
            Show-AppLogTail
            throw 'Die aktualisierte App antwortet nach 120 Sekunden nicht auf HTTP.'
        }
        Remove-Item -LiteralPath $backupApp -Recurse -Force -ErrorAction SilentlyContinue
    } catch {
        $message = $_.Exception.Message
        Write-Log "Update fehlgeschlagen: $message"
        try { Stop-AppTask } catch { }
        if (Test-Path -LiteralPath $backupApp) {
            Remove-Item -LiteralPath $script:AppDir -Recurse -Force -ErrorAction SilentlyContinue
            Move-Item -LiteralPath $backupApp -Destination $script:AppDir -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath (Join-Path $script:AppDir 'package.json')) {
            try {
                Register-AppTask
                Start-AppTask
            } catch {
                Write-Log "Vorheriger Stand konnte nicht automatisch gestartet werden: $($_.Exception.Message)"
            }
        }
        Throw-Fatal "Update abgebrochen: $message Die Datenbank ist gesichert; der vorherige App-Stand wurde, falls vorhanden, wiederhergestellt."
    }

    Set-State 'step' 'done'
    Set-State 'install_dir' $dir
    Set-State 'bind' $script:BindMode
    Set-State 'port' $script:HostPort
    Show-Message 'Update abgeschlossen' "Die App läuft wieder. Ersteinrichtung/Anmeldung: http://127.0.0.1:$script:HostPort/setup`nApp-Log: $script:DataDir\app.log`nInstaller-Log: $script:LogFile"
    return $true
}

function Remove-ProjectDirSafely {
    param([string]$Dir)
    if (-not $Dir) { return }
    try { $fullPath = [IO.Path]::GetFullPath($Dir) } catch { Throw-Fatal "Sicherheitsabbruch: $Dir ist kein gültiger Pfad." }
    $root = [IO.Path]::GetPathRoot($fullPath)
    if ($fullPath.TrimEnd('\') -ieq $root.TrimEnd('\')) { Throw-Fatal "Sicherheitsabbruch: $fullPath wird nicht gelöscht." }
    $full = $fullPath.TrimEnd('\')
    if (-not $full) { Throw-Fatal 'Sicherheitsabbruch: Ungültiger Pfad.' }
    foreach ($bad in (Get-ForbiddenProjectPaths)) {
        if ($full -ieq $bad) { Throw-Fatal "Sicherheitsabbruch: $full wird nicht gelöscht." }
    }
    $isProject = Test-Path -LiteralPath (Join-Path $full 'app\package.json')
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
    if ($dir -and (Test-Path -LiteralPath (Join-Path $dir 'app\package.json'))) { $found = $true }
    if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) { $found = $true }
    if (Test-Path -LiteralPath $script:DataDir) { $found = $true }
    if (-not $found) {
        Show-Message 'Nichts zu entfernen' 'Es wurde keine Grillabend-Installation gefunden.'
        return
    }

    if ($Purge) {
        if (-not $Yes) {
            Show-Message 'Daten löschen' "Beim vollständigen Entfernen werden App, Node.js, die geplante Aufgabe, der Projektordner $dir, das Datenverzeichnis $script:DataDir und alle Backups gelöscht. Windows, PowerShell und andere Programme bleiben installiert."
            if (-not (Show-Confirm 'Wirklich alles löschen?' 'Diese Aktion kann nicht rückgängig gemacht werden.' $false)) { return }
        }
    } else {
        if (-not $Yes) {
            if (-not (Show-Confirm 'App entfernen' 'App, Node.js und die geplante Aufgabe werden entfernt. Daten und Backups bleiben erhalten. Fortfahren?' $true)) { return }
        }
    }

    Stop-AppTask
    Remove-AppTask
    Remove-FirewallRule

    if ($dir -and (Test-Path -LiteralPath $dir)) {
        Remove-ProjectDirSafely $dir
    }

    if ($Purge) {
        if (Test-Path -LiteralPath $script:DataDir) {
            $dataFull = [IO.Path]::GetFullPath($script:DataDir).TrimEnd('\')
            $dataRoot = [IO.Path]::GetPathRoot($dataFull).TrimEnd('\')
            if ($dataFull -ieq $dataRoot) { Throw-Fatal "Sicherheitsabbruch: $dataFull wird nicht gelöscht." }
            Remove-Item -LiteralPath $dataFull -Recurse -Force -ErrorAction Stop
        }
        Clear-State
        Show-Message 'Vollständig entfernt' "App, Node.js, Aufgabe, Projektordner, Daten und Backups wurden entfernt. Die Installer-Logs liegen unter $script:LogDir."
    } else {
        Clear-State
        Show-Message 'App entfernt' "App, Node.js und die geplante Aufgabe wurden entfernt. Daten und Backups bleiben unter $script:DataDir erhalten."
    }
}

function Test-Installed {
    if ((Get-State 'install_dir') -and (Test-Path -LiteralPath (Join-Path ([string](Get-State 'install_dir')) 'app\package.json'))) { return $true }
    if ($script:RequestedInstallDir -and (Test-Path -LiteralPath (Join-Path $script:RequestedInstallDir 'app\package.json'))) { return $true }
    if (Test-Path -LiteralPath (Join-Path $script:DefaultInstallDir 'app\package.json')) { return $true }
    if (Get-ScheduledTask -TaskName $script:TaskName -ErrorAction SilentlyContinue) { return $true }
    return $false
}

function Show-DeinstallMenu {
    $script:MenuDefault = $null
    $result = Show-Menu 'Deinstallieren' 'Was soll entfernt werden?' @(
        'App entfernen (Daten behalten)::App, Node.js und die Aufgabe entfernen; Daten und Backups bleiben.',
        'Alles löschen::Zusätzlich Datenverzeichnis und Backups löschen.',
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
                'Aktualisieren::App-Code und npm-Abhängigkeiten aktualisieren, Datenbank automatisch sichern.',
                'Neu installieren::App-Dateien neu einrichten; Node.js und Daten bleiben erhalten.',
                'Deinstallieren::App entfernen oder alle Daten löschen.',
                'Beenden::Installer schließen.'
            )
            switch ($result) {
                0 { if (Invoke-UpdateFlow) { return } }
                1 {
                    if (Show-Confirm 'Neu installieren' 'App-Dateien und npm-Abhängigkeiten werden neu eingerichtet; Node.js und Daten bleiben erhalten. Fortfahren?' $true) {
                        if (Invoke-InstallFlow) { return }
                    }
                }
                2 { if (Show-DeinstallMenu) { return } }
                default { return }
            }
        } else {
            $result = Show-Menu 'Hauptmenü' 'Willkommen beim Bare-Metal-Installer.' @(
                'Installieren::Node.js und die App ohne Docker einrichten.',
                'Deinstallieren::Vorhandene Reste entfernen.',
                'Beenden::Installer schließen.'
            )
            switch ($result) {
                0 { if (Invoke-InstallFlow) { return } }
                1 { if (Show-DeinstallMenu) { return } }
                default { return }
            }
        }
    }
}

function Invoke-SelfTest {
    $root = Join-Path $env:TEMP ('grillabend-selftest-' + [guid]::NewGuid().ToString('N'))
    $script:SelfTestMode = $true
    $script:InstallRoot = $root
    Set-NativePaths $root
    $script:DataDir = Join-Path $root 'data'
    $script:HostPort = 1625
    $script:LogFile = Join-Path $root 'selftest.log'
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    Set-Content -LiteralPath $script:LogFile -Value '' -Encoding UTF8
    Write-Log 'SelfTest gestartet.'
    $nodeExe = $null
    $proc = $null
    try {
        $nodeExe = Install-NodeRuntime $script:NodeDir
        Install-AppFiles $script:AppDir
        Invoke-NpmCi $script:AppDir $nodeExe
        $env:NODE_ENV = 'production'
        $env:PORT = [string]$script:HostPort
        $env:HOST = '127.0.0.1'
        $env:DATA_DIR = $script:DataDir
        $outLog = Join-Path $root 'selftest-app.out.log'
        $errLog = Join-Path $root 'selftest-app.err.log'
        $proc = Start-Process -FilePath $nodeExe -ArgumentList 'server.js' -WorkingDirectory $script:AppDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
        if (-not (Test-AppHealth)) {
            foreach ($log in @($outLog, $errLog)) {
                if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 20 | Out-Host }
            }
            throw 'SelfTest: Health-Check fehlgeschlagen.'
        }
        Write-Host 'SELFTEST OK' -ForegroundColor Green
        Write-Host "Node: $((& $nodeExe --version))"
        Write-Host "App:  $script:AppDir"
        return 0
    } catch {
        Write-Host "SELFTEST FEHLER: $($_.Exception.Message)" -ForegroundColor Red
        return 1
    } finally {
        if ($proc) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
        Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
    }
}

if ($SelfTest) {
    exit (Invoke-SelfTest)
}

try {
    Initialize-StateDir
    Read-State
    Initialize-Tui
    Assert-Windows

    $savedPort = Get-State 'port'
    if ($savedPort -and $PSBoundParameters.ContainsKey('Port') -eq $false -and $Port -eq 1621) {
        $script:HostPort = [int]$savedPort
        $script:FirewallRuleName = "Grillabend-Anmeldung (TCP $script:HostPort)"
    }

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
