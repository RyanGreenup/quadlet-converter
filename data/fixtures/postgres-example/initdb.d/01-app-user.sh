#!/bin/bash
set -euo pipefail

# Create a dedicated app user for pgcat connections.
# Password is read from the mounted podman secret.
PGCAT_PASSWORD="$(< /run/secrets/pgcat_password)"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-SQL
    CREATE USER app WITH PASSWORD '${PGCAT_PASSWORD}';
    GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO app;
    GRANT USAGE ON SCHEMA public TO app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT USAGE, SELECT ON SEQUENCES TO app;
SQL
