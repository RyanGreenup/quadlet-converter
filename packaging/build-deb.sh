#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-deb.sh <version> [arch] [target]}"
ARCH="${2:-amd64}"
TARGET="${3:-linux-x64}"
PKG="quadlet-serde"
STAGING="${PKG}_${VERSION}_${ARCH}"

rm -rf "$STAGING"
mkdir -p "$STAGING/DEBIAN"
mkdir -p "$STAGING/usr/bin"

cp "dist/$TARGET/index" "$STAGING/usr/bin/$PKG"
chmod 755 "$STAGING/usr/bin/$PKG"

cat > "$STAGING/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends:
Maintainer: quadlet-serde contributors
Description: CLI tool for converting between Docker Compose and Podman Quadlet formats
 Serialize and deserialize container orchestration formats: Quadlet unit
 files (INI-style) and Docker Compose YAML.
EOF

dpkg-deb --build --root-owner-group "$STAGING"
echo "Built ${STAGING}.deb"
