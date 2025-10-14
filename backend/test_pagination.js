/**
 * Test pagination fix for data fetcher
 */
const axios = require('axios');

async function testPagination() {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('Error: ALPACA_API_KEY and ALPACA_API_SECRET must be set');
    process.exit(1);
  }

  console.log('Testing pagination with 5 symbols that should exceed 10k limit...\n');

  const url = 'https://data.alpaca.markets/v2/stocks/bars';
  const symbols = ['GLD', 'XLK', 'TLT', 'BIL', 'SPY'];

  const baseParams = {
    symbols: symbols.join(','),
    start: '2016-01-04',
    end: '2025-10-14',
    timeframe: '1Day',
    adjustment: 'all',
    feed: 'sip',
    limit: 10000,
  };

  const result = {};
  for (const symbol of symbols) {
    result[symbol] = 0;
  }

  let pageToken = null;
  let pageCount = 0;
  let totalBars = 0;

  console.log(`📊 Fetching: ${symbols.join(', ')}`);
  console.log(`   Date range: 2016-01-04 → 2025-10-14\n`);

  do {
    pageCount++;

    const params = { ...baseParams };
    if (pageToken) {
      params.page_token = pageToken;
    }

    console.log(`   Page ${pageCount}: Fetching...`);

    const response = await axios.get(url, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
      params,
      timeout: 30000,
    });

    const bars = response.data.bars || {};
    pageToken = response.data.next_page_token || null;

    let pageBars = 0;
    for (const [symbol, symbolBars] of Object.entries(bars)) {
      if (!Array.isArray(symbolBars)) continue;
      result[symbol] += symbolBars.length;
      pageBars += symbolBars.length;
    }

    totalBars += pageBars;
    console.log(`   Page ${pageCount}: Got ${pageBars} bars (total: ${totalBars})`);

    if (pageToken) {
      console.log(`   → next_page_token exists, fetching next page...\n`);
    }
  } while (pageToken);

  console.log(`\n✓ Pagination complete!\n`);
  console.log(`📈 Results:`);
  console.log(`   Total pages: ${pageCount}`);
  console.log(`   Total bars: ${totalBars}`);
  console.log(`\n   Bars per symbol:`);
  for (const symbol of symbols) {
    console.log(`     ${symbol}: ${result[symbol]} bars`);
  }

  // Check if XLK got full data
  if (result.XLK > 164) {
    console.log(`\n✅ SUCCESS: XLK got ${result.XLK}} bars (was stuck at 164 before)`);
  } else {
    console.log(`\n⚠️  WARNING: XLK still only has ${result.XLK}} bars`);
  }
}

testPagination().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
