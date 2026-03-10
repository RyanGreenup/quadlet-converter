#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-rpm.sh <version>}"
ARCH="${2:-x86_64}"
PKG="quadlet-serde"
TOPDIR="$(pwd)/rpmbuild"

rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

mkdir -p "$TOPDIR/BUILD/usr/bin"
cp dist/index "$TOPDIR/BUILD/usr/bin/$PKG"
chmod 755 "$TOPDIR/BUILD/usr/bin/$PKG"

cat > "$TOPDIR/SPECS/$PKG.spec" <<EOF
Name:           $PKG
Version:        $VERSION
Release:        1%{?dist}
Summary:        CLI tool for converting between Docker Compose and Podman Quadlet formats
License:        MIT
URL:            https://github.com/quadlet-serde/quadlet-serde

%description
Serialize and deserialize container orchestration formats: Quadlet unit
files (INI-style) and Docker Compose YAML.

%install
mkdir -p %{buildroot}/usr/bin
cp %{_builddir}/usr/bin/$PKG %{buildroot}/usr/bin/$PKG

%files
/usr/bin/$PKG
EOF

rpmbuild --define "_topdir $TOPDIR" -bb "$TOPDIR/SPECS/$PKG.spec"
cp "$TOPDIR/RPMS/$ARCH"/*.rpm .
echo "Built $(ls "$TOPDIR/RPMS/$ARCH"/*.rpm)"
