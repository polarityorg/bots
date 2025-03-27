import { config } from "../config/index.js";
import { marketDataProvider } from "../market_data/ccxtProvider.js";
import { PairTrader } from "./PairTrader.js";
import { logger } from "../core/logger.js";
import { sleep } from "../core/utils.js";

export class BotManager {
  private traders: Map<string, PairTrader> = new Map();
  private isRunning: boolean = false;

  constructor(
    private makerMnemonic: string,
    private takerMnemonic: string,
    private network: "REGTEST" | "MAINNET" = "REGTEST",
    private httpUrl: string = "http://localhost:8083",
    private wsUrl: string = "ws://localhost:8081"
  ) {}

  async initialize(): Promise<boolean> {
    logger.info("Initializing Bot Manager...");
    try {
      await marketDataProvider.initialize();
      // Create traders for each configured pair
      for (const pair of config.pairs) {
        const trader = new PairTrader(
          pair,
          this.makerMnemonic,
          this.takerMnemonic,
          this.network,
          this.httpUrl,
          this.wsUrl
        );
        this.traders.set(pair.symbol, trader);
      }
      logger.info(`Initialized ${this.traders.size} pair traders.`);
      return true;
    } catch (error: any) {
      logger.error("Failed to initialize Bot Manager.", {
        error: error.message,
      });
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn("Bot Manager is already running.");
      return;
    }
    const initialized = await this.initialize();
    if (!initialized) {
      logger.error("Cannot start Bot Manager due to initialization failure.");
      return;
    }

    this.isRunning = true;
    logger.info("Starting all pair traders...");

    const startPromises = Array.from(this.traders.values()).map((trader) =>
      trader.start()
    );
    await Promise.all(startPromises);

    logger.info("Bot Manager started.");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn("Bot Manager is not running.");
      return;
    }
    logger.info("Stopping Bot Manager...");
    this.isRunning = false;

    const stopPromises = Array.from(this.traders.values()).map((trader) =>
      trader.stop()
    );
    await Promise.all(stopPromises);

    this.traders.clear();
    logger.info("Bot Manager stopped.");
  }

  // Graceful shutdown handler
  async shutdown(): Promise<void> {
    logger.info("Received shutdown signal. Stopping trading...");
    await this.stop();
    // Allow logs to flush etc.
    await sleep(1000);
    process.exit(0);
  }
}
