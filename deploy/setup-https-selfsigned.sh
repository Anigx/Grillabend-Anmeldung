#!/usr/bin/env bash
# Richtet einen selbstsignierten HTTPS-Reverse-Proxy (Nginx) vor der lokalen
# Grillabend-App ein. Gedacht für Tests; später durch einen Proxy mit echtem
# Zertifikat ersetzbar.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
    echo "Bitte als root ausführen (sudo)." >&2
    exit 1
fi
if [[ $# -lt 1 ]]; then
    echo "Aufruf: sudo bash deploy/setup-https-selfsigned.sh <host-oder-ip> [weitere-san...]" >&2
    exit 1
fi

PRIMARY="$1"
shift || true
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_PORT="${APP_PORT:-1621}"
CERT_DIR="/etc/nginx/ssl/grillabend"
CERT="$CERT_DIR/selfsigned.crt"
KEY="$CERT_DIR/selfsigned.key"

SANS=""
SERVER_NAMES="$PRIMARY"
ORIGINS="https://$PRIMARY"
add_san() {
    if [[ "$1" =~ ^[0-9.]+$ ]]; then
        SANS="${SANS},IP:$1"
    else
        SANS="${SANS},DNS:$1"
    fi
}

add_san "$PRIMARY"
for name in "$@"; do
    add_san "$name"
    SERVER_NAMES="$SERVER_NAMES $name"
    ORIGINS="$ORIGINS,https://$name"
done
add_san 127.0.0.1
add_san localhost
SANS="${SANS#,}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx openssl

install -d -m 700 "$CERT_DIR"
openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=$PRIMARY" \
    -addext "subjectAltName=$SANS" >/dev/null 2>&1
chmod 600 "$KEY"

cat > /etc/nginx/sites-available/grillabend <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    return 301 https://\$host\$request_uri;
}

server {
    listen 8443 ssl;
    listen [::]:8443 ssl;
    server_name _;
    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name $SERVER_NAMES;

    ssl_certificate $CERT;
    ssl_certificate_key $KEY;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header X-Frame-Options DENY always;
    add_header Content-Security-Policy "frame-ancestors 'none'" always;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$http_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOF

ln -sf /etc/nginx/sites-available/grillabend /etc/nginx/sites-enabled/grillabend
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

ENV_FILE="$PROJECT_DIR/.env"
if [[ -f "$ENV_FILE" ]]; then
    if grep -q '^APP_ORIGIN=' "$ENV_FILE"; then
        sed -i "s|^APP_ORIGIN=.*|APP_ORIGIN=$ORIGINS|" "$ENV_FILE"
    else
        printf '\nAPP_ORIGIN=%s\n' "$ORIGINS" >> "$ENV_FILE"
    fi
    if grep -q '^HOST=' "$ENV_FILE"; then
        sed -i 's|^HOST=.*|HOST=127.0.0.1|' "$ENV_FILE"
    else
        printf 'HOST=127.0.0.1\n' >> "$ENV_FILE"
    fi
    (cd "$PROJECT_DIR" && docker compose up -d)
else
    echo "Hinweis: $ENV_FILE fehlt. APP_ORIGIN=$ORIGINS und HOST=127.0.0.1 setzen und Compose starten."
fi

echo
echo "Selbstsigniertes HTTPS aktiv:"
echo "  HTTP  http://$PRIMARY/  ->  https://$PRIMARY/"
echo "  HTTPS https://$PRIMARY/"
echo "Der Browser zeigt eine Zertifikatswarnung (selbstsigniert)."
echo "Für ein echtes Zertifikat später einen Reverse Proxy davor setzen oder"
echo "deploy/nginx.conf.example mit Zertifikatspfaden verwenden."
