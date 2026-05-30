import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BENCHMARK_URL = '/demo/benchmark.html';
const BENCHMARK_DURATION_MS = 3000;
const REPORT_DIR = process.env.PERF_REPORT_DIR ?? 'test-results/performance';

interface BenchmarkStats {
  count: number;
  avg: number;
  p50: number;
  p95: number;
  max: number;
}

interface BenchmarkSideSnapshot {
  label: string;
  sampleCount: number;
  stats: BenchmarkStats | null;
}

interface BenchmarkSnapshot {
  ready: boolean;
  running: boolean;
  old: BenchmarkSideSnapshot;
  new: BenchmarkSideSnapshot;
  baseline: BenchmarkSideSnapshot;
  occlusion: BenchmarkSideSnapshot;
}

interface MetricComparison {
  label: string;
  baseline: BenchmarkStats;
  candidate: BenchmarkStats;
  ratio?: number;
}

test.describe('Performance benchmarks', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BENCHMARK_URL);
    await page.waitForFunction(
      () => (window as any).__iframeTrackerBenchmark?.getSnapshot().ready,
      {
        timeout: 15000,
      },
    );
    await page.evaluate(() => (window as any).__iframeTrackerBenchmark.reset());
  });

  test('scroll-sync overlay updates stay faster than full recalculation', async ({ page }) => {
    test.slow();

    const snapshot = (await page.evaluate(
      (durationMs) => (window as any).__iframeTrackerBenchmark.runFor(durationMs),
      BENCHMARK_DURATION_MS,
    )) as BenchmarkSnapshot;

    expect(snapshot.running).toBe(false);

    const oldStats = expectUsableStats('old overlay method', snapshot.old, 20);
    const newStats = expectUsableStats('scroll-sync overlay method', snapshot.new, 20);

    expect(
      newStats.avg,
      `scroll-sync avg ${newStats.avg}ms should beat full recalculation avg ${oldStats.avg}ms`,
    ).toBeLessThan(oldStats.avg);
    expect(
      newStats.p95,
      `scroll-sync p95 ${newStats.p95}ms should remain below one frame budget`,
    ).toBeLessThan(16);

    await writePerformanceReport('scroll-sync-overlay', snapshot, [
      {
        label: 'Scroll-sync overlay vs full recalculation',
        baseline: oldStats,
        candidate: newStats,
        ratio: oldStats.avg / newStats.avg,
      },
    ]);
  });

  test('tracker occlusion detection stays within publishable latency budget', async ({ page }) => {
    test.slow();

    const snapshot = (await page.evaluate(
      (durationMs) => (window as any).__iframeTrackerBenchmark.runFor(durationMs),
      BENCHMARK_DURATION_MS,
    )) as BenchmarkSnapshot;

    const baselineStats = expectUsableStats('baseline tracker', snapshot.baseline, 20);
    const occlusionStats = expectUsableStats('occlusion tracker', snapshot.occlusion, 20);

    expect(
      baselineStats.p95,
      `baseline tracker p95 ${baselineStats.p95}ms should stay well within a frame`,
    ).toBeLessThan(16);
    expect(
      occlusionStats.p95,
      `occlusion tracker p95 ${occlusionStats.p95}ms should stay below the release budget`,
    ).toBeLessThan(50);
    expect(
      occlusionStats.avg,
      `occlusion tracker avg ${occlusionStats.avg}ms should leave room for host work`,
    ).toBeLessThan(20);

    await writePerformanceReport('tracker-occlusion', snapshot, [
      {
        label: 'Tracker occlusion vs baseline',
        baseline: baselineStats,
        candidate: occlusionStats,
        ratio: occlusionStats.avg / baselineStats.avg,
      },
    ]);
  });
});

function expectUsableStats(
  label: string,
  side: BenchmarkSideSnapshot,
  minSamples: number,
): BenchmarkStats {
  expect(side.sampleCount, `${label} should collect enough samples`).toBeGreaterThanOrEqual(
    minSamples,
  );
  expect(side.stats, `${label} should produce computed stats`).not.toBeNull();

  const stats = side.stats!;
  for (const key of ['avg', 'p50', 'p95', 'max'] as const) {
    expect(Number.isFinite(stats[key]), `${label} ${key} should be finite`).toBe(true);
    expect(stats[key], `${label} ${key} should not be negative`).toBeGreaterThanOrEqual(0);
  }

  expect(stats.count, `${label} stats count should match samples`).toBe(side.sampleCount);
  expect(stats.p95, `${label} p95 should be no larger than max`).toBeLessThanOrEqual(stats.max);

  return stats;
}

async function writePerformanceReport(
  name: string,
  snapshot: BenchmarkSnapshot,
  comparisons: MetricComparison[],
): Promise<void> {
  await mkdir(REPORT_DIR, { recursive: true });

  const report = {
    name,
    generatedAt: new Date().toISOString(),
    durationMs: BENCHMARK_DURATION_MS,
    snapshot,
    comparisons,
  };

  await writeFile(join(REPORT_DIR, `${name}.json`), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(REPORT_DIR, `${name}.md`), renderMarkdownReport(report));
}

function renderMarkdownReport(report: {
  name: string;
  generatedAt: string;
  durationMs: number;
  snapshot: BenchmarkSnapshot;
  comparisons: MetricComparison[];
}): string {
  const lines = [
    `# ${report.name} Performance Report`,
    '',
    `Generated: ${report.generatedAt}`,
    `Duration: ${report.durationMs}ms`,
    '',
    '## Summary',
    '',
    '| Metric | Baseline Avg | Candidate Avg | Ratio | Candidate P95 |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.comparisons.map((comparison) =>
      [
        `| ${comparison.label}`,
        formatMs(comparison.baseline.avg),
        formatMs(comparison.candidate.avg),
        comparison.ratio === undefined ? '--' : `${comparison.ratio.toFixed(2)}x`,
        `${formatMs(comparison.candidate.p95)} |`,
      ].join(' | '),
    ),
    '',
    '## Raw Stats',
    '',
    '| Side | Samples | Avg | P50 | P95 | Max |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    renderSideRow(report.snapshot.old),
    renderSideRow(report.snapshot.new),
    renderSideRow(report.snapshot.baseline),
    renderSideRow(report.snapshot.occlusion),
    '',
  ];

  return `${lines.join('\n')}\n`;
}

function renderSideRow(side: BenchmarkSideSnapshot): string {
  const stats = side.stats;
  if (!stats) {
    return `| ${side.label} | ${side.sampleCount} | -- | -- | -- | -- |`;
  }

  return [
    `| ${side.label}`,
    String(side.sampleCount),
    formatMs(stats.avg),
    formatMs(stats.p50),
    formatMs(stats.p95),
    `${formatMs(stats.max)} |`,
  ].join(' | ');
}

function formatMs(value: number): string {
  return `${value.toFixed(3)}ms`;
}
