import { BaseBot } from "./BaseBot.js";
import {
  type TradingPair,
  type Order,
  type PairConfig,
} from "../core/types.js";
import { marketDataProvider } from "../market_data/ccxtProvider.js";
import { logger } from "../core/logger.js";
import {
  applyVariance,
  roundToDecimalPlaces,
  findMatchingOrder,
} from "../core/utils.js";
import { OrderSide, OrderType } from "@flashnet/js-sdk";

export class MarketMakerBot extends BaseBot {
  private activeMakerOrders: Map<string, Order> = new Map();
  private orderIdCounter: number = 0;

  constructor(
    pair: TradingPair,
    config: Required<PairConfig>,
    mnemonic: string,
    network: "REGTEST" | "MAINNET" = "REGTEST",
    httpUrl?: string,
    wsUrl?: string
  ) {
    super(pair, config, mnemonic, network, httpUrl, wsUrl);
    logger.info(`MarketMakerBot created for ${pair.symbol}`, {
      config: this.config.marketMaker,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`MarketMakerBot starting for ${this.pair.symbol}...`);
    // Initial run slightly delayed to allow data fetch
    this.scheduleNextRun(500);
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    // Simulate canceling all orders on stop
    if (this.activeMakerOrders.size > 0) {
      logger.info(
        `MarketMakerBot stopping for ${this.pair.symbol}. Simulating cancel of ${this.activeMakerOrders.size} orders.`
      );
      // In real implementation, send cancel requests here
      this.activeMakerOrders.forEach((order, pseudoId) => {
        logger.debug(`MM: [${this.pair.symbol}] Simulating CANCEL Order`, {
          pseudoId,
        });
      });
      this.activeMakerOrders.clear();
    } else {
      logger.info(
        `MarketMakerBot stopping for ${this.pair.symbol}. No active orders to cancel.`
      );
    }
  }

  private generateOrderId(): string {
    return `${this.pair.symbol}-${++this.orderIdCounter}`;
  }

  private async manageOrders(newOrders: Order[]): Promise<void> {
    const cancelReplaceRatio = this.config.marketMaker?.cancelReplaceRatio ?? 0;

    // Track which new orders have been matched to avoid duplicates
    const matchedNewOrders = new Set<Order>();

    // Step 1: Identify orders to keep vs cancel
    const ordersToKeep: Order[] = [];
    const ordersToCancel: Order[] = [];

    // Maximum allowed deviations based on market conditions
    const maxPriceDeviation = 0.001; // 0.1%
    const maxSizeDeviation = 0.1; // 10%

    // First pass: try to match existing orders with new ones
    for (const [orderId, existingOrder] of this.activeMakerOrders.entries()) {
      const matchingNewOrder = findMatchingOrder(
        existingOrder,
        newOrders.filter((o) => !matchedNewOrders.has(o)),
        maxPriceDeviation,
        maxSizeDeviation
      );

      if (matchingNewOrder && Math.random() > cancelReplaceRatio) {
        // Keep the existing order if it's similar enough and random check passes
        ordersToKeep.push(existingOrder);
        matchedNewOrders.add(matchingNewOrder);
      } else {
        ordersToCancel.push(existingOrder);
      }
    }

    // Step 2: Cancel orders that need to be replaced
    if (ordersToCancel.length > 0) {
      logger.debug(
        `MM: [${this.pair.symbol}] Canceling ${ordersToCancel.length} orders.`
      );

      const orderIdsToCancel = ordersToCancel
        .map((order) => order.id)
        .filter((id): id is string => id !== undefined);

      if (orderIdsToCancel.length > 0) {
        try {
          await this.client.cancelOrders(orderIdsToCancel);
          ordersToCancel.forEach((order) => {
            const orderId = Array.from(this.activeMakerOrders.entries()).find(
              ([_, o]) => o === order
            )?.[0];
            if (orderId) {
              this.activeMakerOrders.delete(orderId);
              logger.debug(
                `MM: [-] Canceled order: ${order.side} ${order.size} @ ${order.price}`
              );
            }
          });
        } catch (error: any) {
          logger.error(`MM: Error canceling orders`, {
            error: error.message,
            orderIds: orderIdsToCancel,
          });
        }
      }
    }

    // Step 3: Place new orders that weren't matched
    const ordersToPlace = newOrders.filter(
      (order) => !matchedNewOrders.has(order)
    );

    if (ordersToPlace.length > 0) {
      logger.info(
        `MM: [${this.pair.symbol}] Placing ${ordersToPlace.length} new orders.`
      );

      for (const order of ordersToPlace) {
        try {
          const flashnetOrder = {
            side: order.side === "bid" ? OrderSide.Bid : OrderSide.Ask,
            baseAsset: this.pair.baseAsset,
            quoteAsset: this.pair.quoteAsset,
            quantity: order.size.toString(),
            price: order.price?.toString() ?? "0",
            type: OrderType.Limit,
            stpMode: "IGNORE",
          };

          const result = await this.client.submitOrder(flashnetOrder);

          // Get the order ID using the proper method
          const orderIds = result.getOrderIds();
          if (orderIds && orderIds.length > 0) {
            const orderId = orderIds[0];
            if (orderId) {
              const finalOrder = {
                ...order,
                id: orderId,
                status: "new" as const,
              };

              logger.info(
                `MM: [+] ${order.side.toUpperCase()} ${order.size.toFixed(
                  8
                )} @ ${order.price?.toFixed(5)} (Level ${order.level})`
              );

              this.activeMakerOrders.set(orderId, finalOrder);
            }
          }
        } catch (error: any) {
          logger.error(`MM: Error placing order`, {
            error: error.message,
            order,
          });
        }
      }
    }

    // Log summary
    logger.info(`MM: [${this.pair.symbol}] Order update summary:`, {
      existingOrders: this.activeMakerOrders.size,
      cancelled: ordersToCancel.length,
      kept: ordersToKeep.length,
      new: ordersToPlace.length,
    });
  }

  protected async run(): Promise<void> {
    try {
      const ticker = await marketDataProvider.fetchTicker(this.pair.ccxtSymbol);
      if (!ticker || ticker.bid === null || ticker.ask === null) {
        logger.warn(
          `MM: [${this.pair.symbol}] No valid ticker data. Skipping cycle.`
        );
        this.scheduleNextRun(this.getUpdateInterval());
        return;
      }

      // --- Calculate Reference Price and Spread ---
      const midPrice = (ticker.bid + ticker.ask) / 2;
      // TODO: Use a more robust volatility measure later (e.g., std dev of recent prices)
      const currentVolatility = this.config.volatilityEstimate || 0.01; // Use estimate or a default

      // Ensure required config values exist with defaults
      const baseSpreadPercentage =
        this.config.marketMaker?.baseSpreadPercentage ?? 0.001;
      const spreadVolatilityMultiplier =
        this.config.marketMaker?.spreadVolatilityMultiplier ?? 1;
      const depthLevels = this.config.marketMaker?.depthLevels ?? 1;
      const baseSizePerLevel = this.config.marketMaker?.baseSizePerLevel ?? 0.1;
      const sizeRandomizationFactor =
        this.config.marketMaker?.sizeRandomizationFactor ?? 0.1;

      const spread =
        baseSpreadPercentage *
        (1 + currentVolatility * spreadVolatilityMultiplier);
      let targetBestAsk = midPrice * (1 + spread / 2);
      let targetBestBid = midPrice * (1 - spread / 2);

      // Basic sanity check: bid < ask
      if (targetBestBid >= targetBestAsk) {
        logger.warn(
          `MM: [${this.pair.symbol}] Calculated target bid >= ask. Widening spread slightly.`,
          { bid: targetBestBid, ask: targetBestAsk }
        );
        // Simple fix: slightly increase ask, decrease bid. Needs refinement.
        targetBestAsk *= 1.0001;
        targetBestBid *= 0.9999;
        if (targetBestBid >= targetBestAsk) {
          logger.error(
            `MM: [${this.pair.symbol}] Cannot resolve bid >= ask issue. Skipping cycle.`
          );
          this.scheduleNextRun(this.getUpdateInterval());
          return;
        }
      }

      // --- Generate New Orders ---
      const newOrders: Order[] = [];
      const priceIncrement = (targetBestAsk - targetBestBid) / 2; // Simple increment, can be more complex

      for (let i = 0; i < depthLevels; i++) {
        const levelFactor = 1 + i * 0.1; // Make deeper levels slightly wider/larger (example)

        // Bid Side
        const bidPrice = roundToDecimalPlaces(
          targetBestBid - i * priceIncrement * levelFactor,
          5
        ); // Adjust decimal places based on pair
        if (bidPrice <= 0) continue; // Avoid negative or zero prices
        const bidSize = roundToDecimalPlaces(
          applyVariance(
            baseSizePerLevel * levelFactor,
            sizeRandomizationFactor
          ),
          8
        ); // Adjust decimals
        if (bidSize > 0) {
          newOrders.push({
            pair: this.pair.symbol,
            side: "bid",
            type: "limit",
            price: bidPrice,
            size: bidSize,
            timestamp: Date.now(),
            level: i + 1,
          });
        }

        // Ask Side
        const askPrice = roundToDecimalPlaces(
          targetBestAsk + i * priceIncrement * levelFactor,
          5
        ); // Adjust decimal places based on pair
        const askSize = roundToDecimalPlaces(
          applyVariance(
            baseSizePerLevel * levelFactor,
            sizeRandomizationFactor
          ),
          8
        ); // Adjust decimals
        if (askSize > 0) {
          newOrders.push({
            pair: this.pair.symbol,
            side: "ask",
            type: "limit",
            price: askPrice,
            size: askSize,
            timestamp: Date.now(),
            level: i + 1,
          });
        }
      }

      // Use new order management logic
      await this.manageOrders(newOrders);
    } catch (error: any) {
      logger.error(`MM: [${this.pair.symbol}] Error during run cycle`, {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.scheduleNextRun(this.getUpdateInterval());
    }
  }

  private getUpdateInterval(): number {
    const updateIntervalMs = this.config.marketMaker?.updateIntervalMs ?? 5000;
    const updateIntervalVariance =
      this.config.marketMaker?.updateIntervalVariance ?? 0.1;
    return applyVariance(updateIntervalMs, updateIntervalVariance);
  }
}
