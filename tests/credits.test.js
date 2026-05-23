import { describe, it, expect } from 'vitest';
import { getCreditCost, GENERATION_CREDITS } from '../src/config/credits.js';

describe('Credit Costs', () => {
  it('should return correct weighted costs for each job type', () => {
    expect(getCreditCost('PARSE_RESUME')).toBe(1);
    expect(getCreditCost('TAILOR_RESUME')).toBe(2);
    expect(getCreditCost('GENERATE_COVER_LETTER')).toBe(2);
    expect(getCreditCost('GENERATE_MOCK_INTERVIEW')).toBe(3);
    expect(getCreditCost('GENERATE_ROADMAP')).toBe(2);
    expect(getCreditCost('GENERATE_PORTFOLIO')).toBe(2);
    expect(getCreditCost('ANALYZE_GITHUB')).toBe(2);
  });

  it('should return 1 for unknown job types', () => {
    expect(getCreditCost('UNKNOWN_TYPE')).toBe(1);
    expect(getCreditCost('')).toBe(1);
  });

  it('should have all expected job types defined', () => {
    const expectedTypes = [
      'PARSE_RESUME', 'TAILOR_RESUME', 'GENERATE_COVER_LETTER',
      'GENERATE_MOCK_INTERVIEW', 'GENERATE_ROADMAP', 'GENERATE_PORTFOLIO',
      'ANALYZE_GITHUB'
    ];
    expectedTypes.forEach(type => {
      expect(GENERATION_CREDITS).toHaveProperty(type);
    });
  });
});
