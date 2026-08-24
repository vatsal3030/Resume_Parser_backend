import { describe, it, expect } from 'vitest';
import { safeCacheGet, safeCacheSet, safeCacheDel } from '../src/config/redis.js';

describe('Resilient Safe Cache', () => {
  it('should store and retrieve values from fallback cache when Redis is offline', async () => {
    const testKey = 'test_user_key_123';
    const testValue = JSON.stringify([{ id: '1', title: 'Senior Engineer Resume' }]);

    await safeCacheSet(testKey, testValue, 60);
    const retrieved = await safeCacheGet(testKey);

    expect(retrieved).toBe(testValue);
    expect(JSON.parse(retrieved)).toEqual([{ id: '1', title: 'Senior Engineer Resume' }]);
  });

  it('should delete values correctly from cache', async () => {
    const testKey = 'delete_me_key';
    await safeCacheSet(testKey, 'some_val', 60);
    expect(await safeCacheGet(testKey)).toBe('some_val');

    await safeCacheDel(testKey);
    expect(await safeCacheGet(testKey)).toBeNull();
  });

  it('should expire keys after TTL', async () => {
    const testKey = 'short_lived_key';
    // Set 0 second TTL
    await safeCacheSet(testKey, 'expired_val', -1);
    const retrieved = await safeCacheGet(testKey);

    expect(retrieved).toBeNull();
  });
});
