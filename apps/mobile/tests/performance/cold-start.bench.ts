#!/usr/bin/env node
// Plan 10-07 (PLT-07): mobile cold-start benchmark.
//
// Uses `adb shell am start -W` to measure real Android cold-start time (the
// `TotalTime` field ADB reports is the framework's own launch-to-first-frame
// measurement, the same number `adb shell am start -W` has reported since
// Android's earliest versions). Force-stops the app first so every run is a
// genuine cold start, not a resume of an already-warm process.
//
// This script CANNOT run for real in this environment (no device or emulator
// is attached here -- see 10-07-SUMMARY.md). It is written to the exact spec
// in 10-07-PLAN.md and fails gracefully with a clear, actionable error when
// no device is present, rather than fabricating a result. Task 3 (this
// plan's blocking human-verify checkpoint) runs it for real against a
// connected mid-range Android device.
//
// Usage:
//   npx tsx apps/mobile/tests/performance/cold-start.bench.ts [--emulator] [--package <id>] [--activity <name>] [--runs <n>]
import { execSync } from 'node:child_process';

const DEFAULT_PACKAGE = 'app.breeyo.mobile';
// Expo/React Native's generated Android project always names the launch
// activity MainActivity, matching apps/mobile/app.config.ts's
// `android.package` (`app.breeyo.mobile`).
const DEFAULT_ACTIVITY = `${DEFAULT_PACKAGE}/.MainActivity`;
const TOTAL_RUNS_DEFAULT = 5;
const COLD_START_TARGET_MS = 3000;

interface CliArgs {
  emulator: boolean;
  packageId: string;
  activity: string;
  runs: number;
  help: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    emulator: false,
    packageId: DEFAULT_PACKAGE,
    activity: DEFAULT_ACTIVITY,
    runs: TOTAL_RUNS_DEFAULT,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--emulator') args.emulator = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--package') args.packageId = argv[++i];
    else if (arg === '--activity') args.activity = argv[++i];
    else if (arg === '--runs') args.runs = Number.parseInt(argv[++i], 10);
  }
  if (!args.activity.includes('/')) {
    args.activity = `${args.packageId}/${args.activity}`;
  }
  return args;
}

function printHelp(): void {
  console.log(`Mobile cold-start benchmark (PLT-07)

Usage: npx tsx apps/mobile/tests/performance/cold-start.bench.ts [options]

Options:
  --package <id>     Android application id (default: ${DEFAULT_PACKAGE})
  --activity <name>  Launch activity, "<pkg>/.Activity" or just ".Activity" (default: .MainActivity)
  --runs <n>         Total launches including the discarded warm-up run (default: ${TOTAL_RUNS_DEFAULT})
  --emulator         Acknowledge this run targets an emulator, not a real device.
                      Emulator timing is approximate only -- PLT-07 sign-off
                      requires real mid-range Android hardware (D-31).
  --help, -h         Show this help text

Requires a connected/booted device or emulator reachable via \`adb devices\`.
Repeats the launch ${TOTAL_RUNS_DEFAULT} times by default, discards the first
(warm-up) run, and asserts the average of the rest is under ${COLD_START_TARGET_MS}ms.
Prints one JSON line: { metric: "cold_start_avg", avgMs, runs, pass }`);
}

function sh(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function assertDeviceConnected(): void {
  let output: string;
  try {
    output = sh('adb devices');
  } catch (err) {
    throw new Error(
      `[cold-start] Could not run "adb devices" -- is Android Platform Tools installed and on PATH? ` +
        `Original error: ${(err as Error).message}`,
    );
  }
  const deviceLines = output
    .split('\n')
    .slice(1) // drop the "List of devices attached" header
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('*'));
  const connected = deviceLines.filter((l) => l.endsWith('\tdevice') || l.endsWith(' device'));

  if (connected.length === 0) {
    throw new Error(
      '[cold-start] No device found. `adb devices` reported no device in "device" state ' +
        '(unauthorized/offline entries do not count). Connect a real mid-range Android device ' +
        'over USB (with USB debugging enabled and the RSA prompt accepted), or start an emulator ' +
        'and re-run with --emulator. This benchmark cannot fabricate a result without a target.',
    );
  }
}

function forceStop(packageId: string): void {
  sh(`adb shell am force-stop ${packageId}`);
}

/**
 * Runs `adb shell am start -W <activity>` and parses the `TotalTime` field
 * from its output, e.g.:
 *   Status: ok
 *   ThisTime: 812
 *   TotalTime: 812
 *   WaitTime: 828
 */
function launchAndMeasure(activity: string): number {
  const output = sh(`adb shell am start -W ${activity}`);
  const match = output.match(/TotalTime:\s*(\d+)/);
  if (!match) {
    throw new Error(
      `[cold-start] Could not parse TotalTime from "adb shell am start -W" output. Raw output:\n${output}`,
    );
  }
  return Number.parseInt(match[1], 10);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.emulator) {
    console.warn(
      '[cold-start] WARNING: --emulator set. Emulator measurement is approximate; ' +
        'real device confirmation required at checkpoint (D-31). Do not treat this run as PLT-07 sign-off evidence.',
    );
  }

  assertDeviceConnected();

  const totalTimesMs: number[] = [];
  for (let i = 0; i < args.runs; i++) {
    forceStop(args.packageId);
    // Give the OS a brief moment to fully tear down the process before the
    // next cold launch -- avoids measuring a partially-warm start.
    execSync('sleep 1');
    const totalTimeMs = launchAndMeasure(args.activity);
    totalTimesMs.push(totalTimeMs);
  }

  // Discard the first (warm-up) run; average the rest.
  const measured = totalTimesMs.slice(1);
  const avgMs = measured.reduce((sum, ms) => sum + ms, 0) / measured.length;
  const pass = avgMs < COLD_START_TARGET_MS && !args.emulator;

  console.log(
    JSON.stringify({
      metric: 'cold_start_avg',
      avgMs: Math.round(avgMs * 100) / 100,
      runs: measured.length,
      pass,
      emulator: args.emulator,
    }),
  );

  if (avgMs >= COLD_START_TARGET_MS) {
    console.error(`[cold-start] FAIL: average ${avgMs.toFixed(1)}ms exceeds ${COLD_START_TARGET_MS}ms target.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exitCode = 1;
});
