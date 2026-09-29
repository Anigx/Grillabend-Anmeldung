#!/usr/bin/env bash
# Startet und prüft eine flüchtige, öffentlich erreichbare Testinstallation auf einer GitHub-VM.
set -euo pipefail

case "${1:-}" in
  start)
    : "${RUNNER_TEMP:?Nur auf einer GitHub-VM ausführen}"
    : "${GITHUB_OUTPUT:?GitHub-Ausgabedatei fehlt}"
    curl --fail --location --retry 3 --silent --show-error \
      'https://github.com/cloudflare/cloudflared/releases/download/2026.9.3/cloudflared-linux-amd64' \
      --output "$RUNNER_TEMP/cloudflared"
    echo "77e26d8d900e0b8469f416239d14b5f296525fdf79fee6f511ef55609e3fbac2  $RUNNER_TEMP/cloudflared" | sha256sum --check
    chmod +x "$RUNNER_TEMP/cloudflared"

    sudo apt-get update -qq
    sudo apt-get install -y -qq nginx
    sudo cp deploy/nginx-preview.conf /etc/nginx/sites-available/default
    sudo nginx -t
    sudo systemctl restart nginx

    "$RUNNER_TEMP/cloudflared" tunnel --no-autoupdate --url http://127.0.0.1:8080 \
      > "$RUNNER_TEMP/cloudflared.log" 2>&1 &
    echo "$!" > "$RUNNER_TEMP/cloudflared.pid"
    url=''
    for attempt in $(seq 1 60); do
      if url=$(grep -Eom1 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUNNER_TEMP/cloudflared.log"); then
        break
      fi
      if ! kill -0 "$(cat "$RUNNER_TEMP/cloudflared.pid")" 2>/dev/null; then
        cat "$RUNNER_TEMP/cloudflared.log"
        exit 1
      fi
      sleep 2
    done
    if [[ -z "$url" ]]; then
      cat "$RUNNER_TEMP/cloudflared.log"
      echo 'Der HTTPS-Tunnel hat keine Test-URL bereitgestellt.' >&2
      exit 1
    fi

    printf 'APP_ORIGIN=%s\nGRILLABEND_IMAGE=grillabend:vm-test\n' "$url" > .env
    chmod 600 .env
    docker compose config --quiet
    docker compose up -d --no-build --pull never
    printf '%s\n' "$url" > "$RUNNER_TEMP/preview-url"
    echo "url=$url" >> "$GITHUB_OUTPUT"
    ;;
  check)
    : "${RUNNER_TEMP:?Nur auf einer GitHub-VM ausführen}"
    url="${2:?Test-URL fehlt}"
    [[ "$url" =~ ^https://[a-z0-9-]+\.trycloudflare\.com$ ]] || exit 1
    host="${url#https://}"
    ready=''
    for attempt in $(seq 1 30); do
      if curl --fail --silent --show-error --max-time 10 \
        --header "Host: $host" http://127.0.0.1:8080/ --output /dev/null; then
        ready=1
        break
      fi
      sleep 2
    done
    if [[ -z "$ready" ]]; then
      echo 'Nginx erreicht den Container nicht:' >&2
      docker compose ps --all || true
      docker compose logs grillabend || true
      sudo tail -n 30 /var/log/nginx/error.log || true
      exit 1
    fi
    [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:621/api/session)" == 426 ]]

    for attempt in $(seq 1 30); do
      if curl --fail --silent --show-error --max-time 15 "$url/" \
        --output "$RUNNER_TEMP/preview-index.html"; then
        break
      fi
      sleep 2
    done
    grep -q 'Grillabend' "$RUNNER_TEMP/preview-index.html"
    [[ "$(curl --silent --output /dev/null --write-out '%{http_code}' "$url/api/attendees")" == 401 ]]

    # Ausschließlich künstliche Konten in der leeren Datenbank dieser VM verwenden.
    payload=$(printf '{"username":"VmTest-%s","password":"Test-Passwort-123!A"}' "$GITHUB_RUN_ID")
    status=$(curl --silent --show-error --max-time 20 --output "$RUNNER_TEMP/register.json" \
      --dump-header "$RUNNER_TEMP/register.headers" --write-out '%{http_code}' \
      --header "Origin: $url" --header 'Content-Type: application/json' \
      --data "$payload" "$url/api/register")
    [[ "$status" == 200 ]]
    grep -qi 'Set-Cookie:.*HttpOnly; SameSite=Lax;.*Secure' "$RUNNER_TEMP/register.headers"
    echo 'Öffentliche HTTPS-Seite, geschützte API, Cookie und Registrierung geprüft.'
    ;;
  cleanup)
    if [[ -f "${RUNNER_TEMP:-/nonexistent}/preview-deployment-id" ]]; then
      id=$(cat "$RUNNER_TEMP/preview-deployment-id")
      gh api "repos/$GITHUB_REPOSITORY/deployments/$id/statuses" --method POST \
        -f state=inactive -f description='GitHub-Test-VM beendet' > /dev/null || true
    fi
    docker compose down || true
    if [[ -f "${RUNNER_TEMP:-/nonexistent}/cloudflared.pid" ]]; then
      kill "$(cat "$RUNNER_TEMP/cloudflared.pid")" 2>/dev/null || true
    fi
    ;;
  *)
    echo 'Verwendung: preview-vm.sh start|check URL|cleanup' >&2
    exit 2
    ;;
esac
