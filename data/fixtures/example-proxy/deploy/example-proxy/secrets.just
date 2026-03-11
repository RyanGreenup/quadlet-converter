# Create secret 'db_password'
create-secret-db_password:
    sops -d ./secrets/db_password.txt | podman secret create db_password -

# Delete secret 'db_password'
delete-secret-db_password:
    podman secret rm db_password

# Create all secrets
create-secrets: create-secret-db_password

# Delete all secrets
delete-secrets: delete-secret-db_password

# List all podman secrets
list-secrets:
    podman secret ls
