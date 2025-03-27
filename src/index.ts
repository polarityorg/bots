import { BotManager } from "./trading/BotManager.js";
import { logger } from "./core/logger.js";

// Default mnemonics for testing - in production these should come from environment variables
const DEFAULT_MAKER_MNEMONIC =
  "tip sadness symptom goddess noodle ahead top humor orchard elite evidence coast";
const DEFAULT_TAKER_MNEMONIC =
  "type label catch devote forward useful anger picnic gaze machine small wire";

async function main() {
  logger.info("--- Flashnet Market Making Starting ---");

  // Get mnemonics from environment variables or use defaults
  const makerMnemonic = process.env.MAKER_MNEMONIC || DEFAULT_MAKER_MNEMONIC;
  const takerMnemonic = process.env.TAKER_MNEMONIC || DEFAULT_TAKER_MNEMONIC;
  const network = (process.env.FLASHNET_NETWORK || "REGTEST") as
    | "REGTEST"
    | "MAINNET";
  const httpUrl = process.env.FLASHNET_HTTP_URL || "http://localhost:8083";
  const wsUrl = process.env.FLASHNET_WS_URL || "ws://localhost:8081";

  const botManager = new BotManager(
    makerMnemonic,
    takerMnemonic,
    network,
    httpUrl,
    wsUrl
  );

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    logger.warn("SIGINT received. Shutting down gracefully...");
    await botManager.shutdown();
  });
  process.on("SIGTERM", async () => {
    logger.warn("SIGTERM received. Shutting down gracefully...");
    await botManager.shutdown();
  });

  try {
    await botManager.start();
    logger.info("Trading bots are running. Press Ctrl+C to stop.");
    // Keep the process running indefinitely until signal
    await new Promise(() => {});
  } catch (error: any) {
    logger.error("Trading failed to start or encountered a fatal error.", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

main().catch((error) => {
  logger.error("Unhandled error during startup.", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
