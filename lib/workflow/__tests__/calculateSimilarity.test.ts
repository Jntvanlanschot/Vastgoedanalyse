import {
  calculateSimpleSimilarityScore,
  calculateFeatureScores,
  combineFeatureScores,
  sanitizeWeights,
  DEFAULT_WEIGHTS,
  ReferenceData,
  CandidateProperty,
} from '../calculateSimilarity';

const reference: ReferenceData = {
  address_full: 'Bloemstraat 10, 1016 KZ Amsterdam',
  street_name: 'Bloemstraat',
  area_m2: 80,
  rooms: 3,
  energy_label: 'B',
  has_garden: true,
  has_balcony: true,
};

function makeCandidate(overrides: Partial<CandidateProperty> = {}): CandidateProperty {
  return {
    address_full: 'Bloemstraat 12, 1016 KZ Amsterdam',
    street: 'Bloemstraat',
    rw_area_m2: 80,
    rw_rooms: 3,
    rw_energy_label: 'B',
    rw_has_garden: true,
    rw_has_balcony: true,
    ...overrides,
  } as CandidateProperty;
}

describe('calculateSimpleSimilarityScore', () => {
  it('is a normalized weighted average over all features incl. energy label', () => {
    // street=1, osm=0.5 (no cache), area=1, distance=0.5 (no coords), garden=1,
    // rooms=1, balcony=1, sale_date=0.5 (missing), year_built=0.5 (missing), energy=1 (B==B)
    // weighted base numerator = 0.81; energy term = 0.5*1 = 0.5 -> 1.31
    // total weight = 1.01 (base) + 0.5 (energy) = 1.51
    const score = calculateSimpleSimilarityScore(makeCandidate(), reference);
    expect(score).toBeCloseTo(1.31 / 1.51, 10);
  });

  it('applies the gracht penalty on a gracht mismatch', () => {
    const candidate = makeCandidate({
      address_full: 'Keizersgracht 100, Amsterdam',
      street: 'Keizersgracht',
    });
    const features = calculateFeatureScores(candidate, reference);
    expect(features.gracht_mismatch).toBe(true);

    const withoutPenalty = combineFeatureScores(
      { ...features, gracht_mismatch: false },
      DEFAULT_WEIGHTS
    );
    const withPenalty = combineFeatureScores(features, DEFAULT_WEIGHTS);
    expect(withPenalty).toBeCloseTo(withoutPenalty * DEFAULT_WEIGHTS.gracht_penalty, 10);
  });

  it('feature extraction + combine equals the one-shot score', () => {
    const candidate = makeCandidate({
      street: 'Rozengracht',
      rw_area_m2: 95,
      rw_rooms: 4,
      rw_energy_label: 'D',
      rw_has_garden: false,
      rw_sale_date: '2025-06-01',
    });
    const features = calculateFeatureScores(candidate, reference);
    expect(combineFeatureScores(features)).toBeCloseTo(
      calculateSimpleSimilarityScore(candidate, reference),
      10
    );
  });

  it('custom weights change the score', () => {
    const candidate = makeCandidate({ rw_energy_label: 'G' });
    const defaultScore = calculateSimpleSimilarityScore(candidate, reference);
    const energyHeavy = calculateSimpleSimilarityScore(candidate, reference, undefined, {
      ...DEFAULT_WEIGHTS,
      weight_energy_label: 0.9,
    });
    // Candidate has a bad energy label, so weighting energy more should lower the score
    expect(energyHeavy).toBeLessThan(defaultScore);
  });
});

describe('sanitizeWeights', () => {
  it('keeps only known keys and clamps to 0..1', () => {
    expect(
      sanitizeWeights({
        weight_area: 2.5,
        weight_rooms: -1,
        weight_distance: 0.4,
        bogus_key: 0.7,
        weight_garden: 'not a number',
      })
    ).toEqual({ weight_area: 1, weight_rooms: 0, weight_distance: 0.4 });
  });

  it('returns undefined for empty or invalid input', () => {
    expect(sanitizeWeights(null)).toBeUndefined();
    expect(sanitizeWeights('x')).toBeUndefined();
    expect(sanitizeWeights({})).toBeUndefined();
    expect(sanitizeWeights({ bogus: 1 })).toBeUndefined();
  });
});
