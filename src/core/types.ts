export type OrderSide = "bid" | "ask";
export type OrderType = "limit" | "market";

export interface Order {
  pair: string;
  side: OrderSide;
  type: OrderType;
  price?: number; // Optional for market orders
  size: number;
  timestamp: number;
  // In a real system, you'd have orderId, status, etc.
  // For MM, maybe add a 'level' identifier
  level?: number;
  id?: string; // Add order ID for tracking
  status?: OrderStatus; // Add order status
}

export type OrderStatus = "new" | "open" | "closed" | "canceled";

export interface OrderMatch {
  existingOrder: Order;
  newOrder: Order;
  priceDeviation: number;
  sizeDeviation: number;
}

export interface TradingPair {
  symbol: string; // e.g., 'BTC-USDB'
  baseAsset: string; // e.g., 'BTC'
  quoteAsset: string; // e.g., 'USDB'
  ccxtSymbol: string; // e.g., 'BTC/USDT' or 'BTC/EUR'
  config: PairConfig; // Specific config overrides for this pair
}

export interface TickerData {
  symbol: string;
  timestamp: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
}

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  pair: string;
  bids: OrderBookLevel[]; // Highest bid first
  asks: OrderBookLevel[]; // Lowest ask first
  timestamp: number;
}

// --- Configuration Interfaces ---

export interface MarketMakerConfig {
  baseSpreadPercentage: number;
  spreadVolatilityMultiplier: number; // How much volatility increases spread
  depthLevels: number; // Number of levels on each side
  baseSizePerLevel: number;
  sizeRandomizationFactor: number; // e.g., 0.2 means +/- 20% size variation
  updateIntervalMs: number;
  updateIntervalVariance: number; // e.g., 0.3 means +/- 30% interval variation
  cancelReplaceRatio: number; // 0 = replace all, 1 = cancel/replace individual orders (more complex)
}

export interface MarketTakerConfig {
  avgActionIntervalMs: number;
  actionIntervalVariance: number; // +/- variance percentage
  marketOrderProbability: number; // 0 to 1
  baseOrderSize: number;
  sizeRandomizationFactor: number; // +/- variance percentage
  // Strategy Mix (probabilities should sum roughly to 1)
  strategyProbabilities: {
    random: number;
    momentum: number;
    meanReversion: number;
    passiveLimit: number;
  };
  momentumLookbackTicks: number; // How many recent prices to check for trend
  meanReversionThreshold: number; // Price deviation % to trigger mean reversion
}

export interface PairConfig {
  marketMaker: Partial<MarketMakerConfig>;
  marketTaker: Partial<MarketTakerConfig>;
  volatilityEstimate?: number; // Manual override or placeholder
}

export interface SimulationConfig {
  referenceExchange: string; // e.g., 'binance'
  logLevel: "debug" | "info" | "warn" | "error";
  pairs: TradingPair[];
  // Global defaults that can be overridden by pair config
  defaultMarketMakerConfig: MarketMakerConfig;
  defaultMarketTakerConfig: MarketTakerConfig;
}
