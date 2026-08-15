#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

export JAVA_HOME="${JAVA_HOME:-/usr/local/opt/openjdk@21}"
export ANDROID_HOME="${ANDROID_HOME:-/usr/local/share/android-commandlinetools}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

AVD_NAME="Breeyo_Pixel_7"

if ! adb devices | grep -q "^emulator-"; then
  echo "Booting Android emulator ($AVD_NAME)..."
  nohup emulator -avd "$AVD_NAME" -no-snapshot > /tmp/breeyo-emulator.log 2>&1 &
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do
    sleep 3
  done
  echo "Emulator booted."
fi

docker compose up -d

echo "Waiting for Postgres and Redis to be healthy..."
until [ "$(docker compose ps postgres redis --format json | grep -c '"Health":"healthy"')" = "2" ]; do
  sleep 1
done

pnpm --filter @breeyo/api dev &
API_PID=$!
trap 'kill $API_PID 2>/dev/null' EXIT

pnpm --filter @breeyo/mobile android
