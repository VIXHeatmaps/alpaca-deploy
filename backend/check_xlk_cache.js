/**
 * Check what XLK data is in Redis cache
 */
const Redis = require('ioredis');

async function checkCache() {
  console.log('Connecting to Redis...\n');

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 2000);
    },
  });

  try {
    await redis.ping();
    console.log('✓ Connected to Redis\n');

    // Search for XLK price keys
    console.log('📊 Searching for XLK price data in cache...\n');

    const pattern = 'price:XLK:*';
    const keys = [];

    const stream = redis.scanStream({
      match: pattern,
      count: 100,
    });

    stream.on('data', (batch) => {
      keys.push(...batch);
    });

    await new Promise((resolve, reject) => {
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    console.log(`Found ${keys.length} XLK price entries in cache\n`);

    if (keys.length > 0) {
      // Sort keys by date
      const sortedKeys = keys.sort();

      console.log(`First key: ${sortedKeys[0]}`);
      console.log(`Last key:  ${sortedKeys[sortedKeys.length - 1]}`);

      // Extract dates
      const dates = sortedKeys.map(k => k.split(':')[2]).sort();
      console.log(`\nDate range: ${dates[0]} → ${dates[dates.length - 1]}`);

      // Check for gaps around 2016-08-25
      console.log('\n🔍 Checking dates around 2016-08-25:');
      const testDates = [
        '2016-08-22', '2016-08-23', '2016-08-24', '2016-08-25',
        '2016-08-26', '2016-08-29', '2016-08-30', '2016-08-31',
      ];

      for (const date of testDates) {
        const key = `price:XLK:${date}`;
        const exists = await redis.exists(key);
        console.log(`  ${date}: ${exists ? '✓ EXISTS' : '✗ MISSING'}`);
      }

      // Sample some data
      console.log('\n📈 Sample data for 2016-08-25:');
      const sampleKey = 'price:XLK:2016-08-25';
      const data = await redis.get(sampleKey);
      if (data) {
        const bar = JSON.parse(data);
        console.log(JSON.stringify(bar, null, 2));
      } else {
        console.log('  No data found');
      }
    } else {
      console.log('⚠️  No XLK data found in cache');
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    redis.disconnect();
  }
}

checkCache().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
