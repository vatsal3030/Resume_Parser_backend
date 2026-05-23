/**
 * Server-side input validation utilities.
 * Validates payloads before they hit controllers or queues.
 */

/**
 * Validates that required fields exist and are non-empty strings.
 * @param {Object} body - The request body
 * @param {string[]} requiredFields - Array of required field names
 * @returns {{ valid: boolean, missing: string[] }}
 */
export const validateRequired = (body, requiredFields) => {
  const missing = requiredFields.filter(field => {
    const val = body[field];
    return val === undefined || val === null || (typeof val === 'string' && val.trim() === '');
  });
  return { valid: missing.length === 0, missing };
};

/**
 * Sanitizes a string input: trims whitespace and limits length.
 * @param {string} input
 * @param {number} maxLength
 * @returns {string}
 */
export const sanitizeString = (input, maxLength = 10000) => {
  if (typeof input !== 'string') return '';
  return input.trim().slice(0, maxLength);
};

/**
 * Express middleware factory for validating required body fields.
 * Returns 400 with a descriptive error if validation fails.
 */
export const requireFields = (...fields) => (req, res, next) => {
  const { valid, missing } = validateRequired(req.body, fields);
  if (!valid) {
    return res.status(400).json({
      error: `Missing required fields: ${missing.join(', ')}`
    });
  }
  next();
};
