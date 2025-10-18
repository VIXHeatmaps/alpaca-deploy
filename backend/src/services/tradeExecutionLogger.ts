/**
 * Trade Execution Logger
 *
 * Captures comprehensive audit trail of all trading activity for debugging,
 * compliance, and user transparency.
 */

import db from '../db/connection';
import { getAlpacaPositions } from './orders';
import { validateAttribution } from './positionAttribution';
import axios from 'axios';

type ExecutionType = 'deployment' | 'rebalance' | 'liquidation';

type PlannedOrder = {
  symbol: string;
  side: 'buy' | 'sell';
  target_dollars: number;
};

type PlacedOrder = {
  order_id: string;
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  requested_at: string;
};

type FilledOrder = {
  order_id: string;
  symbol: string;
  filled_qty: number;
  avg_price: number;
  filled_at: string;
  cost: number;
};

type FailedOrder = {
  symbol: string;
  side: 'buy' | 'sell';
  error: string;
  failed_at: string;
};

export class TradeExecutionLogger {
  private logId: number | null = null;
  private strategyId: number;
  private executionType: ExecutionType;
  private startTime: number;
  private logs: string[] = [];

  private preExecutionHoldings: any = null;
  private preExecutionCapital: number | null = null;
  private attributionBefore: any = null;

  private targetAllocation: Record<string, number> = {};
  private plannedOrders: PlannedOrder[] = [];
  private placedOrders: PlacedOrder[] = [];
  private filledOrders: FilledOrder[] = [];
  private failedOrders: FailedOrder[] = [];

  constructor(strategyId: number, executionType: ExecutionType) {
    this.strategyId = strategyId;
    this.executionType = executionType;
    this.startTime = Date.now();
  }

  /**
   * Start logging - capture pre-execution state
   */
  async start(
    holdings: any[],
    capital: number,
    attribution: any
  ): Promise<void> {
    this.preExecutionHoldings = holdings;
    this.preExecutionCapital = capital;
    this.attributionBefore = attribution;

    this.log(`Starting ${this.executionType} for strategy #${this.strategyId}`);
    this.log(`Pre-execution capital: $${capital.toFixed(2)}`);
    this.log(`Pre-execution holdings: ${JSON.stringify(holdings)}`);

    // Create log record in database
    const result = await db('trade_execution_logs')
      .insert({
        active_strategy_id: this.strategyId,
        execution_type: this.executionType,
        execution_date: new Date(),
        pre_execution_holdings: JSON.stringify(holdings),
        pre_execution_capital: capital,
        attribution_before: JSON.stringify(attribution),
        success: false, // Will update to true on successful completion
      })
      .returning('id');

    this.logId = result[0].id;
    this.log(`Created execution log #${this.logId}`);
  }

  /**
   * Log the target allocation determined by strategy evaluation
   */
  logTargetAllocation(allocation: Record<string, number>): void {
    this.targetAllocation = allocation;
    this.log(`Target allocation: ${JSON.stringify(allocation)}`);
  }

  /**
   * Log a planned order before placing it
   */
  logPlannedOrder(symbol: string, side: 'buy' | 'sell', targetDollars: number): void {
    this.plannedOrders.push({ symbol, side, target_dollars: targetDollars });
    this.log(`Planned: ${side} $${targetDollars.toFixed(2)} of ${symbol}`);
  }

  /**
   * Log an order that was placed with Alpaca
   */
  logPlacedOrder(orderId: string, symbol: string, qty: number, side: 'buy' | 'sell'): void {
    const placedOrder: PlacedOrder = {
      order_id: orderId,
      symbol,
      qty,
      side,
      requested_at: new Date().toISOString(),
    };
    this.placedOrders.push(placedOrder);
    this.log(`Placed order ${orderId}: ${side} ${qty.toFixed(4)} ${symbol}`);
  }

  /**
   * Log an order that filled successfully
   */
  logFilledOrder(orderId: string, symbol: string, filledQty: number, avgPrice: number): void {
    const cost = filledQty * avgPrice;
    const filledOrder: FilledOrder = {
      order_id: orderId,
      symbol,
      filled_qty: filledQty,
      avg_price: avgPrice,
      filled_at: new Date().toISOString(),
      cost,
    };
    this.filledOrders.push(filledOrder);
    this.log(`Filled order ${orderId}: ${filledQty.toFixed(4)} ${symbol} @ $${avgPrice.toFixed(2)} = $${cost.toFixed(2)}`);
  }

  /**
   * Log an order that failed
   */
  logFailedOrder(symbol: string, side: 'buy' | 'sell', error: string): void {
    const failedOrder: FailedOrder = {
      symbol,
      side,
      error,
      failed_at: new Date().toISOString(),
    };
    this.failedOrders.push(failedOrder);
    this.log(`FAILED: ${side} ${symbol} - ${error}`);
  }

  /**
   * Finish logging - capture post-execution state and save to database
   */
  async finish(
    success: boolean,
    postExecutionHoldings: any[],
    postExecutionCapital: number,
    attributionAfter: any,
    apiKey: string,
    apiSecret: string,
    errorMessage?: string
  ): Promise<void> {
    const duration = Date.now() - this.startTime;
    this.log(`Execution ${success ? 'succeeded' : 'FAILED'} in ${duration}ms`);

    if (errorMessage) {
      this.log(`Error: ${errorMessage}`);
    }

    // Fetch Alpaca positions snapshot
    let alpacaPositions: any[] = [];
    let alpacaAccount: any = null;

    try {
      alpacaPositions = await getAlpacaPositions(apiKey, apiSecret);
      this.log(`Alpaca positions snapshot: ${alpacaPositions.length} positions`);

      const accountResponse = await axios.get('https://paper-api.alpaca.markets/v2/account', {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
        timeout: 10000,
      });
      alpacaAccount = {
        portfolio_value: accountResponse.data.portfolio_value,
        cash: accountResponse.data.cash,
        equity: accountResponse.data.equity,
        long_market_value: accountResponse.data.long_market_value,
        buying_power: accountResponse.data.buying_power,
      };
      this.log(`Alpaca account: $${alpacaAccount.cash} cash, $${alpacaAccount.portfolio_value} portfolio value`);
    } catch (err: any) {
      this.log(`Failed to fetch Alpaca snapshots: ${err.message}`);
    }

    // Validate attribution
    let attributionValidation: any = null;
    try {
      attributionValidation = await validateAttribution();
      if (!attributionValidation.valid) {
        this.log(`Attribution validation FAILED: ${attributionValidation.errors.join(', ')}`);
      } else {
        this.log(`Attribution validation passed`);
      }
    } catch (err: any) {
      this.log(`Attribution validation error: ${err.message}`);
    }

    // Calculate discrepancies
    const discrepancies: any[] = [];

    // Check if our holdings match Alpaca
    for (const holding of postExecutionHoldings) {
      const alpacaPos = alpacaPositions.find(p => p.symbol === holding.symbol);
      if (!alpacaPos) {
        discrepancies.push({
          type: 'missing_in_alpaca',
          symbol: holding.symbol,
          our_qty: holding.qty,
          alpaca_qty: 0,
        });
      } else if (Math.abs(alpacaPos.qty - holding.qty) > 0.0001) {
        discrepancies.push({
          type: 'quantity_mismatch',
          symbol: holding.symbol,
          our_qty: holding.qty,
          alpaca_qty: alpacaPos.qty,
          difference: alpacaPos.qty - holding.qty,
        });
      }
    }

    if (discrepancies.length > 0) {
      this.log(`Found ${discrepancies.length} discrepancies between our records and Alpaca`);
    }

    // Update database record
    if (this.logId) {
      await db('trade_execution_logs')
        .where({ id: this.logId })
        .update({
          target_allocation: JSON.stringify(this.targetAllocation),
          planned_orders: JSON.stringify(this.plannedOrders),
          placed_orders: JSON.stringify(this.placedOrders),
          filled_orders: JSON.stringify(this.filledOrders),
          failed_orders: JSON.stringify(this.failedOrders),
          post_execution_holdings: JSON.stringify(postExecutionHoldings),
          post_execution_capital: postExecutionCapital,
          attribution_after: JSON.stringify(attributionAfter),
          attribution_validation: attributionValidation ? JSON.stringify(attributionValidation) : null,
          alpaca_positions_snapshot: JSON.stringify(alpacaPositions),
          alpaca_account_snapshot: alpacaAccount ? JSON.stringify(alpacaAccount) : null,
          discrepancies: discrepancies.length > 0 ? JSON.stringify(discrepancies) : null,
          execution_duration_ms: duration,
          success,
          error_message: errorMessage || null,
          logs: this.logs.join('\n'),
        });

      this.log(`Updated execution log #${this.logId}`);
    }

    console.log(`\n[EXECUTION LOG #${this.logId}] Summary:`);
    console.log(`  Type: ${this.executionType}`);
    console.log(`  Strategy: #${this.strategyId}`);
    console.log(`  Duration: ${duration}ms`);
    console.log(`  Success: ${success}`);
    console.log(`  Planned orders: ${this.plannedOrders.length}`);
    console.log(`  Filled orders: ${this.filledOrders.length}`);
    console.log(`  Failed orders: ${this.failedOrders.length}`);
    console.log(`  Discrepancies: ${discrepancies.length}`);
    if (errorMessage) {
      console.log(`  Error: ${errorMessage}`);
    }
    console.log('');
  }

  /**
   * Internal logging method
   */
  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.logs.push(`[${timestamp}] ${message}`);
  }

  /**
   * Get the log ID (useful for referencing in other logs)
   */
  getLogId(): number | null {
    return this.logId;
  }
}
