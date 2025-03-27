import { type SimulationConfig } from "../core/types.js";

export const defaultConfig: SimulationConfig = {
  referenceExchange: "kraken", // Changed from 'binance' to 'kraken'
  logLevel: "info",
  pairs: [
    {
      symbol: "BTC-USDB", // Your internal symbol
      baseAsset: "BTC",
      quoteAsset: "USDB",
      ccxtSymbol: "BTC/USD", // Changed from BTC/USDT to BTC/USD for Kraken
      config: {
        // Pair specific overrides can go here
        volatilityEstimate: 0.02, // Placeholder: 2% volatility
        marketMaker: {
          baseSizePerLevel: 0.05,
        },
        marketTaker: {
          baseOrderSize: 0.01,
        },
      },
    },
    {
      symbol: "BTC-EURB", // Your internal symbol
      baseAsset: "BTC",
      quoteAsset: "EURB",
      ccxtSymbol: "BTC/EUR", // This one stays the same
      config: {
        volatilityEstimate: 0.025, // Slightly higher maybe?
        marketMaker: {
          baseSizePerLevel: 0.04,
        },
        marketTaker: {
          baseOrderSize: 0.008,
        },
      },
    },
  ],
  defaultMarketMakerConfig: {
    baseSpreadPercentage: 0.001, // 0.1%
    spreadVolatilityMultiplier: 1.5,
    depthLevels: 15,
    baseSizePerLevel: 0.1, // e.g., 0.1 BTC
    sizeRandomizationFactor: 0.2,
    updateIntervalMs: 1000, // 1 second
    updateIntervalVariance: 0.3,
    cancelReplaceRatio: 0, // Simple mode: cancel/replace all
  },
  defaultMarketTakerConfig: {
    avgActionIntervalMs: 5000, // Reduced to 5 seconds
    actionIntervalVariance: 0.2, // Reduced variance for more consistent timing
    marketOrderProbability: 0.6, // Increased market order probability
    baseOrderSize: 0.02,
    sizeRandomizationFactor: 0.3, // Reduced for more consistent sizes
    strategyProbabilities: {
      random: 0.5, // Increased random trading
      momentum: 0.3,
      meanReversion: 0.1, // Reduced as it's more selective
      passiveLimit: 0.1, // Reduced as it's more selective
    },
    momentumLookbackTicks: 3, // Reduced for faster momentum detection
    meanReversionThreshold: 0.003, // Reduced threshold for more frequent mean reversion trades
  },
};
