# Create secret 'postgres_password'
# External secret — must already exist in podman
create-secret-postgres_password:
    @echo "Secret 'postgres_password' is external; skipping creation"

# Delete secret 'postgres_password'
delete-secret-postgres_password:
    podman secret rm postgres_password

# Create secret 'pgcat_password'
# External secret — must already exist in podman
create-secret-pgcat_password:
    @echo "Secret 'pgcat_password' is external; skipping creation"

# Delete secret 'pgcat_password'
delete-secret-pgcat_password:
    podman secret rm pgcat_password

# Create all secrets
create-secrets: create-secret-postgres_password create-secret-pgcat_password

# Delete all secrets
delete-secrets: delete-secret-postgres_password delete-secret-pgcat_password

# List all podman secrets
list-secrets:
    podman secret ls
