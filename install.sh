#!/usr/bin/env bash
#
# Grillabend-Anmeldung – interaktiver Installer für Debian/Ubuntu.
# Richtet Docker (offizielles Repository), das Projekt, das Daten-Volume,
# Autostart, Updates und eine vollständige Deinstallation ein.
#
# Aufruf:
#   sudo bash install.sh
#   sudo bash install.sh --uninstall
#   sudo bash install.sh --purge
#
set -uo pipefail

INSTALLER_VERSION="1.0.0"
APP_NAME="Grillabend-Anmeldung"
CONTAINER_NAME="grillabend"
VOLUME_NAME="grillabend-data"
IMAGE_NAME="ghcr.io/anigx/grillabend-anmeldung:latest"
HOST_PORT="1621"
REPO_URL="https://github.com/Anigx/Grillabend-Anmeldung.git"
REPO_BRANCH="main"
STATE_DIR="/var/lib/grillabend-installer"
STATE_FILE="$STATE_DIR/state"
LOG_DIR="/var/log/grillabend-installer"
DEFAULT_INSTALL_DIR="/opt/grillabend"
BACKUP_KEEP="5"
COMPOSE_MIN_VERSION="2.24.4"

MODE="install"
BIND_ARG=""
INSTALL_DIR_ARG=""
ASSUME_YES="0"
USE_COLOR="1"

UI_ACTIVE="0"
UI_COLS="80"
UI_LINES="24"
STTY_SAVED=""
LOG_FILE=""
MENU_RESULT="0"
MENU_DEFAULT="0"
UI_INPUT=""
PROJECT_DIR=""
BIND_MODE="local"
FINAL_HINT=""
DOCKER_DISTRO=""
DOCKER_CODENAME=""

if [[ -t 1 ]]; then
    PINK=$'\033[38;5;205m'
    CYAN=$'\033[38;5;51m'
    RED=$'\033[38;5;196m'
    GRAY=$'\033[38;5;244m'
    BOLD=$'\033[1m'
    RESET=$'\033[0m'
else
    PINK=""; CYAN=""; RED=""; GRAY=""; BOLD=""; RESET=""
fi

usage() {
    cat <<'EOF'
Grillabend-Anmeldung – Installer für Debian/Ubuntu

Aufruf:
  sudo bash install.sh                 Interaktive TUI (Installieren/Aktualisieren/Entfernen)
  sudo bash install.sh --uninstall     App entfernen, Projektordner und Daten behalten
  sudo bash install.sh --purge         App, Projektordner, Backups und Daten löschen
  sudo bash install.sh --help          Diese Hilfe anzeigen
  sudo bash install.sh --version       Installer-Version anzeigen

Optionen:
  --install-dir PFAD    Zielverzeichnis vorbelegen (Standard: /opt/grillabend)
  --bind local|lan      Host-Bindung vorbelegen (Standard: local)
  --yes                 Sicherheitsabfragen bei --uninstall/--purge überspringen
  --no-color            Farben deaktivieren

Der Installer benötigt root-Rechte und ein interaktives Terminal.
Status: /var/lib/grillabend-installer/state
Logs:   /var/log/grillabend-installer/
EOF
}

for arg in "$@"; do
    case "$arg" in
        --help|-h) usage; exit 0 ;;
        --version) printf '%s\n' "$INSTALLER_VERSION"; exit 0 ;;
        --uninstall) MODE="uninstall" ;;
        --purge) MODE="purge" ;;
        --yes|-y) ASSUME_YES="1" ;;
        --no-color) USE_COLOR="0" ;;
        --install-dir=*) INSTALL_DIR_ARG="${arg#*=}" ;;
        --bind=*)
            BIND_ARG="${arg#*=}"
            if [[ "$BIND_ARG" != "local" && "$BIND_ARG" != "lan" ]]; then
                printf 'Ungültiger Wert für --bind: %s\n' "$BIND_ARG" >&2
                exit 2
            fi
            ;;
        *)
            printf 'Unbekannte Option: %s\n\n' "$arg" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ "$USE_COLOR" == "0" ]]; then
    PINK=""; CYAN=""; RED=""; GRAY=""; BOLD=""; RESET=""
fi

SELF="$0"
if command -v readlink >/dev/null 2>&1; then
    SELF="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
fi

if [[ "$EUID" -ne 0 ]]; then
    if command -v sudo >/dev/null 2>&1; then
        if [[ "$SELF" == "bash" || "$SELF" == "/dev/fd/"* ]]; then
            printf 'Bitte den Installer als Datei starten, z. B.:\n' >&2
            printf '  curl -fsSL https://raw.githubusercontent.com/Anigx/Grillabend-Anmeldung/main/install.sh -o /tmp/grillabend-install.sh\n' >&2
            printf '  bash /tmp/grillabend-install.sh\n' >&2
            exit 1
        fi
        exec sudo -- bash "$SELF" "$@"
    fi
    printf 'Bitte als root ausführen (sudo bash %s).\n' "$SELF" >&2
    exit 1
fi

log_line() {
    [[ -n "${LOG_FILE:-}" ]] || return 0
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >>"$LOG_FILE" 2>/dev/null || true
}

state_dir_init() {
    mkdir -p "$STATE_DIR" "$LOG_DIR" || {
        printf 'Verzeichnisse %s und %s konnten nicht angelegt werden.\n' "$STATE_DIR" "$LOG_DIR" >&2
        exit 1
    }
    chmod 700 "$STATE_DIR" 2>/dev/null || true
    chmod 750 "$LOG_DIR" 2>/dev/null || true
    LOG_FILE="$LOG_DIR/install-$(date '+%Y%m%d-%H%M%S').log"
    : >"$LOG_FILE" 2>/dev/null || LOG_FILE=""
}

declare -A STATE=()

state_load() {
    STATE=()
    [[ -f "$STATE_FILE" ]] || return 1
    local key value
    while IFS='=' read -r key value; do
        [[ -z "$key" || "$key" == \#* ]] && continue
        STATE["$key"]="$value"
    done <"$STATE_FILE"
    return 0
}

state_save() {
    mkdir -p "$STATE_DIR" 2>/dev/null || true
    local tmp
    tmp="$(mktemp "$STATE_DIR/.state.XXXXXX")" || return 1
    local key
    {
        printf 'version=%s\n' "$INSTALLER_VERSION"
        for key in "${!STATE[@]}"; do
            [[ "$key" == "version" ]] && continue
            printf '%s=%s\n' "$key" "${STATE[$key]}"
        done
    } >"$tmp"
    chmod 600 "$tmp" 2>/dev/null || true
    mv -f "$tmp" "$STATE_FILE"
}

state_clear() {
    STATE=()
    rm -f "$STATE_FILE"
}

state_set() {
    STATE["$1"]="$2"
    state_save
}

state_get() {
    printf '%s' "${STATE[$1]:-}"
}

version_ge() {
    local have="${1#v}"
    local need="${2#v}"
    printf '%s\n%s\n' "$need" "$have" | sort -V -C
}

ui_read_key() {
    local key rest
    IFS= read -rsn1 key || key=""
    if [[ "$key" == $'\x1b' ]]; then
        IFS= read -rsn2 -t 0.1 rest || rest=""
        key="ESC$rest"
    fi
    printf '%s' "$key"
}

ui_size() {
    local size
    size="$(stty size 2>/dev/null || true)"
    if [[ "$size" =~ ^([0-9]+)[[:space:]]+([0-9]+)$ ]]; then
        UI_LINES="${BASH_REMATCH[1]}"
        UI_COLS="${BASH_REMATCH[2]}"
    else
        UI_LINES="24"
        UI_COLS="80"
    fi
}

ui_goto() {
    printf '\033[%s;%sH' "$1" "$2"
}

ui_clear() {
    printf '\033[2J\033[H'
}

ui_cleanup() {
    if [[ "$UI_ACTIVE" == "1" ]]; then
        if [[ -n "$STTY_SAVED" ]]; then
            stty "$STTY_SAVED" 2>/dev/null || true
        fi
        printf '\033[?25h\033[?1049l'
        UI_ACTIVE="0"
    fi
}

ui_init() {
    if [[ ! -t 0 || ! -t 1 ]]; then
        printf 'Die interaktive TUI benötigt ein Terminal.\n' >&2
        exit 1
    fi
    if [[ "$(tput colors 2>/dev/null || printf '0')" -lt 8 ]]; then
        PINK=""; CYAN=""; RED=""; GRAY=""; BOLD=""; RESET=""
    fi
    STTY_SAVED="$(stty -g)"
    printf '\033[?1049h\033[?25l'
    stty -echo -icanon min 1 time 0
    UI_ACTIVE="1"
    trap 'ui_cleanup; exit 130' INT TERM
    trap 'ui_cleanup' EXIT
    ui_size
}

ui_suspend() {
    if [[ "$UI_ACTIVE" == "1" ]]; then
        if [[ -n "$STTY_SAVED" ]]; then
            stty "$STTY_SAVED" 2>/dev/null || true
        fi
        printf '\033[?25h\033[?1049l'
        UI_ACTIVE="0"
    fi
}

ui_resume() {
    if [[ ! -t 0 || ! -t 1 ]]; then
        return 0
    fi
    STTY_SAVED="$(stty -g)"
    printf '\033[?1049h\033[?25l'
    stty -echo -icanon min 1 time 0
    UI_ACTIVE="1"
    ui_size
    ui_clear
}

ui_header() {
    local title=" $APP_NAME - Installer $INSTALLER_VERSION "
    local width=$((UI_COLS - 2))
    local pad=$((width - ${#title}))
    (( pad < 0 )) && pad=0
    printf '%s+%s+%s\n' "$PINK" "$(printf '%*s' "$width" '' | tr ' ' '-')" "$RESET"
    printf '%s|%s%s%s%*s%s|%s\n' "$PINK" "$RESET" "$CYAN" "$title" "$pad" '' "$PINK" "$RESET"
    printf '%s+%s+%s\n' "$PINK" "$(printf '%*s' "$width" '' | tr ' ' '-')" "$RESET"
}

ui_footer() {
    local text="$1"
    local row=$((UI_LINES - 2))
    ui_goto "$row" 1
    printf '\033[K%s%s%s' "$GRAY" "$text" "$RESET"
}

ui_draw_wrapped() {
    local text="$1"
    local width=$((UI_COLS - 6))
    (( width < 20 )) && width=20
    printf '%s\n' "$text" | fold -s -w "$width" | while IFS= read -r line; do
        printf '  %s\n' "$line"
    done
}

ui_message() {
    local title="$1"
    local body="$2"
    ui_clear
    ui_header
    printf '\n %s%s%s\n\n' "$CYAN$BOLD" "$title" "$RESET"
    ui_draw_wrapped "$body"
    printf '\n'
    ui_footer "Enter, Leertaste oder q zum Fortfahren"
    local key
    while true; do
        key="$(ui_read_key)"
        case "$key" in
            ""|" "|$'\r'|$'\n'|"q"|"Q") break ;;
        esac
    done
}

ui_pause() {
    local text="${1:-Enter zum Fortfahren}"
    ui_suspend
    printf '\n%s\n' "$text"
    IFS= read -r _ || true
    ui_resume
}

ui_input() {
    local title="$1"
    local prompt="$2"
    local default="${3:-}"
    ui_suspend
    printf '\033[2J\033[H'
    printf '%s%s%s\n\n' "$CYAN$BOLD" "$title" "$RESET"
    printf '%s\n\n' "$prompt"
    if [[ -n "$default" ]]; then
        printf '%s[Standard: %s]%s\n' "$GRAY" "$default" "$RESET"
    fi
    printf '> '
    IFS= read -r UI_INPUT || UI_INPUT=""
    ui_resume
    if [[ -z "$UI_INPUT" && -n "$default" ]]; then
        UI_INPUT="$default"
    fi
}

ui_confirm() {
    local title="$1"
    local question="$2"
    local default="${3:-yes}"
    local items=("Ja::Bestätigen" "Nein::Abbrechen")
    MENU_DEFAULT="0"
    [[ "$default" == "no" ]] && MENU_DEFAULT="1"
    ui_menu "$title" "$question" "${items[@]}"
    local result="$MENU_RESULT"
    MENU_DEFAULT="0"
    [[ "$result" == "0" ]]
}

ui_typed_confirm() {
    local title="$1"
    local question="$2"
    local expected="$3"
    local answer
    while true; do
        ui_input "$title" "$question (tippe $expected)" ""
        answer="${UI_INPUT^^}"
        if [[ "$answer" == "$expected" ]]; then
            return 0
        fi
        if [[ -z "$answer" ]]; then
            return 1
        fi
        ui_message "Nicht bestätigt" "Die Eingabe stimmte nicht mit $expected überein."
    done
}

ui_menu() {
    local title="$1"
    shift
    local question="${1:-}"
    [[ $# -gt 0 ]] && shift
    local -a items=("$@")
    local count=${#items[@]}
    local selected="${MENU_DEFAULT:-0}"
    MENU_DEFAULT="0"
    if (( selected < 0 || selected >= count )); then
        selected=0
    fi
    local key
    if (( count == 0 )); then
        MENU_RESULT="-1"
        return 0
    fi
    while true; do
        ui_size
        ui_clear
        ui_header
        printf '\n %s%s%s\n\n' "$CYAN$BOLD" "$title" "$RESET"
        [[ -n "$question" ]] && { ui_draw_wrapped "$question"; printf '\n'; }
        local i label desc marker
        for ((i = 0; i < count; i++)); do
            label="${items[$i]%%::*}"
            if (( i == selected )); then
                marker=">"
                printf '  %s%s %s %s%s\n' "$PINK" "$marker" "$label" "$RESET" ""
            else
                marker=" "
                printf '    %s\n' "$label"
            fi
        done
        desc="${items[$selected]#*::}"
        [[ "$desc" == "${items[$selected]}" ]] && desc=""
        printf '\n'
        if [[ -n "$desc" ]]; then
            ui_draw_wrapped "$desc"
        fi
        ui_footer "↑/↓ oder j/k wählen · Enter bestätigen · q beenden"
        key="$(ui_read_key)"
        case "$key" in
            "ESC[A"|"ESCOA"|"k"|"K") (( selected = (selected - 1 + count) % count )) ;;
            "ESC[B"|"ESCOB"|"j"|"J") (( selected = (selected + 1) % count )) ;;
            ""|$'\r'|$'\n')
                MENU_RESULT="$selected"
                return 0
                ;;
            "q"|"Q"|"ESC")
                MENU_RESULT="-1"
                return 0
                ;;
            [1-9])
                if (( key - 1 < count )); then
                    selected=$((key - 1))
                fi
                ;;
        esac
    done
}

die() {
    log_line "FEHLER: $*"
    if [[ "$UI_ACTIVE" == "1" ]]; then
        ui_message "Fehler" "$*"
        ui_cleanup
    fi
    printf 'Fehler: %s\n' "$*" >&2
    if [[ -n "${LOG_FILE:-}" ]]; then
        printf 'Details: %s\n' "$LOG_FILE" >&2
    fi
    exit 1
}

warn() {
    log_line "WARNUNG: $*"
    if [[ "$UI_ACTIVE" == "1" ]]; then
        ui_message "Hinweis" "$*"
    else
        printf 'Hinweis: %s\n' "$*" >&2
    fi
}

run_external() {
    local title="$1"
    shift
    log_line "Befehl: $*"
    ui_suspend
    printf '\033[2J\033[H'
    printf '%s== %s ==%s\n\n' "$CYAN$BOLD" "$title" "$RESET"
    printf '%s$ %s%s\n\n' "$GRAY" "$*" "$RESET"
    "$@" 2>&1 | tee -a "$LOG_FILE"
    local rc=${PIPESTATUS[0]}
    if (( rc != 0 )); then
        printf '\n%sFehler (Exit-Code %d).%s\n' "$RED" "$rc" "$RESET"
        printf 'Enter zum Fortfahren ... '
        IFS= read -r _ || true
    fi
    ui_resume
    return "$rc"
}

os_check() {
    local kernel arch
    kernel="$(uname -s 2>/dev/null || true)"
    if [[ "$kernel" != "Linux" ]]; then
        die "Dieser Installer unterstützt nur Linux (erkannt: ${kernel:-unbekannt})."
    fi
    if grep -qi microsoft /proc/version 2>/dev/null; then
        die "WSL wird nicht unterstützt. Nutze unter Windows bitte install.ps1 mit Docker Desktop."
    fi
    arch="$(uname -m 2>/dev/null || true)"
    if [[ "$arch" != "x86_64" && "$arch" != "amd64" ]]; then
        die "Das veröffentlichte Image gibt es nur für linux/amd64. Erkannte Architektur: $arch."
    fi
    if [[ ! -r /etc/os-release ]]; then
        die "/etc/os-release fehlt; Debian/Ubuntu wird erwartet."
    fi
    # shellcheck disable=SC1091
    . /etc/os-release
    case " ${ID:-} ${ID_LIKE:-} " in
        *" ubuntu "*)
            DOCKER_DISTRO="ubuntu"
            DOCKER_CODENAME="${UBUNTU_CODENAME:-${VERSION_CODENAME:-}}"
            ;;
        *" debian "*)
            DOCKER_DISTRO="debian"
            DOCKER_CODENAME="${VERSION_CODENAME:-}"
            ;;
        *)
            die "Nur Debian und Ubuntu werden unterstützt (erkannt: ${PRETTY_NAME:-${ID:-unbekannt}})."
            ;;
    esac
    if [[ -z "$DOCKER_CODENAME" ]]; then
        die "Die Distribution hat keinen erkennbaren Codename (VERSION_CODENAME)."
    fi
    if ! command -v apt-get >/dev/null 2>&1 || ! command -v dpkg >/dev/null 2>&1; then
        die "apt-get/dpkg fehlen; Debian/Ubuntu wird erwartet."
    fi
}

confirm_existing_project() {
    local dir="$1"
    if [[ -f "$dir/compose.yaml" && -d "$dir/.git" ]]; then
        return 0
    fi
    return 1
}

ask_target_dir() {
    local default="${INSTALL_DIR_ARG:-${STATE[install_dir]:-$DEFAULT_INSTALL_DIR}}"
    local path
    while true; do
        ui_input "Zielverzeichnis" "Wohin soll das Projekt installiert werden?" "$default"
        path="$UI_INPUT"
        path="${path/#\~\//$HOME/}"
        if [[ -z "$path" || "$path" != /* ]]; then
            ui_message "Ungültiger Pfad" "Bitte einen absoluten Pfad angeben, z. B. /opt/grillabend."
            continue
        fi
        if [[ "$path" == "/" || "$path" == "/opt" || "$path" == "/usr" || "$path" == "/var" ]]; then
            ui_message "Ungültiger Pfad" "Dieser Systempfad ist als Projektordner nicht erlaubt."
            continue
        fi
        if ! mkdir -p -- "$path" 2>/dev/null; then
            ui_message "Nicht beschreibbar" "Das Verzeichnis $path konnte nicht angelegt werden."
            continue
        fi
        path="$(cd -- "$path" && pwd -P)" || {
            ui_message "Ungültiger Pfad" "Das Verzeichnis konnte nicht aufgelöst werden."
            continue
        }
        if [[ -n "$(find "$path" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
            if confirm_existing_project "$path"; then
                PROJECT_DIR="$path"
                return 0
            fi
            ui_message "Ordner nicht leer" "In $path liegen bereits fremde Dateien. Bitte einen anderen Pfad wählen."
            default="$DEFAULT_INSTALL_DIR"
            continue
        fi
        PROJECT_DIR="$path"
        return 0
    done
}

configure_ufw() {
    if [[ "$(state_get ufw_rule)" == "1" ]]; then
        return 0
    fi
    if ! command -v ufw >/dev/null 2>&1; then
        return 0
    fi
    if ! ufw status 2>/dev/null | grep -q "Status: active"; then
        return 0
    fi
    if ui_confirm "Firewall-Regel" "ufw ist aktiv. Soll TCP ${HOST_PORT} für die App freigegeben werden? Docker kann ufw-Regeln für veröffentlichte Ports umgehen; die Regel ist nur ein zusätzlicher Hinweis."; then
        if run_external "ufw-Regel anlegen" ufw allow "${HOST_PORT}/tcp" comment "Grillabend"; then
            state_set ufw_rule "1"
        fi
    fi
}

remove_ufw_rule() {
    if [[ "$(state_get ufw_rule)" != "1" ]]; then
        return 0
    fi
    if command -v ufw >/dev/null 2>&1; then
        if run_external "ufw-Regel entfernen" ufw delete allow "${HOST_PORT}/tcp"; then
            state_set ufw_rule "0"
        else
            warn "Die ufw-Regel konnte nicht entfernt werden."
        fi
    else
        state_set ufw_rule "0"
    fi
}

confirm_lan_warning() {
    ui_message "Sicherheitshinweis LAN" "Im LAN ist die App ohne TLS erreichbar. Passwörter und Sitzungs-Cookies können im Netz mitgelesen werden. Die App hat außerdem keinen Origin-/CSRF-Schutz. Nutze LAN nur in einem vertrauenswürdigen Netz oder besser einen HTTPS-Reverse-Proxy."
    ui_typed_confirm "LAN wirklich aktivieren?" "Tippe JA, um die App auf 0.0.0.0:${HOST_PORT} freizugeben." "JA"
}

ask_bind_mode() {
    local default="${STATE[bind]:-$BIND_ARG}"
    [[ -z "$default" ]] && default="local"
    MENU_DEFAULT="0"
    [[ "$default" == "lan" ]] && MENU_DEFAULT="1"
    local result
    while true; do
        ui_menu "Netzwerkbindung" "Wie soll die App erreichbar sein?" \
            "Nur lokal (127.0.0.1)::Empfohlen. Ein Reverse Proxy auf diesem Server kann auf die App zeigen." \
            "Im LAN (0.0.0.0)::Nur in einem vertrauenswürdigen Netz. Die App spricht HTTP ohne TLS."
        result="$MENU_RESULT"
        case "$result" in
            0)
                BIND_MODE="local"
                state_set bind "local"
                remove_ufw_rule
                return 0
                ;;
            1)
                if ! confirm_lan_warning; then
                    MENU_DEFAULT="0"
                    continue
                fi
                BIND_MODE="lan"
                state_set bind "lan"
                configure_ufw
                return 0
                ;;
            -1)
                return 1
                ;;
        esac
    done
}

ensure_tool() {
    local tool="$1"
    local package="$2"
    if command -v "$tool" >/dev/null 2>&1; then
        return 0
    fi
    if ! ui_confirm "Voraussetzung fehlt" "$tool ist nicht installiert. Soll es jetzt aus dem Debian/Ubuntu-Repository installiert werden?"; then
        die "$tool wird benötigt. Installation abgebrochen."
    fi
    run_external "Paketlisten aktualisieren" env DEBIAN_FRONTEND=noninteractive apt-get update || die "apt-get update ist fehlgeschlagen."
    run_external "$tool installieren" env DEBIAN_FRONTEND=noninteractive apt-get install -y "$package" || die "$tool konnte nicht installiert werden."
    command -v "$tool" >/dev/null 2>&1 || die "$tool ist nach der Installation nicht verfügbar."
}

ensure_prerequisites() {
    ensure_tool git git
    ensure_tool curl curl
}

setup_docker_repo() {
    local keyring="/etc/apt/keyrings/docker.asc"
    local arch
    arch="$(dpkg --print-architecture)"
    run_external "Docker-Repository vorbereiten" env DEBIAN_FRONTEND=noninteractive apt-get update || die "apt-get update ist fehlgeschlagen."
    run_external "Docker-Abhängigkeiten installieren" env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl gnupg || die "Docker-Abhängigkeiten konnten nicht installiert werden."
    install -m 0755 -d /etc/apt/keyrings
    run_external "Docker-Schlüssel laden" curl -fsSL "https://download.docker.com/linux/${DOCKER_DISTRO}/gpg" -o "$keyring" || die "Docker-GPG-Schlüssel konnte nicht geladen werden."
    chmod a+r "$keyring"
    printf 'deb [arch=%s signed-by=%s] https://download.docker.com/linux/%s %s stable\n' \
        "$arch" "$keyring" "$DOCKER_DISTRO" "$DOCKER_CODENAME" > /etc/apt/sources.list.d/docker.list
    run_external "apt-Paketlisten aktualisieren" env DEBIAN_FRONTEND=noninteractive apt-get update || die "Das Docker-Repository konnte nicht eingelesen werden."
}

ensure_docker_daemon() {
    if docker info >/dev/null 2>&1; then
        return 0
    fi
    if command -v systemctl >/dev/null 2>&1; then
        run_external "Docker-Dienst starten" systemctl enable --now docker || die "Docker-Dienst konnte nicht gestartet werden."
    else
        die "systemd/systemctl fehlt. Docker kann auf diesem System nicht gestartet werden."
    fi
    local i
    for i in $(seq 1 60); do
        if docker info >/dev/null 2>&1; then
            return 0
        fi
        sleep 2
    done
    die "Der Docker-Daemon ist nach 120 Sekunden nicht erreichbar."
}

check_compose_version() {
    local version
    version="$(docker compose version --short 2>/dev/null || true)"
    if [[ -z "$version" ]]; then
        die "Docker Compose v2 ist nicht verfügbar."
    fi
    if ! version_ge "$version" "$COMPOSE_MIN_VERSION"; then
        die "Docker Compose ${version} ist zu alt (benötigt >= ${COMPOSE_MIN_VERSION}). Bitte Docker aktualisieren."
    fi
    log_line "Docker Compose Version: $version"
}

ensure_docker() {
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        ensure_docker_daemon
        check_compose_version
        return 0
    fi

    if ! command -v docker >/dev/null 2>&1; then
        if ! ui_confirm "Docker fehlt" "Docker Engine ist nicht installiert. Soll es jetzt aus dem offiziellen Docker-Repository installiert werden?"; then
            die "Docker wird für die Installation benötigt."
        fi
        setup_docker_repo
        run_external "Docker Engine installieren" env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || die "Docker Engine konnte nicht installiert werden."
        ensure_docker_daemon
        check_compose_version
        return 0
    fi

    local docker_path
    docker_path="$(command -v docker)"
    if [[ "$docker_path" == /snap/* ]]; then
        die "Docker wurde per Snap installiert. Bitte Docker Compose v2 aus dem offiziellen Repository installieren oder Snap-Docker entfernen."
    fi

    if ! ui_confirm "Docker Compose fehlt" "Docker ist vorhanden, aber 'docker compose' funktioniert nicht. Soll das Compose-Plugin aus dem offiziellen Docker-Repository installiert werden?"; then
        die "Docker Compose v2 wird benötigt."
    fi
    setup_docker_repo
    run_external "Docker Compose installieren" env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin docker-buildx-plugin || die "Docker Compose v2 konnte nicht installiert werden."
    ensure_docker_daemon
    check_compose_version
}

run_compose() {
    local dir="$1"
    shift
    # shellcheck disable=SC2016
    run_external "Docker Compose: $*" bash -c 'cd "$1" && shift && exec docker compose "$@"' _ "$dir" "$@"
}

compose_quiet() {
    local dir="$1"
    shift
    (cd "$dir" && docker compose "$@") >/dev/null 2>&1
}

container_exists() {
    docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"
}

container_running() {
    docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CONTAINER_NAME"
}

volume_exists() {
    docker volume ls --format '{{.Name}}' 2>/dev/null | grep -qx "$VOLUME_NAME"
}

port_in_use() {
    if container_running; then
        return 1
    fi
    if command -v ss >/dev/null 2>&1; then
        ss -ltnH "sport = :${HOST_PORT}" 2>/dev/null | grep -q .
        return $?
    fi
    if command -v lsof >/dev/null 2>&1; then
        lsof -nP -iTCP:"${HOST_PORT}" -sTCP:LISTEN >/dev/null 2>&1
        return $?
    fi
    return 1
}

check_port() {
    if port_in_use; then
        if command -v ss >/dev/null 2>&1; then
            log_line "Portbelegung: $(ss -ltnp "sport = :${HOST_PORT}" 2>/dev/null || true)"
        fi
        die "TCP-Port ${HOST_PORT} ist bereits belegt. Bitte den belegenden Dienst beenden; der Installer ändert den Port nicht."
    fi
}

write_compose_override() {
    local dir="$1"
    local file="$dir/compose.override.yaml"
    local marker="# Verwaltet vom Grillabend-Installer."
    if [[ -f "$file" ]] && ! grep -qF "$marker" "$file"; then
        die "$file existiert bereits und wurde nicht vom Installer erstellt. Bitte manuell prüfen."
    fi
    if [[ "$BIND_MODE" == "lan" ]]; then
        {
            printf '%s\n' "$marker"
            printf '%s\n' "services:"
            printf '%s\n' "  grillabend:"
            printf '%s\n' "    ports: !override"
            printf '%s\n' "      - \"0.0.0.0:${HOST_PORT}:80\""
        } >"$file"
        log_line "Compose-Override für LAN geschrieben: 0.0.0.0:${HOST_PORT}->80"
    else
        if [[ -f "$file" ]] && grep -qF "$marker" "$file"; then
            rm -f "$file"
            log_line "Compose-Override entfernt; Bindung bleibt 127.0.0.1:${HOST_PORT}."
        fi
    fi
}

write_git_excludes() {
    local dir="$1"
    local info="$dir/.git/info"
    [[ -d "$info" ]] || return 0
    local item
    for item in "compose.override.yaml" "backups/"; do
        grep -qxF "$item" "$info/exclude" 2>/dev/null || printf '%s\n' "$item" >>"$info/exclude"
    done
}

clone_project() {
    local dir="$1"
    if [[ -d "$dir/.git" && -f "$dir/compose.yaml" ]]; then
        log_line "Bestehendes Projekt erkannt: $dir"
        run_external "Projekt aktualisieren" git -c safe.directory="$dir" -C "$dir" pull --ff-only \
            || warn "git pull ist fehlgeschlagen; die vorhandenen Projektdateien werden verwendet."
        PROJECT_DIR="$dir"
        write_git_excludes "$PROJECT_DIR"
        return 0
    fi
    if [[ -n "$(find "$dir" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null)" ]]; then
        die "Der Zielordner $dir ist nicht leer und enthält kein Grillabend-Repository."
    fi
    run_external "Projekt klonen" git clone --branch "$REPO_BRANCH" "$REPO_URL" "$dir" || die "git clone ist fehlgeschlagen."
    [[ -f "$dir/compose.yaml" ]] || die "Im geklonten Projekt fehlt compose.yaml."
    PROJECT_DIR="$dir"
    write_git_excludes "$PROJECT_DIR"
}

update_project_files() {
    local dir="$1"
    if [[ ! -d "$dir/.git" ]]; then
        return 1
    fi
    if ! run_external "Projekt aktualisieren" git -c safe.directory="$dir" -C "$dir" pull --ff-only; then
        return 1
    fi
    write_git_excludes "$dir"
    return 0
}

pull_image() {
    local dir="$1"
    run_compose "$dir" pull || die "Das Image konnte nicht von GHCR geladen werden."
}

volume_has_database() {
    docker run --rm --user root -v "${VOLUME_NAME}:/data" --entrypoint sh "$IMAGE_NAME" -c 'test -s /data/app.sqlite' >/dev/null 2>&1
}

maybe_import_data() {
    local dir="$1"
    local local_db="$dir/data/app.sqlite"
    [[ -f "$local_db" ]] || return 0
    if volume_has_database; then
        log_line "Volume enthält bereits eine Datenbank; lokaler Import wird übersprungen."
        return 0
    fi
    if ! ui_confirm "Lokale Datenbank gefunden" "Im Projektordner liegt data/app.sqlite, das Docker-Volume ist aber leer. Soll die Datenbank ins Volume grillabend-data übernommen werden?"; then
        return 0
    fi
    run_external "Datenbank importieren" docker run --rm --user root \
        -v "${VOLUME_NAME}:/data" \
        -v "${dir}/data:/src:ro" \
        --entrypoint sh "$IMAGE_NAME" \
        -c 'cp /src/app.sqlite /data/app.sqlite && chown 1000:1000 /data/app.sqlite && chmod 600 /data/app.sqlite' \
        || die "Der Datenbank-Import ist fehlgeschlagen."
    state_set import "1"
}

health_check() {
    local code i
    for i in $(seq 1 60); do
        code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 "http://127.0.0.1:${HOST_PORT}/" 2>/dev/null || true)"
        if [[ "$code" == "200" || "$code" == "302" || "$code" == "303" ]]; then
            return 0
        fi
        sleep 2
    done
    return 1
}

backup_database() {
    local dir="$1"
    if ! volume_has_database; then
        return 0
    fi
    mkdir -p "$dir/backups"
    chmod 700 "$dir/backups" 2>/dev/null || true
    local name
    name="app-$(date '+%Y%m%d-%H%M%S').sqlite"
    if ! run_external "Datenbank sichern" docker run --rm --user root \
        -v "${VOLUME_NAME}:/data" \
        -v "${dir}/backups:/backup" \
        --entrypoint sh "$IMAGE_NAME" \
        -c "cp /data/app.sqlite /backup/${name} && (chmod 600 /backup/${name} || true)"; then
        return 1
    fi
    # shellcheck disable=SC2012
    ls -1t "$dir"/backups/app-*.sqlite 2>/dev/null | tail -n +$((BACKUP_KEEP + 1)) | while IFS= read -r old; do
        rm -f -- "$old"
    done
    ui_message "Backup erstellt" "Die Datenbank wurde unter $dir/backups/$name gesichert. Es werden die letzten $BACKUP_KEEP Backups behalten."
    return 0
}

print_access_info() {
    local ip=""
    local body
    if [[ "$BIND_MODE" == "lan" ]]; then
        if command -v ip >/dev/null 2>&1; then
            ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit }}')"
        fi
        if [[ -z "$ip" ]]; then
            ip="$(hostname -I 2>/dev/null | tr ' ' '\n' | awk '/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $0 !~ /^127\./ { print; exit }')"
        fi
        body="Die App läuft. Ersteinrichtung: http://${ip:-<LAN-IP>}:${HOST_PORT}/setup
Lokal: http://127.0.0.1:${HOST_PORT}/setup

Wichtig: Die App spricht nur HTTP. Im LAN sind Zugangsdaten unverschlüsselt. Für dauerhaften Betrieb einen HTTPS-Reverse-Proxy davorsetzen."
    else
        body="Die App läuft nur auf 127.0.0.1:${HOST_PORT}. Ersteinrichtung: http://127.0.0.1:${HOST_PORT}/setup

Ein Reverse Proxy auf diesem Server kann auf 127.0.0.1:${HOST_PORT} zeigen. Von außen ist die App nicht erreichbar. Über SSH: ssh -L ${HOST_PORT}:127.0.0.1:${HOST_PORT} <server>"
    fi
    if [[ "$BIND_MODE" == "lan" ]]; then
        FINAL_HINT="Ersteinrichtung: http://${ip:-<LAN-IP>}:${HOST_PORT}/setup"
    else
        FINAL_HINT="Ersteinrichtung: http://127.0.0.1:${HOST_PORT}/setup (nur lokal)"
    fi
    ui_message "Installation abgeschlossen" "$body

Log: $LOG_FILE
Status: $STATE_FILE"
}

install_flow() {
    local resume="${1:-0}"
    local dir

    if [[ "$resume" == "1" && -n "$(state_get install_dir)" ]]; then
        PROJECT_DIR="$(state_get install_dir)"
        BIND_MODE="$(state_get bind)"
        [[ -z "$BIND_MODE" ]] && BIND_MODE="local"
        state_set mode "install"
        ui_message "Fortsetzen" "Die Einrichtung wird mit dem gespeicherten Stand fortgesetzt: $PROJECT_DIR"
    else
        local old_bind="${STATE[bind]:-}"
        local old_ufw="${STATE[ufw_rule]:-0}"
        local old_dir="${STATE[install_dir]:-}"
        state_clear
        state_set mode "install"
        state_set step "target"
        [[ -n "$INSTALL_DIR_ARG" ]] && state_set install_dir "$INSTALL_DIR_ARG"
        [[ -z "$INSTALL_DIR_ARG" && -n "$old_dir" ]] && state_set install_dir "$old_dir"
        [[ -n "$BIND_ARG" ]] && state_set bind "$BIND_ARG"
        [[ -n "$old_bind" && -z "$BIND_ARG" ]] && state_set bind "$old_bind"
        [[ -n "$old_ufw" ]] && state_set ufw_rule "$old_ufw"
    fi

    state_set step "target"
    ask_target_dir
    state_set install_dir "$PROJECT_DIR"

    state_set step "bind"
    if [[ -n "$BIND_ARG" ]]; then
        BIND_MODE="$BIND_ARG"
        if [[ "$BIND_MODE" == "lan" ]]; then
            if ! confirm_lan_warning; then
                BIND_MODE="local"
            fi
        fi
        if [[ "$BIND_MODE" == "lan" ]]; then
            configure_ufw
        else
            remove_ufw_rule
        fi
        state_set bind "$BIND_MODE"
    else
        if ! ask_bind_mode; then
            return 1
        fi
    fi
    state_set bind "$BIND_MODE"

    state_set step "prerequisites"
    ensure_prerequisites

    state_set step "docker"
    ensure_docker

    state_set step "clone"
    clone_project "$PROJECT_DIR"
    state_set install_dir "$PROJECT_DIR"

    state_set step "compose"
    write_compose_override "$PROJECT_DIR"
    if ! compose_quiet "$PROJECT_DIR" config; then
        run_compose "$PROJECT_DIR" config || true
        die "Die Compose-Konfiguration ist ungültig."
    fi
    check_port

    state_set step "pull"
    pull_image "$PROJECT_DIR"

    state_set step "import"
    maybe_import_data "$PROJECT_DIR"

    state_set step "start"
    run_compose "$PROJECT_DIR" up -d || die "Der Container konnte nicht gestartet werden."
    if ! health_check; then
        run_compose "$PROJECT_DIR" logs --tail=80 || true
        die "Die App antwortet nach 120 Sekunden nicht auf HTTP. Logs prüfen: docker compose logs grillabend"
    fi

    state_set step "autostart"
    if command -v systemctl >/dev/null 2>&1; then
        run_external "Docker-Autostart sicherstellen" systemctl enable docker || warn "Docker konnte nicht für den Systemstart aktiviert werden."
    fi

    state_set step "done"
    state_set bind "$BIND_MODE"
    state_set install_dir "$PROJECT_DIR"
    print_access_info
    return 0
}

resolve_project_for_management() {
    local dir=""
    if [[ -n "$(state_get install_dir)" ]]; then
        dir="$(state_get install_dir)"
    elif [[ -n "$INSTALL_DIR_ARG" ]]; then
        dir="$INSTALL_DIR_ARG"
    fi
    if [[ -z "$dir" ]]; then
        ui_input "Projektordner" "Wo liegt die bestehende Installation?" "$DEFAULT_INSTALL_DIR"
        dir="$UI_INPUT"
    fi
    if [[ -n "$dir" && -f "$dir/compose.yaml" ]]; then
        PROJECT_DIR="$(cd "$dir" && pwd -P)"
        return 0
    fi
    if [[ -n "$dir" ]]; then
        ui_input "Projektordner" "Wo liegt die bestehende Installation?" "$dir"
        dir="$UI_INPUT"
        if [[ -n "$dir" && -f "$dir/compose.yaml" ]]; then
            PROJECT_DIR="$(cd "$dir" && pwd -P)"
            return 0
        fi
    fi
    return 1
}

update_flow() {
    if ! resolve_project_for_management; then
        ui_message "Nicht gefunden" "Es wurde keine bestehende Installation gefunden."
        return 1
    fi
    local current_bind
    current_bind="$(state_get bind)"
    [[ -z "$current_bind" ]] && current_bind="local"
    BIND_MODE="$current_bind"
    state_set mode "update"

    if ! ui_confirm "Aktualisieren" "Die Installation in $PROJECT_DIR wird aktualisiert. Vorher wird ein Backup der Datenbank erstellt. Fortfahren?"; then
        return 1
    fi

    if ui_confirm "Bindung ändern?" "Soll die Netzwerkbindung geändert werden? Aktuell: $BIND_MODE." "no"; then
        if ! ask_bind_mode; then
            return 1
        fi
    else
        state_set bind "$BIND_MODE"
    fi

    state_set step "update-docker"
    ensure_docker
    check_port

    state_set step "update-pull-base"
    run_compose "$PROJECT_DIR" pull || die "Das aktuelle Image konnte nicht geladen werden."

    state_set step "update-backup"
    if container_running; then
        if ! run_compose "$PROJECT_DIR" stop; then
            die "Der Container konnte nicht gestoppt werden. Update abgebrochen; die App läuft weiter."
        fi
    fi
    if ! backup_database "$PROJECT_DIR"; then
        run_compose "$PROJECT_DIR" up -d || docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
        die "Das Backup der Datenbank ist fehlgeschlagen. Die App wurde mit dem vorhandenen Stand neu gestartet."
    fi

    state_set step "update-git"
    if ! update_project_files "$PROJECT_DIR"; then
        run_compose "$PROJECT_DIR" up -d || docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
        die "git pull ist fehlgeschlagen. Lokale Änderungen im Projektordner prüfen; die App wurde mit dem vorhandenen Stand neu gestartet."
    fi

    state_set step "update-compose"
    write_compose_override "$PROJECT_DIR"
    if ! compose_quiet "$PROJECT_DIR" config; then
        run_compose "$PROJECT_DIR" config || true
        die "Die Compose-Konfiguration ist ungültig."
    fi

    state_set step "update-pull"
    if ! run_compose "$PROJECT_DIR" pull; then
        run_compose "$PROJECT_DIR" up -d || docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
        die "Das neue Image konnte nicht geladen werden. Die Datenbank ist gesichert; die App wurde mit dem vorhandenen Image neu gestartet."
    fi

    state_set step "update-start"
    if ! run_compose "$PROJECT_DIR" up -d; then
        docker start "$CONTAINER_NAME" >/dev/null 2>&1 || true
        die "Der Container konnte nicht gestartet werden. Die Datenbank ist gesichert."
    fi
    if ! health_check; then
        run_compose "$PROJECT_DIR" logs --tail=80 || true
        die "Die App antwortet nach 120 Sekunden nicht. Die Datenbank ist gesichert."
    fi

    if command -v systemctl >/dev/null 2>&1; then
        run_external "Docker-Autostart sicherstellen" systemctl enable docker || warn "Docker konnte nicht für den Systemstart aktiviert werden."
    fi

    state_set step "done"
    state_set install_dir "$PROJECT_DIR"
    state_set bind "$BIND_MODE"
    FINAL_HINT="Ersteinrichtung/Anmeldung: http://127.0.0.1:${HOST_PORT}/setup"
    ui_message "Update abgeschlossen" "Die App läuft wieder. Ersteinrichtung/Anmeldung: http://127.0.0.1:${HOST_PORT}/setup
Log: $LOG_FILE"
    return 0
}

remove_project_dir_safely() {
    local dir="$1"
    if [[ -z "$dir" || "$dir" == "/" || "$dir" == "/opt" || "$dir" == "/usr" || "$dir" == "/var" || "$dir" == "/root" ]]; then
        die "Sicherheitsabbruch: $dir wird nicht gelöscht."
    fi
    if [[ ! -f "$dir/compose.yaml" && "$(state_get install_dir)" != "$dir" ]]; then
        die "Sicherheitsabbruch: $dir sieht nicht wie eine Grillabend-Installation aus."
    fi
    rm -rf -- "$dir" || die "Der Projektordner konnte nicht gelöscht werden."
}

uninstall_flow() {
    local purge="$1"
    local dir=""
    if [[ -n "$(state_get install_dir)" ]]; then
        dir="$(state_get install_dir)"
    elif [[ -n "$INSTALL_DIR_ARG" ]]; then
        dir="$INSTALL_DIR_ARG"
    fi
    if [[ -z "$dir" && -d "$DEFAULT_INSTALL_DIR" ]]; then
        dir="$DEFAULT_INSTALL_DIR"
    fi

    local found="0"
    [[ -n "$dir" && -f "$dir/compose.yaml" ]] && found="1"
    container_exists && found="1"
    volume_exists && found="1"

    if [[ "$found" == "0" ]]; then
        ui_message "Nichts zu entfernen" "Es wurde keine Grillabend-Installation gefunden."
        return 0
    fi

    if [[ "$purge" == "1" ]]; then
        if [[ "$ASSUME_YES" == "0" ]]; then
            ui_message "Daten löschen" "Beim vollständigen Entfernen werden Container, Image, das Daten-Volume grillabend-data, der Projektordner $dir und alle Backups gelöscht. Docker, Git und das Betriebssystem bleiben installiert."
            if ! ui_confirm "Wirklich alles löschen?" "Diese Aktion kann nicht rückgängig gemacht werden." "no"; then
                return 0
            fi
        fi
    else
        if [[ "$ASSUME_YES" == "0" ]]; then
            if ! ui_confirm "App entfernen" "Container und Image werden entfernt. Projektordner, Daten-Volume und Backups bleiben erhalten. Fortfahren?"; then
                return 0
            fi
        fi
    fi

    if [[ -n "$dir" && -f "$dir/compose.yaml" ]]; then
        if ! command -v docker >/dev/null 2>&1; then
            ui_message "Docker nicht verfügbar" "Docker ist nicht verfügbar. Container und Volume konnten nicht entfernt werden. Bitte Docker starten und den Installer erneut ausführen. Der Status bleibt erhalten."
            return 0
        fi
        if [[ "$purge" == "1" ]]; then
            if ! run_compose "$dir" down -v; then
                ui_message "Nicht vollständig entfernt" "Docker Compose konnte die App nicht entfernen. Bitte Docker starten und den Installer erneut ausführen. Der Status bleibt erhalten."
                return 0
            fi
        else
            if ! run_compose "$dir" down; then
                ui_message "Nicht vollständig entfernt" "Docker Compose konnte die App nicht entfernen. Bitte Docker starten und den Installer erneut ausführen. Der Status bleibt erhalten."
                return 0
            fi
        fi
        run_external "Image entfernen" docker rmi "$IMAGE_NAME" || warn "Das Image konnte nicht entfernt werden (evtl. von einem anderen Container verwendet)."
        if [[ "$purge" == "1" ]] && volume_exists; then
            run_external "Daten-Volume entfernen" docker volume rm "$VOLUME_NAME" || warn "Volume konnte nicht entfernt werden."
        fi
    else
        if container_exists; then
            run_external "Container entfernen" docker rm -f "$CONTAINER_NAME" || warn "Container konnte nicht entfernt werden."
        fi
        run_external "Image entfernen" docker rmi "$IMAGE_NAME" || warn "Image konnte nicht entfernt werden."
        if [[ "$purge" == "1" ]] && volume_exists; then
            run_external "Daten-Volume entfernen" docker volume rm "$VOLUME_NAME" || warn "Volume konnte nicht entfernt werden."
        fi
    fi

    remove_ufw_rule

    if [[ "$purge" == "1" ]]; then
        if [[ -n "$dir" && -d "$dir" ]]; then
            remove_project_dir_safely "$dir"
        fi
        state_clear
        ui_message "Vollständig entfernt" "App, Daten-Volume, Projektordner und Backups wurden entfernt. Docker und Git bleiben installiert. Logs liegen unter $LOG_DIR."
    else
        state_clear
        ui_message "App entfernt" "Container und Image wurden entfernt. Projektordner, Daten-Volume und Backups bleiben erhalten."
    fi
    return 0
}

deinstall_menu() {
    local sub
    ui_menu "Deinstallieren" "Was soll entfernt werden?" \
        "App entfernen (Daten behalten)::Container und Image entfernen; Volume und Projektordner bleiben." \
        "Alles löschen::Zusätzlich Daten-Volume, Projektordner und Backups löschen." \
        "Zurück::Zum Hauptmenü."
    sub="$MENU_RESULT"
    case "$sub" in
        0) uninstall_flow 0; return 0 ;;
        1) uninstall_flow 1; return 0 ;;
    esac
    return 1
}

main_menu() {
    while true; do
        local installed="0"
        if [[ -n "$(state_get install_dir)" && -f "$(state_get install_dir)/compose.yaml" ]]; then
            installed="1"
        elif [[ -n "$INSTALL_DIR_ARG" && -f "$INSTALL_DIR_ARG/compose.yaml" ]]; then
            installed="1"
        elif [[ -f "$DEFAULT_INSTALL_DIR/compose.yaml" ]]; then
            installed="1"
        elif container_exists || volume_exists; then
            installed="1"
        fi

        local result
        if [[ "$installed" == "1" ]]; then
            ui_menu "Hauptmenü" "Eine Installation wurde erkannt." \
                "Aktualisieren::Image und Projekt aktualisieren, Datenbank automatisch sichern." \
                "Neu installieren::Projekt erneut einrichten; das Daten-Volume bleibt erhalten." \
                "Deinstallieren::App entfernen oder alle Daten löschen." \
                "Beenden::Installer schließen."
            result="$MENU_RESULT"
        else
            ui_menu "Hauptmenü" "Willkommen beim Installer." \
                "Installieren::Docker prüfen/installieren und die App einrichten." \
                "Deinstallieren::Vorhandene Reste entfernen." \
                "Beenden::Installer schließen."
            result="$MENU_RESULT"
        fi

        case "$result" in
            0)
                if [[ "$installed" == "1" ]]; then
                    if update_flow; then return 0; fi
                else
                    if install_flow 0; then return 0; fi
                fi
                ;;
            1)
                if [[ "$installed" == "1" ]]; then
                    if ui_confirm "Neu installieren" "Projektdateien werden neu eingerichtet; das Daten-Volume grillabend-data bleibt erhalten. Fortfahren?"; then
                        if install_flow 0; then return 0; fi
                    fi
                else
                    if deinstall_menu; then return 0; fi
                fi
                ;;
            2)
                if [[ "$installed" == "1" ]]; then
                    if deinstall_menu; then return 0; fi
                else
                    return 0
                fi
                ;;
            3|-1)
                return 0
                ;;
        esac
    done
}

main() {
    state_dir_init
    state_load || true

    if [[ "$MODE" != "uninstall" && "$MODE" != "purge" ]]; then
        local saved_step saved_mode
        saved_step="$(state_get step)"
        saved_mode="$(state_get mode)"
        if [[ -n "$saved_step" && "$saved_step" != "done" ]]; then
            ui_init
            if ui_confirm "Unvollständige Installation" "Es wurde eine unvollständige Einrichtung gefunden. Soll sie fortgesetzt werden?"; then
                os_check
                if [[ "$saved_mode" == "update" ]]; then
                    update_flow
                else
                    install_flow 1
                fi
                ui_cleanup
                [[ -n "$FINAL_HINT" ]] && printf '\n%s\n' "$FINAL_HINT"
                return 0
            fi
            ui_cleanup
        fi
    fi

    ui_init
    os_check

    case "$MODE" in
        uninstall)
            uninstall_flow 0
            ;;
        purge)
            uninstall_flow 1
            ;;
        install)
            main_menu
            ;;
    esac

    ui_cleanup
    [[ -n "$FINAL_HINT" ]] && printf '\n%s\n' "$FINAL_HINT"
}

main
