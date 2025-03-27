import { defaultConfig } from "./defaultConfig.js";
import { type SimulationConfig, type PairConfig } from "../core/types.js";
import lodash from "lodash";
const { merge } = lodash;

// Basic deep merge function (or use lodash/merge)
function simpleDeepMerge(target: any, source: any): any {
  // You could implement a simple deep merge or use a library like lodash
  // For now, just return the target or source - basic override
  // return { ...target, ...source }; // Shallow merge example
  return merge({}, target, source); // Using lodash for deep merge
}

// Function to combine default and pair-specific configs
function getPairEffectiveConfig(pairSymbol: string): PairConfig {
  const pairDef = defaultConfig.pairs.find((p) => p.symbol === pairSymbol);
  if (!pairDef) {
    throw new Error(`Configuration for pair ${pairSymbol} not found.`);
  }

  const effectiveConfig: PairConfig = {
    // Start with defaults, deep merge pair specifics
    marketMaker: simpleDeepMerge(
      defaultConfig.defaultMarketMakerConfig,
      pairDef.config.marketMaker || {}
    ),
    marketTaker: simpleDeepMerge(
      defaultConfig.defaultMarketTakerConfig,
      pairDef.config.marketTaker || {}
    ),
    volatilityEstimate: pairDef.config.volatilityEstimate, // Use pair's estimate if present
  };

  return effectiveConfig;
}

// Load environment variables if needed (e.g., for API keys, exchange choice)
// import dotenv from 'dotenv';
// dotenv.config();

// Export the combined configuration
export const config: SimulationConfig = {
  ...defaultConfig,
  // Potentially override parts of defaultConfig with env vars here
  // referenceExchange: process.env.REFERENCE_EXCHANGE || defaultConfig.referenceExchange,
};

// Export a function to get the final, merged config for a specific pair
export function getEffectivePairConfig(
  pairSymbol: string
): Required<PairConfig> & { volatilityEstimate?: number } {
  const pairDef = config.pairs.find((p) => p.symbol === pairSymbol);
  if (!pairDef) {
    throw new Error(`Configuration for pair ${pairSymbol} not found.`);
  }

  const effectiveConfig: Required<PairConfig> & {
    volatilityEstimate?: number;
  } = {
    marketMaker: merge(
      {},
      config.defaultMarketMakerConfig,
      pairDef.config.marketMaker || {}
    ),
    marketTaker: merge(
      {},
      config.defaultMarketTakerConfig,
      pairDef.config.marketTaker || {}
    ),
    volatilityEstimate: pairDef.config.volatilityEstimate || 0, // Use pair's estimate if present
  };
  return effectiveConfig;
}
