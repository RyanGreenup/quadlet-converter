#!/bin/sh
set -eu

# Generate userlist.txt from podman secret
PASSWORD=$(cat /run/secrets/pgcat_password)
printf '"app" "%s"\n' "$PASSWORD" > /tmp/userlist.txt

exec pgbouncer /etc/pgbouncer/pgbouncer.ini
