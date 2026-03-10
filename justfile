get-schema:
    curl https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.30.3-standalone-strict/pod-v1.json ./data/spec/kubernetes-pod-v1.json
    curl 'https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json' > ./data/spec

generate-examples:
    #!/usr/bin/env python3
    import os
    import subprocess

    examples_dir = "data/examples"
    for name in sorted(os.listdir(examples_dir), key=lambda x: int(x) if x.isdigit() else x):
        d = os.path.join(examples_dir, name)
        compose = os.path.join(d, "docker-compose.yml")
        output = os.path.join(d, "example.container")
        if os.path.isdir(d) and os.path.isfile(compose):
            result = subprocess.run(["/tmp/podlet", "compose", compose], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"FAIL: {compose}")
                print(result.stderr.strip())
            else:
                print(f"OK: {compose}")
                with open(output, "w") as f:
                    f.write(result.stdout)
