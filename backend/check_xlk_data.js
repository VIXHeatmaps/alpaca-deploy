/**
 * Quick script to check XLK data availability from Alpaca
 */
const axios = require('axios');

async function checkXLKData() {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('Error: ALPACA_API_KEY and ALPACA_API_SECRET must be set');
    process.exit(1);
  }

  console.log('Querying Alpaca API for XLK data...\n');

  // Test multiple date ranges
  const testRanges = [
    { start: '2016-08-20', end: '2016-09-05', label: 'Around cutoff (Aug 25)' },
    { start: '2016-01-04', end: '2016-01-20', label: 'Early 2016' },
    { start: '2024-01-01', end: '2024-01-20', label: 'Recent data (2024)' },
    { start: '2016-01-04', end: '2025-10-14', label: 'Full range' },
  ];

  for (const range of testRanges) {
    try {
      const url = 'https://data.alpaca.markets/v2/stocks/bars';
      const params = {
        symbols: 'XLK',
        start: range.start,
        end: range.end,
        timeframe: '1Day',
        adjustment: 'all',
        feed: 'sip',
        limit: 10000,
      };

      console.log(`\n📊 Testing: ${range.label}`);
      console.log(`   Date range: ${range.start} → ${range.end}`);

      const response = await axios.get(url, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        params,
        timeout: 30000,
      });

      const bars = response.data?.bars?.XLK || [];
      console.log(`   ✓ Received ${bars.length} bars`);

      if (bars.length > 0) {
        const firstDate = bars[0].t.slice(0, 10);
        const lastDate = bars[bars.length - 1].t.slice(0, 10);
        console.log(`   First bar: ${firstDate}`);
        console.log(`   Last bar:  ${lastDate}`);
      } else {
        console.log(`   ⚠️  No data returned!`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      if (err.response) {
        console.error(`   Status: ${err.response.status}`);
        console.error(`   Data:`, err.response.data);
      }
    }
  }

  console.log('\n✓ Data check complete');
}

checkXLKData().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
