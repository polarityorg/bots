import { config } from "../config/index.js";

type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLogLevel = LOG_LEVELS[config.logLevel];

function log(level: LogLevel, message: string, meta?: Record<string, any>) {
  if (LOG_LEVELS[level] >= currentLogLevel) {
    const timestamp = new Date().toISOString();
    console.log(
      JSON.stringify({
        timestamp,
        level: level.toUpperCase(),
        message,
        ...meta,
      })
    );
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, any>) =>
    log("debug", message, meta),
  info: (message: string, meta?: Record<string, any>) =>
    log("info", message, meta),
  warn: (message: string, meta?: Record<string, any>) =>
    log("warn", message, meta),
  error: (message: string, meta?: Record<string, any>) =>
    log("error", message, meta),
};
