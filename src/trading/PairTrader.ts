import { type TradingPair } from "../core/types.js";
import { MarketMakerBot } from "../bots/MarketMakerBot.js";
import { MarketTakerBot } from "../bots/MarketTakerBot.js";
import { logger } from "../core/logger.js";
import { getEffectivePairConfig } from "../config/index.js";

export class PairTrader {
  private pair: TradingPair;
  private mmBot: MarketMakerBot;
  private mtBot: MarketTakerBot;
  private isRunning: boolean = false;

  constructor(
    pair: TradingPair,
    makerMnemonic: string,
    takerMnemonic: string,
    network: "REGTEST" | "MAINNET" = "REGTEST",
    httpUrl: string = "http://localhost:8083",
    wsUrl: string = "ws://localhost:8081"
  ) {
    this.pair = pair;
    const effectiveConfig = getEffectivePairConfig(pair.symbol);

    // Create maker bot with maker mnemonic
    this.mmBot = new MarketMakerBot(
      pair,
      effectiveConfig,
      makerMnemonic,
      network,
      httpUrl,
      wsUrl
    );

    // Create taker bot with taker mnemonic
    this.mtBot = new MarketTakerBot(
      pair,
      effectiveConfig,
      takerMnemonic,
      network,
      httpUrl,
      wsUrl
    );

    logger.info(`PairTrader created for ${pair.symbol}`);
  }

  async start(): Promise<void> {
    await this.mmBot.initializeClient();
    await this.mtBot.initializeClient();
    logger.info(`PairTrader initialized for ${this.pair.symbol}`);

    if (this.isRunning) return;
    this.isRunning = true;
    logger.info(`PairTrader starting for ${this.pair.symbol}`);

    // Start maker bot first, then taker bot after a short delay
    await this.mmBot.start();
    // Wait for maker bot to potentially place some orders
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await this.mtBot.start();
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;
    logger.info(`PairTrader stopping for ${this.pair.symbol}`);

    // Stop taker bot first, then maker bot
    await this.mtBot.stop();
    await this.mmBot.stop();
    logger.info(`PairTrader stopped for ${this.pair.symbol}`);
  }

  getSymbol(): string {
    return this.pair.symbol;
  }
}
