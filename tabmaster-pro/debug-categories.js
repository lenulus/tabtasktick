// Debug helper for category matching issues
// Run this in the extension's background page console

async function debugCategoryMatching() {
  console.log('=== CATEGORY MATCHING DEBUG ===');
  
  // Check if categories loaded
  console.log('DOMAIN_CATEGORIES_MAP size:', Object.keys(DOMAIN_CATEGORIES_MAP).length);
  console.log('Sample entries:', {
    'google.com': DOMAIN_CATEGORIES_MAP['google.com'],
    'facebook.com': DOMAIN_CATEGORIES_MAP['facebook.com'],
    'instagram.com': DOMAIN_CATEGORIES_MAP['instagram.com'],
    'twitter.com': DOMAIN_CATEGORIES_MAP['twitter.com']
  });
  
  // Get current tabs
  const tabs = await chrome.tabs.query({});
  console.log(`\nChecking ${tabs.length} tabs:`);
  
  // Check each tab
  for (const tab of tabs) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace(/^www\./, '');
      const categories = getBuiltInCategoriesForDomain(domain);
      
      if (categories.length > 0) {
        console.log(`\nTab: ${tab.title}`);
        console.log(`  URL: ${tab.url}`);
        console.log(`  Domain: ${domain}`);
        console.log(`  Categories: ${categories.join(', ')}`);
        console.log(`  Is Social: ${categories.includes('social')}`);
        console.log(`  Pinned: ${tab.pinned}`);
      }
    } catch (e) {
      // Skip chrome:// URLs etc
    }
  }
  
  // Test specific social rule
  const socialRule = state.rules.find(r => r.name.includes('social media'));
  if (socialRule) {
    console.log('\n=== TESTING SOCIAL MEDIA RULE ===');
    console.log('Rule:', socialRule);
    
    const evaluations = await Promise.all(
      tabs.map(tab => evaluateCondition(socialRule.conditions, tab, tabs))
    );
    const matchingTabs = tabs.filter((tab, index) => evaluations[index]);
    
    console.log(`Matched ${matchingTabs.length} tabs:`);
    matchingTabs.forEach(tab => {
      console.log(`  - ${tab.title} (${tab.url})`);
    });
  }
  
  console.log('\n=== END DEBUG ===');
}

// Run it
debugCategoryMatching();