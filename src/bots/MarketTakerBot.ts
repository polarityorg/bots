import { BaseBot } from "./BaseBot.js";
import {
  type TradingPair,
  type Order,
  type TickerData,
  type PairConfig,
  type OrderSide as InternalOrderSide,
  type OrderType as InternalOrderType,
  type MarketTakerConfig,
} from "../core/types.js";
import { marketDataProvider } from "../market_data/ccxtProvider.js";
import { logger } from "../core/logger.js";
import {
  applyVariance,
  getRandomArbitrary,
  roundToDecimalPlaces,
} from "../core/utils.js";
import { OrderSide, OrderType } from "@flashnet/js-sdk";

export class MarketTakerBot extends BaseBot {
  private recentPrices: number[] = []; // Store recent prices for strategy decisions

  constructor(
    pair: TradingPair,
    config: Required<PairConfig>,
    mnemonic: string,
    network: "REGTEST" | "MAINNET" = "REGTEST",
    httpUrl?: string,
    wsUrl?: string
  ) {
    super(pair, config, mnemonic, network, httpUrl, wsUrl);
    logger.info(`MarketTakerBot created for ${pair.symbol}`, {
      config: this.config.marketTaker,
    });
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`MarketTakerBot starting for ${this.pair.symbol}...`);
    this.scheduleNextRun(this.getActionInterval()); // Start the first run
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    logger.info(`MarketTakerBot stopping for ${this.pair.symbol}.`);
  }

  protected async run(): Promise<void> {
    try {
      const ticker = await marketDataProvider.fetchTicker(this.pair.ccxtSymbol);
      if (
        !ticker ||
        ticker.bid === null ||
        ticker.ask === null ||
        ticker.last === null
      ) {
        logger.warn(
          `MT: [${this.pair.symbol}] No valid ticker data. Skipping cycle.`
        );
        this.scheduleNextRun(this.getActionInterval());
        return;
      }

      // Update recent prices
      this.updateRecentPrices(ticker.last);

      // --- Decide on Action (Strategy & Order Type) ---
      const strategy = this.chooseStrategy();
      const order = this.generateOrderBasedOnStrategy(strategy, ticker);

      if (order) {
        try {
          const flashnetOrder = {
            side: order.side === "bid" ? OrderSide.Bid : OrderSide.Ask,
            baseAsset: this.pair.baseAsset,
            quoteAsset: this.pair.quoteAsset,
            quantity: order.size.toString(),
            price:
              order.type === "limit" && order.price
                ? order.price.toString()
                : "0",
            type: order.type === "limit" ? OrderType.Limit : OrderType.Market,
            stpMode: "IGNORE",
          };

          const result = await this.client.submitOrder(flashnetOrder);
          const orderIds = result.getOrderIds();

          if (orderIds && orderIds.length > 0) {
            if (order.type === "market") {
              logger.info(`MT: [${this.pair.symbol}] Placed MARKET Order`, {
                side: order.side,
                size: order.size,
                strategy,
                orderId: orderIds[0],
              });
            } else {
              logger.info(`MT: [${this.pair.symbol}] Placed LIMIT Order`, {
                side: order.side,
                size: order.size,
                price: order.price,
                strategy,
                orderId: orderIds[0],
              });
            }
          }
        } catch (error: any) {
          logger.error(`MT: Error placing order`, {
            error: error.message,
            order,
          });
        }
      } else {
        logger.debug(
          `MT: [${this.pair.symbol}] No taker order generated this cycle.`,
          { strategy }
        );
      }
    } catch (error: any) {
      logger.error(`MT: [${this.pair.symbol}] Error during run cycle`, {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      // Schedule the next run
      this.scheduleNextRun(this.getActionInterval());
    }
  }

  private updateRecentPrices(lastPrice: number): void {
    this.recentPrices.push(lastPrice);
    const marketTaker = this.config.marketTaker as Required<MarketTakerConfig>;
    const lookbackTicks = marketTaker.momentumLookbackTicks;
    if (this.recentPrices.length > lookbackTicks) {
      this.recentPrices.shift(); // Keep only the last N prices
    }
  }

  private chooseStrategy(): keyof MarketTakerConfig["strategyProbabilities"] {
    const rand = Math.random();
    let cumulativeProb = 0;
    const marketTaker = this.config.marketTaker as Required<MarketTakerConfig>;
    const probs = marketTaker.strategyProbabilities;

    if (rand < (cumulativeProb += probs.random)) return "random";
    if (rand < (cumulativeProb += probs.momentum)) return "momentum";
    if (rand < (cumulativeProb += probs.meanReversion)) return "meanReversion";
    if (rand < (cumulativeProb += probs.passiveLimit)) return "passiveLimit";

    return "random"; // Fallback
  }

  private generateOrderBasedOnStrategy(
    strategy: keyof MarketTakerConfig["strategyProbabilities"],
    ticker: TickerData
  ): Order | null {
    const marketTaker = this.config.marketTaker as Required<MarketTakerConfig>;
    const isMarketOrder = Math.random() < marketTaker.marketOrderProbability;
    const baseSize = marketTaker.baseOrderSize;
    const size = roundToDecimalPlaces(
      applyVariance(baseSize, marketTaker.sizeRandomizationFactor),
      8
    ); // Adjust decimals

    if (size <= 0) return null; // Avoid zero or negative size orders

    let side: InternalOrderSide | null = null;
    let price: number | undefined = undefined;
    let type: InternalOrderType = isMarketOrder ? "market" : "limit";

    // Ensure we have bid/ask for limit orders or strategy decisions
    if (!ticker.bid || !ticker.ask || !ticker.last) return null;

    const midPrice = (ticker.bid + ticker.ask) / 2;

    switch (strategy) {
      case "momentum":
        if (this.recentPrices.length >= 2) {
          const trend =
            this.recentPrices[this.recentPrices.length - 1]! -
            this.recentPrices[0]!;
          if (trend > 0) side = "bid";
          else if (trend < 0) side = "ask";
        }
        // If no clear trend, fall back to random or do nothing
        if (!side) side = Math.random() < 0.5 ? "bid" : "ask";
        break;

      case "meanReversion":
        // Simple mean reversion: if price deviates significantly, trade back
        // Requires a longer-term average, let's use mid of recentPrices for simplicity
        if (this.recentPrices.length > 1) {
          const avgPrice =
            this.recentPrices.reduce((a, b) => a + b, 0) /
            this.recentPrices.length;
          const deviation = (ticker.last - avgPrice) / avgPrice;
          const threshold = marketTaker.meanReversionThreshold;
          if (deviation > threshold) {
            side = "ask"; // Price is high, ask
          } else if (deviation < -threshold) {
            side = "bid"; // Price is low, bid
          }
        }
        // If no signal, do nothing for this strategy this tick
        if (!side) return null;
        break;

      case "passiveLimit":
        // Place a limit order inside the spread or at best bid/ask
        type = "limit"; // Force limit order
        side = Math.random() < 0.5 ? "bid" : "ask";
        if (side === "bid") {
          // Place slightly above best bid or at best bid
          price = roundToDecimalPlaces(
            ticker.bid * (1 + getRandomArbitrary(0.0001, 0.0005)),
            5
          ); // Adjust decimals
        } else {
          // Place slightly below best ask or at best ask
          price = roundToDecimalPlaces(
            ticker.ask * (1 - getRandomArbitrary(0.0001, 0.0005)),
            5
          ); // Adjust decimals
        }
        // Ensure bid price <= ask and ask price >= bid
        if (side === "bid" && price > ticker.ask) price = ticker.ask;
        if (side === "ask" && price < ticker.bid) price = ticker.bid;

        // Prevent crossing orders generated by the taker itself in limit mode
        if (price <= ticker.bid && side === "ask") price = ticker.bid; // Adjust ask price if needed
        if (price >= ticker.ask && side === "bid") price = ticker.ask; // Adjust bid price if needed
        break;

      case "random":
      default:
        side = Math.random() < 0.5 ? "bid" : "ask";
        break;
    }

    if (!side) return null; // Should not happen normally, but safety check

    // Determine price for non-passive limit orders
    if (type === "limit" && price === undefined) {
      if (side === "bid") {
        // Limit bid: aim for below current ask, maybe mid-price or slightly better than bid
        price = roundToDecimalPlaces(
          getRandomArbitrary(ticker.bid * 0.9995, midPrice),
          5
        ); // Adjust range and decimals
        price = Math.min(price, ticker.ask * 0.9999); // Ensure it's below ask
        price = Math.max(price, ticker.bid * 0.99); // Ensure it's not drastically lower than bid
      } else {
        // side === 'ask'
        // Limit ask: aim for above current bid, maybe mid-price or slightly worse than ask
        price = roundToDecimalPlaces(
          getRandomArbitrary(midPrice, ticker.ask * 1.0005),
          5
        ); // Adjust range and decimals
        price = Math.max(price, ticker.bid * 1.0001); // Ensure it's above bid
        price = Math.min(price, ticker.ask * 1.01); // Ensure it's not drastically higher than ask
      }
      // Final check to prevent obvious crossing if somehow calculated wrong
      if (side === "bid" && price >= ticker.ask) price = ticker.ask;
      if (side === "ask" && price <= ticker.bid) price = ticker.bid;
    }
    // Ensure price has valid number of decimals
    if (price !== undefined) {
      price = roundToDecimalPlaces(price, 5); // Adjust decimals as needed
    }

    // Final sanity check for limit orders
    if (type === "limit") {
      if (price === undefined || price <= 0) {
        logger.warn(
          `MT: [${this.pair.symbol}] Invalid limit price calculated (${price}). Falling back to market order.`
        );
        type = "market";
        price = undefined;
      }
      // Prevent placing limit bid above best ask or limit ask below best bid
      else if (side === "bid" && price > ticker.ask) {
        logger.debug(
          `MT: [${this.pair.symbol}] Limit bid price ${price} above ask ${ticker.ask}. Adjusting to ask.`
        );
        price = ticker.ask;
      } else if (side === "ask" && price < ticker.bid) {
        logger.debug(
          `MT: [${this.pair.symbol}] Limit ask price ${price} below bid ${ticker.bid}. Adjusting to bid.`
        );
        price = ticker.bid;
      }
    }

    return {
      pair: this.pair.symbol,
      side: side,
      type: type,
      price: price,
      size: size,
      timestamp: Date.now(),
    };
  }

  private getActionInterval(): number {
    const marketTaker = this.config.marketTaker as Required<MarketTakerConfig>;
    return applyVariance(
      marketTaker.avgActionIntervalMs,
      marketTaker.actionIntervalVariance
    );
  }
}
