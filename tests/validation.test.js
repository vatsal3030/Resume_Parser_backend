import { describe, it, expect, vi } from 'vitest';
import { validateRequired, sanitizeString, requireFields } from '../src/utils/validation.js';

describe('Validation Utilities', () => {
  describe('validateRequired', () => {
    it('should return valid when all fields are present', () => {
      const result = validateRequired(
        { name: 'John', email: 'j@test.com' },
        ['name', 'email']
      );
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it('should detect missing fields', () => {
      const result = validateRequired(
        { name: 'John' },
        ['name', 'email', 'role']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['email', 'role']);
    });

    it('should treat empty strings as missing', () => {
      const result = validateRequired(
        { name: '', email: '  ' },
        ['name', 'email']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['name', 'email']);
    });

    it('should treat null and undefined as missing', () => {
      const result = validateRequired(
        { name: null, email: undefined },
        ['name', 'email']
      );
      expect(result.valid).toBe(false);
      expect(result.missing).toEqual(['name', 'email']);
    });
  });

  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should truncate to maxLength', () => {
      expect(sanitizeString('abcdefgh', 5)).toBe('abcde');
    });

    it('should return empty string for non-string input', () => {
      expect(sanitizeString(123)).toBe('');
      expect(sanitizeString(null)).toBe('');
      expect(sanitizeString(undefined)).toBe('');
    });
  });

  describe('requireFields middleware', () => {
    it('should call next() when all fields are present', () => {
      const req = { body: { resumeId: '123', jobDescription: 'test' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireFields('resumeId', 'jobDescription')(req, res, next);

      expect(next).toHaveBeenCalledOnce();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 with missing fields list', () => {
      const req = { body: { resumeId: '123' } };
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
      const next = vi.fn();

      requireFields('resumeId', 'jobDescription')(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing required fields: jobDescription'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
