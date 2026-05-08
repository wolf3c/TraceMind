#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ANDROID_STUDIO_JBR=${ANDROID_STUDIO_JBR:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}

if [ -n "${JAVA_HOME:-}" ] && [ ! -x "$JAVA_HOME/bin/java" ]; then
  unset JAVA_HOME
fi

if [ -z "${JAVA_HOME:-}" ] && [ -x "$ANDROID_STUDIO_JBR/bin/java" ]; then
  export JAVA_HOME=$ANDROID_STUDIO_JBR
fi

exec sh "$SCRIPT_DIR/gradlew" -p "$SCRIPT_DIR" test "$@"
