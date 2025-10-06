/**
 * Quick test script for activeStrategy storage
 * Run with: npx ts-node src/storage/testStorage.ts
 */

import { getActiveStrategy, setActiveStrategy, clearActiveStrategy, hasActiveStrategy } from './activeStrategy';

async function test() {
  console.log('Testing Active Strategy Storage...\n');

  // Test 1: Initially should be empty
  console.log('1. Check if strategy exists (should be false)');
  const exists1 = await hasActiveStrategy();
  console.log('   Has strategy:', exists1);

  // Test 2: Save a strategy
  console.log('\n2. Save test strategy');
  const testStrategy = {
    id: 'test-123',
    name: 'Test Strategy',
    investAmount: 10000,
    currentValue: 10000,
    flowData: {
      nodes: [{ id: 'start-1', type: 'start', data: { label: 'Test Flow' } }],
      edges: [],
      globals: { benchmarkSymbol: 'SPY' }
    },
    holdings: [
      { symbol: 'SPY', qty: 23.45 }
    ],
    createdAt: new Date().toISOString(),
    lastRebalance: null
  };

  await setActiveStrategy(testStrategy);
  console.log('   Strategy saved');

  // Test 3: Load it back
  console.log('\n3. Load strategy back');
  const loaded = await getActiveStrategy();
  console.log('   Loaded strategy:', loaded?.name);
  console.log('   Holdings:', loaded?.holdings);

  // Test 4: Check exists
  console.log('\n4. Check if strategy exists (should be true)');
  const exists2 = await hasActiveStrategy();
  console.log('   Has strategy:', exists2);

  // Test 5: Clear it
  console.log('\n5. Clear strategy');
  await clearActiveStrategy();
  console.log('   Strategy cleared');

  // Test 6: Verify cleared
  console.log('\n6. Check if strategy exists (should be false again)');
  const exists3 = await hasActiveStrategy();
  console.log('   Has strategy:', exists3);

  console.log('\n✅ All tests passed!');
}

test().catch(console.error);
