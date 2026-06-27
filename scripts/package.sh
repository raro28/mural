#!/bin/sh
set -eu
VERSION="${1:?usage: package.sh VERSION}"
STAGE="mural-${VERSION}"

rm -rf "$STAGE"
mkdir -p "$STAGE/data" "$STAGE/bin"
cp dist/mural.js "$STAGE/"
cp data/dev.muy.Mural.desktop data/dev.muy.Mural.metainfo.xml data/dev.muy.Mural.svg data/mural.1 "$STAGE/data/"
cp bin/mural "$STAGE/bin/"
cp LICENSE README.md "$STAGE/"

tar czf "${STAGE}.tar.gz" "$STAGE"
rm -rf "$STAGE"
