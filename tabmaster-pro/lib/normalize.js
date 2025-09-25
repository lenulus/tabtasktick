// URL Normalization and Deduplication
// Handles URL normalization for duplicate detection

// List of tracking parameters to remove
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', 'referrer',
  '_ga', '_gac', '_gid', '_gl', '_ke',
  'mc_cid', 'mc_eid', 'mkt_tok',
  'trk', 'trkCampaign', 'trkEmail',
  's', 't' // Twitter sharing params
]);

// Special parameters that should be preserved for certain domains
const PRESERVED_PARAMS = {
  'youtube.com': ['v', 'list', 't'],
  'youtu.be': ['t'],
  'github.com': ['q', 'type', 'language'],
  'google.com': ['q', 'tbm', 'tbs'],
  'amazon.com': ['k', 'i'],
  'stackoverflow.com': ['q', 'tab', 'noredirect', 'lq']
};

/**
 * Normalize a URL for deduplication
 * @param {string} url - The URL to normalize
 * @returns {string} The normalized URL
 */
export function normalizeUrl(url) {
  // Handle null/undefined
  if (!url) return url;
  
  // Return non-URLs as-is
  if (typeof url !== 'string') return url;
  
  try {
    // Handle special protocols that URL constructor doesn't support well
    if (url.startsWith('chrome://') || 
        url.startsWith('chrome-extension://') ||
        url.startsWith('data:') ||
        url.startsWith('javascript:') ||
        url.startsWith('about:')) {
      // For chrome:// and similar, just remove the hash
      const hashIndex = url.indexOf('#');
      return hashIndex !== -1 ? url.substring(0, hashIndex) : url;
    }
    
    const parsed = new URL(url);
    
    // Remove hash/fragment
    parsed.hash = '';
    
    // Process query parameters
    const params = new URLSearchParams(parsed.search);
    const domain = parsed.hostname;
    
    // Get preserved params for this domain
    const preservedForDomain = Object.entries(PRESERVED_PARAMS)
      .find(([d]) => domain.includes(d))?.[1] || [];
    
    // Filter out tracking parameters
    const filteredParams = new URLSearchParams();
    for (const [key, value] of params) {
      if (!TRACKING_PARAMS.has(key) || preservedForDomain.includes(key)) {
        filteredParams.append(key, value);
      }
    }
    
    // Sort parameters for consistent ordering
    const sortedParams = new URLSearchParams(
      [...filteredParams.entries()].sort(([a], [b]) => a.localeCompare(b))
    );
    
    // Only set search if there are params, otherwise clear it
    parsed.search = sortedParams.toString();
    
    return parsed.toString();
  } catch (e) {
    // If URL parsing fails, return original
    return url;
  }
}

/**
 * Extract domain from a URL
 * @param {string} url - The URL to extract domain from
 * @returns {string} The domain or 'unknown' if extraction fails
 */
export function extractDomain(url) {
  if (!url) return 'unknown';
  
  try {
    // Handle special protocols
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
    
    // Try to parse as URL
    let urlToParse = url;
    
    // Add protocol if missing
    if (!url.includes('://')) {
      urlToParse = 'https://' + url;
    }
    
    const parsed = new URL(urlToParse);
    return parsed.hostname || parsed.host || 'unknown';
  } catch (e) {
    // Handle malformed URLs
    if (url.includes('.') && !url.includes(' ')) {
      // Might be a domain without protocol
      const match = url.match(/^([^\/]+)/);
      if (match) return match[1];
    }
    return 'unknown';
  }
}

/**
 * Generate a deduplication key for a URL
 * @param {string} url - The URL to generate a key for
 * @returns {string} A key that can be used to identify duplicates
 */
export function generateDupeKey(url) {
  if (!url) return '';
  
  const normalized = normalizeUrl(url);
  
  // For very long URLs, we might want to hash them
  // For now, just return the normalized URL as the key
  return normalized;
}

/**
 * Check if two URLs or tabs are duplicates
 * @param {string|object} url1 - First URL or tab object
 * @param {string|object} url2 - Second URL or tab object
 * @returns {boolean} True if the URLs are duplicates
 */
export function areDuplicates(url1, url2) {
  // Handle null/undefined
  if (!url1 && !url2) return true;
  if (!url1 || !url2) return false;
  
  // Extract URLs from tab objects if necessary
  const u1 = typeof url1 === 'object' ? url1.url : url1;
  const u2 = typeof url2 === 'object' ? url2.url : url2;
  
  // Generate and compare dupe keys
  return generateDupeKey(u1) === generateDupeKey(u2);
}

/**
 * Find all duplicate URLs in a list of tabs
 * @param {Array} tabs - Array of tab objects
 * @returns {Map} Map of dupe keys to arrays of duplicate tabs
 */
export function findDuplicates(tabs) {
  const dupeGroups = new Map();
  
  for (const tab of tabs) {
    if (!tab.url) continue;
    
    const dupeKey = generateDupeKey(tab.url);
    if (!dupeGroups.has(dupeKey)) {
      dupeGroups.set(dupeKey, []);
    }
    dupeGroups.get(dupeKey).push(tab);
  }
  
  // Filter out non-duplicates (single tab groups)
  for (const [key, tabs] of dupeGroups.entries()) {
    if (tabs.length <= 1) {
      dupeGroups.delete(key);
    }
  }
  
  return dupeGroups;
}

/**
 * Extract origin information from a referrer or opener
 * @param {string} referrer - The referrer URL or identifier
 * @returns {string} The origin identifier (e.g., 'gmail', 'search', 'direct')
 */
export function extractOrigin(referrer) {
  if (!referrer) return 'direct';
  
  // Check for known origins
  if (referrer.includes('mail.google.com')) return 'gmail';
  if (referrer.includes('google.com/search')) return 'search';
  if (referrer.includes('bing.com/search')) return 'search';
  if (referrer.includes('duckduckgo.com')) return 'search';
  if (referrer.includes('reddit.com')) return 'reddit';
  if (referrer.includes('twitter.com') || referrer.includes('x.com')) return 'twitter';
  if (referrer.includes('facebook.com')) return 'facebook';
  if (referrer.includes('linkedin.com')) return 'linkedin';
  if (referrer.includes('slack.com')) return 'slack';
  
  // Handle special protocols
  if (referrer.startsWith('chrome://') || 
      referrer.startsWith('chrome-extension://') ||
      referrer.startsWith('file://') ||
      referrer.startsWith('data:')) {
    return 'direct';
  }
  
  // Extract domain as origin for others
  const domain = extractDomain(referrer);
  return domain !== 'unknown' ? domain : 'direct';
}