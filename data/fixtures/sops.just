age_key_dir := env("XDG_CONFIG_HOME", env("HOME") / ".config") / "sops" / "age"
age_key_file := age_key_dir / "keys.txt"

# Show the current age public key
show-age-key:
    @if [ ! -f "{{ age_key_file }}" ]; then echo "No age key found at {{ age_key_file }}"; exit 1; fi
    grep 'public key:' "{{ age_key_file }}" | awk '{print $NF}'

# Create an age key (skips if one already exists)
create-age-key:
    @if [ -f "{{ age_key_file }}" ]; then echo "Age key already exists at {{ age_key_file }}"; exit 0; fi
    mkdir -p "{{ age_key_dir }}"
    age-keygen -o "{{ age_key_file }}"
    @echo "Created age key at {{ age_key_file }}"

# Delete the age key
delete-age-key:
    @if [ ! -f "{{ age_key_file }}" ]; then echo "No age key found"; exit 0; fi
    rm "{{ age_key_file }}"
    @echo "Deleted age key"

# Rotate the age key (deletes old, creates new)
rotate-age-key: delete-age-key create-age-key

# Print the .sops.yaml config snippet for this key
sops-config:
    #!/usr/bin/env sh
    pubkey=$(grep 'public key:' "{{ age_key_file }}" | awk '{print $NF}')
    cat <<EOF
    creation_rules:
      - age: >-
          ${pubkey}
    EOF

# Encrypt a plaintext file with sops+age
encrypt file:
    sops -e -i "{{ file }}"

# Decrypt a sops-encrypted file to stdout
decrypt file:
    sops -d "{{ file }}"

# Edit a sops-encrypted file in-place (decrypts, opens $EDITOR, re-encrypts)
edit file:
    sops "{{ file }}"
