get-schema:
    curl https://raw.githubusercontent.com/yannh/kubernetes-json-schema/master/v1.30.3-standalone-strict/pod-v1.json ./data/spec/kubernetes-pod-v1.json
    curl 'https://github.com/compose-spec/compose-spec/blob/main/schema/compose-spec.json' > ./data/spec
