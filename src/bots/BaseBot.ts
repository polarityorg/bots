import { type TradingPair, type PairConfig } from "../core/types.js";
import { FlashnetClient } from "@flashnet/js-sdk";
import { logger } from "../core/logger.js";

export abstract class BaseBot {
  protected pair: TradingPair;
  protected config: Required<PairConfig>;
  protected isRunning: boolean = false;
  protected timeoutId: NodeJS.Timeout | null = null;
  protected client: FlashnetClient;
  protected mnemonic: string;

  constructor(
    pair: TradingPair,
    config: Required<PairConfig>,
    mnemonic: string,
    network: "REGTEST" | "MAINNET" = "REGTEST",
    httpUrl: string = "http://localhost:8083",
    wsUrl: string = "ws://localhost:8081"
  ) {
    this.pair = pair;
    this.config = config;
    this.client = new FlashnetClient(network, httpUrl, wsUrl);
    this.mnemonic = mnemonic;
  }

  public async initializeClient(): Promise<void> {
    try {
      await this.client.initialize(this.mnemonic);
      if (!this.client.isAuthenticated()) {
        throw new Error("Client failed to authenticate properly");
      }
      logger.info(
        `Flashnet client initialized successfully for ${this.pair.symbol}`
      );
    } catch (error: any) {
      logger.error("Error initializing Flashnet client", {
        error: error.message,
        pair: this.pair.symbol,
      });
      throw error;
    }
  }

  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
  protected abstract run(): Promise<void>; // Core logic loop

  protected scheduleNextRun(delay: number): void {
    if (!this.isRunning) return;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(async () => {
      if (this.isRunning) {
        await this.run();
      }
    }, delay);
  }
}
