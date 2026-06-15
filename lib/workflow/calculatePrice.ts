/**
 * Advice-price calculation, extracted from generateHtmlReport so the /tuning
 * page can show the EXACT same price the final report would produce.
 *
 * Logic (unchanged from the report):
 *  - keep comparables with a sale price, an area, and score >= MIN_SCORE
 *  - take the top N (input is assumed sorted by score, descending)
 *  - neutral price/m² = score²-weighted average of price/m²
 *  - conservative/optimistic = 25th/75th percentile of price/m²
 *    (fallback to ±12% of the average when fewer than 3 comparables)
 *  - price = price/m² × reference area
 */

export const PRICE_CALC_TOP_N = 12;
export const PRICE_CALC_MIN_SCORE = 0.55;

export interface PriceInput {
  score: number;
  salePrice: number | null | undefined;
  areaM2: number | null | undefined;
}

export interface PriceResult {
  neutralPrice: number;
  conservativePrice: number;
  optimisticPrice: number;
  avgPricePerM2: number;
  conservativePerM2: number;
  optimisticPerM2: number;
  comparablesUsed: number;
}

export function calculateAdvicePrice(
  candidates: PriceInput[], // assumed sorted by score, descending
  referenceArea: number | undefined | null
): PriceResult | null {
  if (!referenceArea || referenceArea <= 0) return null;

  const validPrices = candidates
    .filter(
      (p) =>
        p.salePrice &&
        p.areaM2 &&
        p.areaM2 > 0 &&
        p.score >= PRICE_CALC_MIN_SCORE
    )
    .slice(0, PRICE_CALC_TOP_N)
    .map((p) => ({
      pricePerM2: (p.salePrice || 0) / (p.areaM2 || 1),
      score: p.score,
    }));

  if (validPrices.length === 0) return null;

  const totalWeight = validPrices.reduce((sum, p) => sum + Math.pow(p.score, 2), 0);
  const avgPricePerM2 =
    validPrices.reduce((sum, p) => sum + p.pricePerM2 * Math.pow(p.score, 2), 0) / totalWeight;

  const prices = validPrices.map((p) => p.pricePerM2).sort((a, b) => a - b);
  const conservativePerM2 =
    prices.length >= 3 ? prices[Math.floor(prices.length * 0.25)] : avgPricePerM2 * 0.88;
  const optimisticPerM2 =
    prices.length >= 3 ? prices[Math.floor(prices.length * 0.75)] : avgPricePerM2 * 1.12;

  return {
    neutralPrice: avgPricePerM2 * referenceArea,
    conservativePrice: conservativePerM2 * referenceArea,
    optimisticPrice: optimisticPerM2 * referenceArea,
    avgPricePerM2,
    conservativePerM2,
    optimisticPerM2,
    comparablesUsed: validPrices.length,
  };
}
