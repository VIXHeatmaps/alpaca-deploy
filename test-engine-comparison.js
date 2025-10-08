/**
 * Engine Comparison Test
 * Runs the same backtest on both V1 (legacy) and V2 engines and compares results
 */

const axios = require('axios');

const API_URL = 'http://localhost:8080/api/backtest_strategy';

// Simple test strategy
const testStrategy = {
  elements: [
    {
      type: 'ticker',
      ticker: 'AAPL',
      children: []
    }
  ],
  startDate: '2024-01-01',
  endDate: '2024-12-31'
};

async function runBacktest(useV2) {
  const engineName = useV2 ? 'V2' : 'V1 (Legacy)';
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running ${engineName} Engine`);
  console.log('='.repeat(60));

  try {
    const response = await axios.post(API_URL, testStrategy, {
      headers: {
        'Content-Type': 'application/json',
        'X-Use-V2-Engine': useV2 ? 'true' : 'false'
      },
      timeout: 60000
    });

    const data = response.data;

    console.log(`\n${engineName} Results:`);
    console.log(`  Dates: ${data.dates?.length || 0} days`);
    console.log(`  Equity curve points: ${data.equityCurve?.length || 0}`);
    console.log(`  Final equity: ${data.equityCurve?.[data.equityCurve.length - 1]?.toFixed(4) || 'N/A'}`);

    if (data.metrics) {
      console.log(`\n  Metrics:`);
      console.log(`    CAGR: ${(data.metrics.cagr * 100).toFixed(2)}%`);
      console.log(`    Sharpe: ${data.metrics.sharpe?.toFixed(2) || 'N/A'}`);
      console.log(`    Max Drawdown: ${(data.metrics.maxDrawdown * 100).toFixed(2)}%`);
      console.log(`    Total Return: ${(data.metrics.totalReturn * 100).toFixed(2)}%`);
    }

    if (data.benchmark?.metrics) {
      console.log(`\n  Benchmark (SPY):`);
      console.log(`    CAGR: ${(data.benchmark.metrics.cagr * 100).toFixed(2)}%`);
      console.log(`    Sharpe: ${data.benchmark.metrics.sharpe?.toFixed(2) || 'N/A'}`);
      console.log(`    Max Drawdown: ${(data.benchmark.metrics.maxDrawdown * 100).toFixed(2)}%`);
    }

    if (data._v2Metadata) {
      console.log(`\n  V2 Metadata:`);
      console.log(`    Cache available: ${data._v2Metadata.cacheAvailable}`);
      console.log(`    Total bars: ${data._v2Metadata.phase2?.totalBars || 'N/A'}`);
      console.log(`    Days simulated: ${data._v2Metadata.phase4?.daysSimulated || 'N/A'}`);
    }

    return {
      engine: engineName,
      success: true,
      data: data
    };

  } catch (error) {
    console.error(`\n${engineName} Error:`);
    if (error.response) {
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else {
      console.error(`  ${error.message}`);
    }

    return {
      engine: engineName,
      success: false,
      error: error.message
    };
  }
}

function compareResults(v1Result, v2Result) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('COMPARISON');
  console.log('='.repeat(60));

  if (!v1Result.success || !v2Result.success) {
    console.log('\n⚠️  Cannot compare - one or both engines failed');
    return;
  }

  const v1 = v1Result.data;
  const v2 = v2Result.data;

  console.log('\nData Points:');
  console.log(`  V1 dates: ${v1.dates?.length || 0}`);
  console.log(`  V2 dates: ${v2.dates?.length || 0}`);
  console.log(`  Match: ${v1.dates?.length === v2.dates?.length ? '✓' : '✗'}`);

  if (v1.metrics && v2.metrics) {
    console.log('\nMetrics Comparison:');

    const cagrDiff = Math.abs((v1.metrics.cagr - v2.metrics.cagr) * 100);
    console.log(`  CAGR: V1=${(v1.metrics.cagr * 100).toFixed(2)}% | V2=${(v2.metrics.cagr * 100).toFixed(2)}% | Diff=${cagrDiff.toFixed(2)}%`);

    if (v1.metrics.sharpe && v2.metrics.sharpe) {
      const sharpeDiff = Math.abs(v1.metrics.sharpe - v2.metrics.sharpe);
      console.log(`  Sharpe: V1=${v1.metrics.sharpe.toFixed(2)} | V2=${v2.metrics.sharpe.toFixed(2)} | Diff=${sharpeDiff.toFixed(2)}`);
    }

    const ddDiff = Math.abs((v1.metrics.maxDrawdown - v2.metrics.maxDrawdown) * 100);
    console.log(`  Max DD: V1=${(v1.metrics.maxDrawdown * 100).toFixed(2)}% | V2=${(v2.metrics.maxDrawdown * 100).toFixed(2)}% | Diff=${ddDiff.toFixed(2)}%`);

    const finalV1 = v1.equityCurve?.[v1.equityCurve.length - 1] || 0;
    const finalV2 = v2.equityCurve?.[v2.equityCurve.length - 1] || 0;
    const equityDiff = Math.abs(finalV1 - finalV2);
    console.log(`  Final Equity: V1=${finalV1.toFixed(4)} | V2=${finalV2.toFixed(4)} | Diff=${equityDiff.toFixed(4)}`);
  }

  // Sample a few equity curve points
  if (v1.equityCurve && v2.equityCurve && v1.equityCurve.length > 0) {
    console.log('\nEquity Curve Sample (first 5 points):');
    const sampleSize = Math.min(5, v1.equityCurve.length, v2.equityCurve.length);
    for (let i = 0; i < sampleSize; i++) {
      const diff = Math.abs(v1.equityCurve[i] - v2.equityCurve[i]);
      console.log(`  [${i}] V1=${v1.equityCurve[i].toFixed(4)} | V2=${v2.equityCurve[i].toFixed(4)} | Diff=${diff.toFixed(4)}`);
    }
  }
}

async function main() {
  console.log('Starting Engine Comparison Test...');
  console.log(`Strategy: Buy and hold ${testStrategy.elements[0].ticker}`);
  console.log(`Date range: ${testStrategy.startDate} to ${testStrategy.endDate}`);

  // Check if server is running
  try {
    await axios.get('http://localhost:8080/health');
  } catch (error) {
    console.error('\n❌ Server is not running on http://localhost:8080');
    console.error('Please start the backend server first.');
    process.exit(1);
  }

  const v1Result = await runBacktest(false);
  const v2Result = await runBacktest(true);

  compareResults(v1Result, v2Result);
}

main().catch(console.error);
