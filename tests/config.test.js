import { describe, it, expect } from 'vitest';
import { config } from '../src/config/config.js';

describe('Config & Feature Flags', () => {
  it('should have correct default feature flag values', () => {
    expect(config.features.ENABLE_REALTIME).toBe(false);
    expect(config.features.ENABLE_COPILOT).toBe(true);
    expect(config.features.ENABLE_GITHUB_ANALYSIS).toBe(true);
    expect(config.features.ENABLE_INTERVIEWS).toBe(true);
    expect(config.features.ENABLE_ADMIN_DASHBOARD).toBe(true);
  });

  it('should have correct default governance limits', () => {
    expect(config.limits.maxUploadSizeMB).toBe(5);
    expect(config.limits.maxGenerationsPerDay).toBe(500);
    expect(config.limits.maxConcurrentJobs).toBe(3);
  });

  it('should default to port 5000', () => {
    expect(config.port).toBe(5000);
  });
});
