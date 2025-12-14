// src/constants/mockCurveTrades.ts

// This is the shape CurvePriceChart expects
export type MockCurveEvent = {
  timestamp: number;     // Unix timestamp in seconds
  pricePerToken: number; // e.g. BNB per token
};

// 🔹 Static mock curve for the special test token: MOCK2
// You can tweak the numbers to change the curve shape.
const MOCK2_CURVE_EVENTS: MockCurveEvent[] = [
  { timestamp: 1733700000, pricePerToken: 0.00010 },
  { timestamp: 1733700300, pricePerToken: 0.00012 },
  { timestamp: 1733700600, pricePerToken: 0.00015 },
  { timestamp: 1733700900, pricePerToken: 0.00019 },
  { timestamp: 1733701200, pricePerToken: 0.00023 },
  { timestamp: 1733701500, pricePerToken: 0.00028 },
  { timestamp: 1733701800, pricePerToken: 0.00034 },
  { timestamp: 1733702100, pricePerToken: 0.00041 },
  { timestamp: 1733702400, pricePerToken: 0.00049 },
  { timestamp: 1733702700, pricePerToken: 0.00058 },
];

// If you ever add more mock tokens, just extend this map
const EVENTS_BY_SYMBOL: Record<string, MockCurveEvent[]> = {
  MOCK2: MOCK2_CURVE_EVENTS,
};

export function getMockCurveEventsForSymbol(
  symbol?: string | null
): MockCurveEvent[] {
  if (!symbol) return [];
  const key = symbol.toUpperCase();
  return EVENTS_BY_SYMBOL[key] ?? [];
}
