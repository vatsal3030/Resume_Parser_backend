/**
 * Weighted credit costs per AI generation type.
 * Used by quota middleware and the generation ledger.
 */
export const GENERATION_CREDITS = {
  PARSE_RESUME:            1,
  TAILOR_RESUME:           2,
  GENERATE_COVER_LETTER:   2,
  GENERATE_MOCK_INTERVIEW: 3,
  GRADE_MOCK_INTERVIEW:    2,
  GENERATE_ROADMAP:        2,
  GENERATE_PORTFOLIO:      2,
  ANALYZE_GITHUB:          2,
};

/**
 * Get the weighted credit cost for a job type.
 * @param {string} jobType
 * @returns {number}
 */
export const getCreditCost = (jobType) => {
  return GENERATION_CREDITS[jobType] || 1;
};
