#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:?Usage: build-rpm.sh <version> [arch] [target]}"
ARCH="${2:-x86_64}"
TARGET="${3:-linux-x64}"
PKG="panlet"
TOPDIR="$(pwd)/rpmbuild-${ARCH}"

rm -rf "$TOPDIR"
mkdir -p "$TOPDIR"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}

mkdir -p "$TOPDIR/BUILD/usr/bin"
cp "dist/$TARGET/index" "$TOPDIR/BUILD/usr/bin/$PKG"
chmod 755 "$TOPDIR/BUILD/usr/bin/$PKG"

cat > "$TOPDIR/SPECS/$PKG.spec" <<EOF
Name:           $PKG
Version:        $VERSION
Release:        1%{?dist}
Summary:        CLI tool for converting between Docker Compose and Podman Quadlet formats
License:        MIT
URL:            https://github.com/panlet/panlet
BuildArch:      $ARCH

%description
Serialize and deserialize container orchestration formats: Quadlet unit
files (INI-style) and Docker Compose YAML.

%install
mkdir -p %{buildroot}/usr/bin
cp %{_builddir}/usr/bin/$PKG %{buildroot}/usr/bin/$PKG

%files
/usr/bin/$PKG
EOF

rpmbuild --define "_topdir $TOPDIR" --target "$ARCH" -bb "$TOPDIR/SPECS/$PKG.spec"
cp "$TOPDIR/RPMS/$ARCH"/*.rpm .
echo "Built $(ls "$TOPDIR/RPMS/$ARCH"/*.rpm)"
