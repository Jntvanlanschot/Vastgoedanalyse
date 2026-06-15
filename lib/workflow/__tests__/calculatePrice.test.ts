import { calculateAdvicePrice } from '../calculatePrice';

describe('calculateAdvicePrice', () => {
  it('returns null without a reference area or comparables', () => {
    expect(calculateAdvicePrice([{ score: 0.9, salePrice: 500000, areaM2: 100 }], 0)).toBeNull();
    expect(calculateAdvicePrice([], 100)).toBeNull();
    // all below MIN_SCORE
    expect(
      calculateAdvicePrice([{ score: 0.4, salePrice: 500000, areaM2: 100 }], 100)
    ).toBeNull();
  });

  it('computes the score²-weighted neutral price per m² and percentiles', () => {
    // Three comparables, all above MIN_SCORE (0.55)
    const candidates = [
      { score: 1.0, salePrice: 600000, areaM2: 100 }, // 6000 /m²
      { score: 0.8, salePrice: 500000, areaM2: 100 }, // 5000 /m²
      { score: 0.6, salePrice: 400000, areaM2: 100 }, // 4000 /m²
    ];
    const result = calculateAdvicePrice(candidates, 120)!;

    // weighted avg of price/m²: (6000*1 + 5000*0.64 + 4000*0.36) / (1+0.64+0.36)
    const expectedAvg = (6000 * 1 + 5000 * 0.64 + 4000 * 0.36) / (1 + 0.64 + 0.36);
    expect(result.avgPricePerM2).toBeCloseTo(expectedAvg, 6);
    expect(result.neutralPrice).toBeCloseTo(expectedAvg * 120, 4);

    // percentiles of sorted [4000,5000,6000]: idx floor(3*0.25)=0 -> 4000; floor(3*0.75)=2 -> 6000
    expect(result.conservativePerM2).toBe(4000);
    expect(result.optimisticPerM2).toBe(6000);
    expect(result.comparablesUsed).toBe(3);
  });

  it('uses ±12% fallback with fewer than 3 comparables', () => {
    const result = calculateAdvicePrice(
      [
        { score: 1.0, salePrice: 500000, areaM2: 100 },
        { score: 1.0, salePrice: 500000, areaM2: 100 },
      ],
      100
    )!;
    expect(result.avgPricePerM2).toBeCloseTo(5000, 6);
    expect(result.conservativePerM2).toBeCloseTo(5000 * 0.88, 6);
    expect(result.optimisticPerM2).toBeCloseTo(5000 * 1.12, 6);
  });
});
