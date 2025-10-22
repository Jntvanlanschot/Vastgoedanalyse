import { slugifyStreetName, cityToSlug } from '../slug';

describe('slugifyStreetName', () => {
  test('should convert basic street names', () => {
    expect(slugifyStreetName('Eerste Laurierdwarsstraat')).toBe('eerste-laurierdwarsstraat');
    expect(slugifyStreetName('Damrak')).toBe('damrak');
  });

  test('should handle diacritics', () => {
    expect(slugifyStreetName('César Franckstraat')).toBe('cesar-franckstraat');
    expect(slugifyStreetName('Müllerstraat')).toBe('mullerstraat');
  });

  test('should handle spaces and special characters', () => {
    expect(slugifyStreetName('Van der Helststraat')).toBe('van-der-helststraat');
    expect(slugifyStreetName('Oude Leliestraat 123')).toBe('oude-leliestraat-123');
  });

  test('should collapse multiple dashes', () => {
    expect(slugifyStreetName('Street   Name')).toBe('street-name');
    expect(slugifyStreetName('Street---Name')).toBe('street-name');
  });

  test('should remove leading/trailing dashes', () => {
    expect(slugifyStreetName('  Street Name  ')).toBe('street-name');
    expect(slugifyStreetName('-Street Name-')).toBe('street-name');
  });
});

describe('cityToSlug', () => {
  test('should convert city names', () => {
    expect(cityToSlug('Amsterdam')).toBe('amsterdam');
    expect(cityToSlug('Den Haag')).toBe('den-haag');
  });

  test('should handle empty or undefined input', () => {
    expect(cityToSlug('')).toBe('amsterdam');
    expect(cityToSlug(undefined)).toBe('amsterdam');
    expect(cityToSlug('   ')).toBe('amsterdam');
  });

  test('should handle diacritics in city names', () => {
    expect(cityToSlug('Groningen')).toBe('groningen');
    expect(cityToSlug('Maastricht')).toBe('maastricht');
  });
});


