// Simple in-memory cache decorator for read-heavy endpoints
// For production, replace with Redis

const cache = new Map<string, { data: any; expires: number }>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.expires < now) {
      cache.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function Cacheable(keyPrefix: string, ttlSeconds: number = 60) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      // Create cache key from method name + args
      const cacheKey = `${keyPrefix}:${JSON.stringify(args)}`;
      const cached = cache.get(cacheKey);

      if (cached && cached.expires > Date.now()) {
        return cached.data;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);

      // Store in cache
      cache.set(cacheKey, {
        data: result,
        expires: Date.now() + ttlSeconds * 1000,
      });

      return result;
    };

    return descriptor;
  };
}

export function ClearCache(keyPrefix: string) {
  return function (
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);

      // Clear all cache entries with this prefix
      for (const key of cache.keys()) {
        if (key.startsWith(keyPrefix)) {
          cache.delete(key);
        }
      }

      return result;
    };

    return descriptor;
  };
}
