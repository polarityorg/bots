import { type Order, type OrderMatch } from "./types.js";

/**
 * Returns a random number between min (inclusive) and max (exclusive).
 */
export function getRandomArbitrary(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

/**
 * Returns a random integer between min (inclusive) and max (inclusive).
 */
export function getRandomIntInclusive(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1) + min);
}

/**
 * Adds or subtracts a random variance percentage to a base value.
 * @param baseValue The base number.
 * @param varianceFactor The maximum variance (e.g., 0.2 for +/- 20%).
 * @returns The adjusted value.
 */
export function applyVariance(
  baseValue: number,
  varianceFactor: number
): number {
  const variance = getRandomArbitrary(-varianceFactor, varianceFactor);
  return baseValue * (1 + variance);
}

/**
 * Pauses execution for a specified number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Rounds a number to a specific number of decimal places.
 */
export function roundToDecimalPlaces(
  num: number,
  decimalPlaces: number
): number {
  const factor = Math.pow(10, decimalPlaces);
  return Math.round(num * factor) / factor;
}

export function compareOrders(existing: Order, new_: Order): OrderMatch {
  const priceDeviation =
    existing.price && new_.price
      ? Math.abs((existing.price - new_.price) / existing.price)
      : 1; // If either price is undefined (market orders), consider them different

  const sizeDeviation = Math.abs((existing.size - new_.size) / existing.size);

  return {
    existingOrder: existing,
    newOrder: new_,
    priceDeviation,
    sizeDeviation,
  };
}

export function shouldReplaceOrder(
  match: OrderMatch,
  maxPriceDeviation: number = 0.001, // 0.1% default
  maxSizeDeviation: number = 0.1 // 10% default
): boolean {
  return (
    match.priceDeviation > maxPriceDeviation ||
    match.sizeDeviation > maxSizeDeviation
  );
}

export function findMatchingOrder(
  existingOrder: Order,
  newOrders: Order[],
  maxPriceDeviation: number = 0.001,
  maxSizeDeviation: number = 0.1
): Order | null {
  // Only match orders of the same side and type
  const sameTypeOrders = newOrders.filter(
    (order) =>
      order.side === existingOrder.side && order.type === existingOrder.type
  );

  // Find the closest matching order by price and size
  let bestMatch: Order | null = null;
  let minDeviation = Number.MAX_VALUE;

  for (const newOrder of sameTypeOrders) {
    const match = compareOrders(existingOrder, newOrder);
    const totalDeviation = match.priceDeviation + match.sizeDeviation;

    if (
      totalDeviation < minDeviation &&
      match.priceDeviation <= maxPriceDeviation &&
      match.sizeDeviation <= maxSizeDeviation
    ) {
      minDeviation = totalDeviation;
      bestMatch = newOrder;
    }
  }

  return bestMatch;
}
