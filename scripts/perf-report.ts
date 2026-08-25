#!/usr/bin/env node
// Plan 10-07 (PLT-07): aggregated performance report.
//
// Reads JSON-line output from the three PLT-07 benchmarks -- piped
// (vitest/tsx interleave their own banners with the JSON lines the
// benchmarks print; this script picks the JSON lines out of that noise) or
// from files named as positional arguments -- and prints one
// `Metric | Target | Measured | Status` table covering all three metric
// categories: API p95 (one row per endpoint group), queue real-time p95,
// and mobile cold start.
//
// Exits 1 if any metric that actually reported a measurement failed its
// target. A metric category with NO data piped in (e.g. running only the
// API benchmarks, with no cold-start run in the same pipe) is reported as
// "NO DATA" and does NOT affect the exit code -- silence is not the same as
// failure, and Task 2's verify command intentionally pipes only the API +
// queue benchmarks through this script.
//
// Usage:
//   npx vitest run <bench files> | npx tsx scripts/perf-report.ts
//   npx tsx scripts/perf-report.ts <file1.jsonl> <file2.jsonl> ...
//   npx tsx scripts/perf-report.ts --json
//   npx tsx scripts/perf-report.ts --help
import { readFileSync } from 'node:fs';

const API_P95_TARGET_MS = 500;
const QUEUE_REALTIME_TARGET_MS = 2000;
const COLD_START_TARGET_MS = 3000;

interface ApiGroupLine {
  group: string;
  p95Ms: number;
  count: number;
  pass: boolean;
}

interface QueueRealtimeLine {
  metric: 'queue_realtime_p95';
  p95Ms: number;
  count: number;
  pass: boolean;
}

interface ColdStartLine {
  metric: 'cold_start_avg';
  avgMs: number;
  runs: number;
  pass: boolean;
  emulator?: boolean;
}

type ParsedLine = ApiGroupLine | QueueRealtimeLine | ColdStartLine;

interface ReportRow {
  metric: string;
  target: string;
  measured: string;
  status: 'PASS' | 'FAIL' | 'NO DATA';
}

function printHelp(): void {
  console.log(`perf-report -- PLT-07 aggregated performance report (Plan 10-07)

Reads JSON-line benchmark output (piped via stdin, or from file arguments)
and prints a Metric | Target | Measured | Status table covering:
  - API p95 latency, one row per endpoint group        (target: <${API_P95_TARGET_MS}ms)
  - Queue real-time update latency                       (target: <${QUEUE_REALTIME_TARGET_MS}ms)
  - Mobile cold start                                    (target: <${COLD_START_TARGET_MS}ms)

Usage:
  npx vitest run apps/api/tests/performance/*.bench.ts | npx tsx scripts/perf-report.ts
  npx tsx scripts/perf-report.ts path/to/results-a.jsonl path/to/results-b.jsonl
  npx tsx scripts/perf-report.ts --json     Print machine-readable JSON instead of a table
  npx tsx scripts/perf-report.ts --help     Show this help text

Exit code: 1 if any metric that reported a measurement missed its target,
0 otherwise. A metric category with no data in the input is shown as
"NO DATA" and does not by itself cause a non-zero exit.`);
}

/** Best-effort JSON-line extraction from output that mixes test-runner
 * banners, warnings, and stack traces with the benchmarks' own JSON lines. */
function extractJsonLines(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('{') || !line.endsWith('}')) continue;
    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== 'object' || parsed === null) continue;
      if (
        ('group' in parsed && 'p95Ms' in parsed) ||
        parsed.metric === 'queue_realtime_p95' ||
        parsed.metric === 'cold_start_avg'
      ) {
        lines.push(parsed as ParsedLine);
      }
    } catch {
      // Not a JSON line (test-runner banner, log noise, etc.) -- skip.
    }
  }
  return lines;
}

function readAllInput(files: string[]): string {
  if (files.length > 0) {
    return files.map((f) => readFileSync(f, 'utf8')).join('\n');
  }
  // No file args: read stdin synchronously. `fd 0` works whether stdin is a
  // pipe (the common case, `vitest run ... | perf-report`) or a redirected
  // file; when there is no stdin at all (a bare TTY with no pipe) this
  // throws, which we treat as "no input" rather than hanging forever.
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function buildRows(lines: ParsedLine[]): ReportRow[] {
  const rows: ReportRow[] = [];

  const apiGroups = lines.filter((l): l is ApiGroupLine => 'group' in l && 'p95Ms' in l);
  if (apiGroups.length === 0) {
    rows.push({ metric: 'API p95 (all groups)', target: `<${API_P95_TARGET_MS}ms`, measured: '--', status: 'NO DATA' });
  } else {
    for (const g of apiGroups) {
      rows.push({
        metric: `API p95 (${g.group}, n=${g.count})`,
        target: `<${API_P95_TARGET_MS}ms`,
        measured: `${g.p95Ms.toFixed(1)}ms`,
        status: g.pass ? 'PASS' : 'FAIL',
      });
    }
  }

  const queueLine = lines.find((l): l is QueueRealtimeLine => 'metric' in l && l.metric === 'queue_realtime_p95');
  if (!queueLine) {
    rows.push({ metric: 'Queue Realtime p95', target: `<${QUEUE_REALTIME_TARGET_MS}ms`, measured: '--', status: 'NO DATA' });
  } else {
    rows.push({
      metric: `Queue Realtime p95 (n=${queueLine.count})`,
      target: `<${QUEUE_REALTIME_TARGET_MS}ms`,
      measured: `${queueLine.p95Ms.toFixed(1)}ms`,
      status: queueLine.pass ? 'PASS' : 'FAIL',
    });
  }

  const coldStartLine = lines.find((l): l is ColdStartLine => 'metric' in l && l.metric === 'cold_start_avg');
  if (!coldStartLine) {
    rows.push({ metric: 'Cold Start (avg)', target: `<${COLD_START_TARGET_MS}ms`, measured: '--', status: 'NO DATA' });
  } else {
    const suffix = coldStartLine.emulator ? ' [emulator -- approximate, real device required]' : '';
    rows.push({
      metric: `Cold Start (avg, n=${coldStartLine.runs})${suffix}`,
      target: `<${COLD_START_TARGET_MS}ms`,
      measured: `${coldStartLine.avgMs.toFixed(1)}ms`,
      status: coldStartLine.pass ? 'PASS' : 'FAIL',
    });
  }

  return rows;
}

function printTable(rows: ReportRow[]): void {
  const headers = ['Metric', 'Target', 'Measured', 'Status'];
  const cols = [
    Math.max(headers[0].length, ...rows.map((r) => r.metric.length)),
    Math.max(headers[1].length, ...rows.map((r) => r.target.length)),
    Math.max(headers[2].length, ...rows.map((r) => r.measured.length)),
    Math.max(headers[3].length, ...rows.map((r) => r.status.length)),
  ];
  const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - s.length));
  const line = (cells: string[]) => `| ${cells.map((c, i) => pad(c, cols[i])).join(' | ')} |`;
  const sep = `|${cols.map((w) => '-'.repeat(w + 2)).join('|')}|`;

  console.log(line(headers));
  console.log(sep);
  for (const r of rows) {
    console.log(line([r.metric, r.target, r.measured, r.status]));
  }
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    printHelp();
    return;
  }
  const jsonOutput = argv.includes('--json');
  const files = argv.filter((a) => a !== '--json' && !a.startsWith('-'));

  const raw = readAllInput(files);
  const lines = extractJsonLines(raw);
  const rows = buildRows(lines);

  if (jsonOutput) {
    console.log(JSON.stringify({ rows, generatedAt: new Date().toISOString() }, null, 2));
  } else {
    console.log('PLT-07 Performance Report\n');
    printTable(rows);
    console.log('');
  }

  const anyFail = rows.some((r) => r.status === 'FAIL');
  const anyData = rows.some((r) => r.status !== 'NO DATA');

  if (!anyData) {
    console.error('perf-report: no benchmark JSON lines found in input. Nothing to report.');
    process.exitCode = 1;
    return;
  }

  if (anyFail) {
    process.exitCode = 1;
  }
}

main();
