# Convert the secrets fixture to individual files in data/fixtures/secrets-output/
convert-secrets-fixture:
    rm -rf data/fixtures/secrets-output
    bun run src/index.ts convert compose-to-quadlet -o data/fixtures/secrets-output data/fixtures/secrets-compose.yml

# Tag and push a release (e.g., just release 0.2.0)
release version:
    git tag "v{{version}}"
    git push origin main "v{{version}}"

get-schema:
    curl https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.30.3-standalone-strict/pod-v1.json ./data/spec/kubernetes-pod-v1.json
    curl 'https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json' > ./data/spec

# Generate expected output using podlet
_generate-podlet:
    #!/usr/bin/env python3
    import os
    import subprocess

    examples_dir = "data/examples"
    for name in sorted(os.listdir(examples_dir), key=lambda x: int(x) if x.isdigit() else x):
        d = os.path.join(examples_dir, name)
        compose = os.path.join(d, "docker-compose.yml")
        output = os.path.join(d, "expected.container")
        if os.path.isdir(d) and os.path.isfile(compose):
            result = subprocess.run(["/tmp/podlet", "compose", compose], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"FAIL: {compose}")
                print(result.stderr.strip())
            else:
                print(f"OK: {compose}")
                with open(output, "w") as f:
                    f.write(result.stdout)

# Generate output using our CLI
_generate-ours:
    #!/usr/bin/env python3
    import os
    import subprocess

    examples_dir = "data/examples"
    for name in sorted(os.listdir(examples_dir), key=lambda x: int(x) if x.isdigit() else x):
        d = os.path.join(examples_dir, name)
        compose = os.path.join(d, "docker-compose.yml")
        output = os.path.join(d, "actual.container")
        if os.path.isdir(d) and os.path.isfile(compose):
            result = subprocess.run(
                ["bun", "run", "src/index.ts", "convert", "compose-to-quadlet", compose],
                capture_output=True, text=True,
            )
            if result.returncode != 0:
                print(f"FAIL: {compose}")
                print(result.stderr.strip())
            else:
                print(f"OK: {compose}")
                with open(output, "w") as f:
                    f.write(result.stdout)

# Convert all examples with our CLI, then compare to expected output
compare-examples: _generate-ours
    #!/usr/bin/env python3
    import os
    import difflib

    examples_dir = "data/examples"
    passed = 0
    failed = 0
    skipped = 0
    for name in sorted(os.listdir(examples_dir), key=lambda x: int(x) if x.isdigit() else x):
        d = os.path.join(examples_dir, name)
        expected = os.path.join(d, "example.container")
        actual = os.path.join(d, "actual.container")
        if not (os.path.isdir(d) and os.path.isfile(expected) and os.path.isfile(actual)):
            skipped += 1
            continue
        with open(expected) as f:
            expected_text = f.read()
        with open(actual) as f:
            actual_text = f.read()
        if actual_text == expected_text:
            passed += 1
        else:
            failed += 1
            print(f"DIFF: {name}")
            diff = difflib.unified_diff(
                expected_text.splitlines(keepends=True),
                actual_text.splitlines(keepends=True),
                fromfile=f"expected ({expected})",
                tofile=f"actual ({actual})",
            )
            print("".join(diff))
    print(f"\n{passed} passed, {failed} failed, {skipped} skipped")
