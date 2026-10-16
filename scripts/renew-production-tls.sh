#!/bin/bash
set -euo pipefail
cd /opt/macrochips
exec 9>/opt/macrochips/scripts/renew-tls.lock
/usr/bin/flock -n 9 || exit 0
/usr/bin/docker run --rm -v /opt/macrochips/certbot/conf:/etc/letsencrypt -v /opt/macrochips/certbot/www:/var/www/certbot certbot/certbot:v5.7.0 renew --non-interactive --no-random-sleep-on-renew
/usr/bin/docker compose exec -T frontend nginx -t
/usr/bin/docker compose exec -T frontend nginx -s reload
