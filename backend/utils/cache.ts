/**
 * Simple in-memory cache utility for frequently accessed data
 * Uses node-cache for TTL-based caching
 */

import NodeCache from 'node-cache';

// Cache configurations
export const CACHE_TTL = {
    ORDERS: 300,      // 5 minutes for orders list
    CONTACTS: 300,    // 5 minutes for contacts
    MESSAGES: 180,    // 3 minutes for messages
    TAGS: 600,        // 10 minutes for tags (rarely change)
};

// Create cache instances
export const ordersCache = new NodeCache({
    stdTTL: CACHE_TTL.ORDERS,
    checkperiod: 60,  // Check for expired keys every 60 seconds
    useClones: false  // Don't clone objects (better performance)
});

export const contactsCache = new NodeCache({
    stdTTL: CACHE_TTL.CONTACTS,
    checkperiod: 60,
    useClones: false
});

export const messagesCache = new NodeCache({
    stdTTL: CACHE_TTL.MESSAGES,
    checkperiod: 60,
    useClones: false
});

export const tagsCache = new NodeCache({
    stdTTL: CACHE_TTL.TAGS,
    checkperiod: 120,
    useClones: false
});

/**
 * Generate cache key from parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, any> | undefined | null): string {
    const sortedParams = Object.keys(params || {})
        .sort()
        .map(key => `${key}:${params?.[key]}`)
        .join('|');
    return `${prefix}:${sortedParams || 'all'}`;
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
    ordersCache.flushAll();
    contactsCache.flushAll();
    messagesCache.flushAll();
    tagsCache.flushAll();
    console.log('[Cache] All caches cleared');
}

/**
 * Clear specific cache by type
 */
export function clearCache(type: 'orders' | 'contacts' | 'messages' | 'tags'): void {
    switch (type) {
        case 'orders':
            ordersCache.flushAll();
            console.log('[Cache] Orders cache cleared');
            break;
        case 'contacts':
            contactsCache.flushAll();
            console.log('[Cache] Contacts cache cleared');
            break;
        case 'messages':
            messagesCache.flushAll();
            console.log('[Cache] Messages cache cleared');
            break;
        case 'tags':
            tagsCache.flushAll();
            console.log('[Cache] Tags cache cleared');
            break;
        default:
            console.warn(`[Cache] Unknown cache type: ${type}`);
    }
}

/**
 * Get cache statistics
 */
export function getCacheStats(): Record<string, NodeCache.Stats> {
    return {
        orders: ordersCache.getStats(),
        contacts: contactsCache.getStats(),
        messages: messagesCache.getStats(),
        tags: tagsCache.getStats(),
    };
}
