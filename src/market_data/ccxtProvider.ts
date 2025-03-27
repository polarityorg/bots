import * as ccxt from "ccxt";
import { config } from "../config/index.js";
import { type TickerData } from "../core/types.js";
import { logger } from "../core/logger.js";

interface IMarketDataProvider {
  initialize(): Promise<void>;
  fetchTicker(ccxtSymbol: string): Promise<TickerData | null>;
  // Add fetchOrderBook, fetchTrades etc. later if needed
}

class CCXTMarketDataProvider implements IMarketDataProvider {
  private exchange: ccxt.Exchange | null = null;

  async initialize(): Promise<void> {
    const exchangeId = config.referenceExchange;
    logger.info(`Initializing CCXT with exchange: ${String(exchangeId)}`);

    if (!Object.keys(ccxt).includes(exchangeId)) {
      throw new Error(`Exchange ${String(exchangeId)} not supported by CCXT`);
    }

    try {
      // Type assertion to ensure exchangeId is a valid key
      const ExchangeClass = (ccxt as any)[exchangeId] as typeof ccxt.Exchange;
      if (!ExchangeClass) {
        throw new Error(`Exchange class not found for ${String(exchangeId)}`);
      }

      this.exchange = new ExchangeClass({
        // Add API key/secret from env vars if needed for private data or higher rate limits
        // apiKey: process.env.CCXT_API_KEY,
        // secret: process.env.CCXT_SECRET,
        enableRateLimit: true, // Important!
      });

      // Optional: Load markets to ensure the symbols are available
      if (!this.exchange) {
        throw new Error("Failed to initialize exchange instance");
      }
      await this.exchange.loadMarkets();

      logger.info(
        `CCXTMarketDataProvider initialized for exchange: ${String(exchangeId)}`
      );
    } catch (error: any) {
      logger.error("Failed to initialize CCXT", {
        error: error.message,
        stack: error.stack,
      });
      throw error; // Re-throw to halt simulation if data source fails
    }
  }

  async fetchTicker(ccxtSymbol: string): Promise<TickerData | null> {
    if (!this.exchange) {
      logger.warn("CCXT exchange not initialized, cannot fetch ticker.");
      return null;
    }

    try {
      // Check if market symbol exists
      if (!this.exchange.markets || !this.exchange.markets[ccxtSymbol]) {
        logger.warn(
          `Market symbol ${ccxtSymbol} not found on ${this.exchange.id}. Skipping fetch.`
        );
        return null;
      }

      const ticker: ccxt.Ticker = await this.exchange.fetchTicker(ccxtSymbol);
      if (!ticker || ticker.bid === undefined || ticker.ask === undefined) {
        logger.warn(`Incomplete ticker data received for ${ccxtSymbol}`);
        return null;
      }
      return {
        symbol: ccxtSymbol,
        bid: ticker.bid,
        ask: ticker.ask,
        last: ticker.last ?? ticker.bid, // Fallback to bid if last is not available
        timestamp: ticker.timestamp ?? Date.now(),
      };
    } catch (error: any) {
      // Handle CCXT specific errors (rate limits, network issues, invalid symbols)
      logger.error(
        `Failed to fetch ticker for ${ccxtSymbol} from ${this.exchange.id}`,
        { error: error?.message }
      );
      // Implement retry logic or circuit breaker if necessary
      return null;
    }
  }

  // Implement fetchOrderBook later
  // async fetchOrderBook(ccxtSymbol: string): Promise<OrderBook | null> { ... }
}

// Export a singleton instance
export const marketDataProvider = new CCXTMarketDataProvider();
