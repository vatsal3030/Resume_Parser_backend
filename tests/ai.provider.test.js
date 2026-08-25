import { describe, it, expect } from 'vitest';
import { extractJson } from '../src/providers/ai.provider.js';

describe('AI Provider - extractJson & Auto-Healing Parser', () => {
  it('should parse clean JSON strings', () => {
    const raw = '{"name": "John Doe", "score": 95}';
    expect(extractJson(raw)).toEqual({ name: "John Doe", score: 95 });
  });

  it('should parse markdown-wrapped JSON code blocks', () => {
    const raw = '```json\n{"detectedDomain": "Tech", "rounds": []}\n```';
    expect(extractJson(raw)).toEqual({ detectedDomain: "Tech", rounds: [] });
  });

  it('should heal and parse truncated JSON with unclosed arrays and braces', () => {
    const truncated = '{\n  "detectedDomain": "Computer Science",\n  "interviewLevel": "Entry",\n  "rounds": [\n    {\n      "title": "Round 1: Aptitude",\n      "questions": [\n        {"id": "q1", "question": "Explain Big-O"}\n      ]\n    },\n    {\n      "title": "Round 2: Technical",\n      "questions": [\n        {"id": "q2", "question": "What is REST?"';
    const parsed = extractJson(truncated);
    expect(parsed.detectedDomain).toBe('Computer Science');
    expect(parsed.rounds.length).toBeGreaterThanOrEqual(1);
  });

  it('should heal trailing commas before closing braces', () => {
    const raw = '{"title": "DevOps", "skills": ["Docker", "Kubernetes",],}';
    const parsed = extractJson(raw);
    expect(parsed.title).toBe('DevOps');
  });
});
