/**
 * Domain Utilities - Unified domain extraction logic
 *
 * This module provides a single canonical implementation of domain extraction
 * that supports different use cases through options:
 *
 * - Categorization: Preserve special URLs for proper categorization
 * - Grouping: Filter out ungroupable special URLs (chrome://, etc.)
 * - Display: Format domains for user-facing UI
 */

/**
 * Extract domain from URL with configurable handling of special URLs
 *
 * @param {string} url - The URL to extract domain from
 * @param {Object} options - Configuration options
 * @param {string} options.handleSpecialUrls - How to handle special URLs:
 *   - 'preserve' (default): Return structured special URL (e.g., 'chrome://extensions')
 *   - 'filter': Return null for special URLs (for grouping - can't group system pages)
 *   - 'unknown': Return 'unknown' for special URLs
 * @returns {string|null} The extracted domain, or null if filtered, or 'unknown' for invalid URLs
 *
 * @example
 * // Categorization use case (preserve special URLs)
 * extractDomain('chrome://extensions') // → 'chrome://extensions'
 * extractDomain('https://news.ycombinator.com') // → 'news.ycombinator.com'
 *
 * @example
 * // Grouping use case (filter special URLs)
 * extractDomain('chrome://extensions', { handleSpecialUrls: 'filter' }) // → null
 * extractDomain('https://news.ycombinator.com', { handleSpecialUrls: 'filter' }) // → 'news.ycombinator.com'
 */
export function extractDomain(url, options = {}) {
  const {
    handleSpecialUrls = 'preserve'
  } = options;

  // Handle null/undefined/empty
  if (!url) {
    return handleSpecialUrls === 'filter' ? null : 'unknown';
  }

  // Check for special protocols
  const isSpecial = url.startsWith('chrome://') ||
                    url.startsWith('edge://') ||
                    url.startsWith('about:') ||
                    url.startsWith('chrome-extension://') ||
                    url.startsWith('file://') ||
                    url.startsWith('data:');

  if (isSpecial) {
    if (handleSpecialUrls === 'filter') {
      return null;
    }
    if (handleSpecialUrls === 'unknown') {
      return 'unknown';
    }

    // 'preserve' mode - return structured special URL
    if (url.startsWith('chrome://')) {
      return url.split('/')[2] ? `chrome://${url.split('/')[2]}` : 'chrome://';
    }
    if (url.startsWith('chrome-extension://')) {
      return url.split('/')[2] || 'chrome-extension://';
    }
    if (url.startsWith('file://')) {
      return 'file://';
    }
    if (url.startsWith('data:')) {
      return 'data:';
    }
    if (url.startsWith('edge://') || url.startsWith('about:')) {
      return url.split('://')[0] + '://';
    }
  }

  // Normal URL parsing
  try {
    // Try to parse as URL
    let urlToParse = url;

    // Add protocol if missing
    if (!url.includes('://')) {
      urlToParse = 'https://' + url;
    }

    const u = new URL(urlToParse);
    const hostname = u.hostname || u.host;

    if (!hostname) {
      return handleSpecialUrls === 'filter' ? null : 'unknown';
    }

    // Remove www prefix and lowercase
    return hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    // Handle malformed URLs
    if (url.includes('.') && !url.includes(' ')) {
      // Might be a domain without protocol
      const match = url.match(/^([^\/]+)/);
      if (match) {
        return match[1].toLowerCase().replace(/^www\./, '');
      }
    }
    return handleSpecialUrls === 'filter' ? null : 'unknown';
  }
}

/**
 * Extract domain using the 'preserve' mode (for categorization)
 * This is the default behavior - special URLs are preserved for categorization
 *
 * @param {string} url - The URL to extract domain from
 * @returns {string} The extracted domain or 'unknown'
 */
export function extractDomainForCategorization(url) {
  return extractDomain(url, { handleSpecialUrls: 'preserve' });
}

/**
 * Extract domain using the 'filter' mode (for grouping)
 * Returns null for special URLs that cannot be grouped
 *
 * @param {string} url - The URL to extract domain from
 * @returns {string|null} The extracted domain or null if ungroupable
 */
export function extractDomainForGrouping(url) {
  return extractDomain(url, { handleSpecialUrls: 'filter' });
}
