import { test, expect } from '@playwright/test';

const BENCHMARK_URL = '/demo/benchmark.html';
const BENCHMARK_DURATION_MS = 3000;

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
