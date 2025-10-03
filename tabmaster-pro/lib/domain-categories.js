// Domain categorization for TabMaster Pro
// Categories are based on primary function/content type

export const DOMAIN_CATEGORIES = {
  // Major categories
  social: {
    name: "Social Media",
    description: "Social networking and community platforms",
    color: "#1877F2"
  },
  video: {
    name: "Streaming & Video",
    description: "Video streaming and entertainment platforms",
    color: "#E50914"
  },
  news: {
    name: "News & Media",
    description: "News outlets and media publications",
    color: "#000000"
  },
  shopping: {
    name: "Shopping",
    description: "E-commerce and online shopping",
    color: "#FF9900"
  },
  productivity: {
    name: "Productivity",
    description: "Work and productivity tools",
    color: "#0078D4"
  },
  reference: {
    name: "Reference & Research",
    description: "Educational and reference resources",
    color: "#6B7280"
  },
  dev: {
    name: "Tech & Development",
    description: "Developer tools and tech resources",
    color: "#24292E"
  },
  gaming: {
    name: "Gaming",
    description: "Gaming platforms and related content",
    color: "#9146FF"
  },
  finance: {
    name: "Finance",
    description: "Banking, investing, and financial services",
    color: "#00A86B"
  },
  communication: {
    name: "Communication",
    description: "Messaging and communication platforms",
    color: "#25D366"
  },
  entertainment: {
    name: "Entertainment",
    description: "General entertainment and leisure",
    color: "#FF006E"
  },
  education: {
    name: "Education",
    description: "Online learning and educational platforms",
    color: "#4285F4"
  },
  travel: {
    name: "Travel",
    description: "Travel booking and information",
    color: "#FF5A5F"
  },
  food_delivery: {
    name: "Food & Delivery",
    description: "Food ordering and delivery services",
    color: "#D73502"
  },
  health_fitness: {
    name: "Health & Fitness",
    description: "Health, medical, and fitness resources",
    color: "#86C867"
  },
  government: {
    name: "Government",
    description: "Government and public services",
    color: "#003087"
  },
  adult: {
    name: "Adult Content",
    description: "Adult-oriented content",
    color: "#8B0000"
  },
  crypto: {
    name: "Cryptocurrency",
    description: "Cryptocurrency and blockchain",
    color: "#F7931A"
  },
  sports: {
    name: "Sports",
    description: "Sports news and content",
    color: "#006BB3"
  },
  music: {
    name: "Music",
    description: "Music streaming and discovery",
    color: "#1DB954"
  },
  search: {
    name: "Search & Discovery",
    description: "Search engines and discovery platforms",
    color: "#4285F4"
  },
  test: {
    name: "Test",
    description: "Test and example domains",
    color: "#9CA3AF"
  }
};

// Categorized domain list (top domains by global traffic)
export const CATEGORIZED_DOMAINS = [
  // Search Engines
  { domain: "google.com", rank: 1, categories: ["search", "productivity"] },
  { domain: "bing.com", rank: 9, categories: ["search"] },
  { domain: "yahoo.com", rank: 12, categories: ["search", "news"] },
  { domain: "yandex.ru", rank: 14, categories: ["search"] },
  { domain: "baidu.com", rank: 16, categories: ["search"] },
  { domain: "duckduckgo.com", rank: 150, categories: ["search"] },
  { domain: "ask.com", rank: 800, categories: ["search"] },
  { domain: "aol.com", rank: 400, categories: ["search", "news"] },
  
  // Social Media
  { domain: "facebook.com", rank: 3, categories: ["social"] },
  { domain: "instagram.com", rank: 4, categories: ["social"] },
  { domain: "twitter.com", rank: 6, categories: ["social"] },
  { domain: "x.com", rank: 6, categories: ["social"] },
  { domain: "reddit.com", rank: 7, categories: ["social", "reference"] },
  { domain: "whatsapp.com", rank: 8, categories: ["communication", "social"] },
  { domain: "tiktok.com", rank: 13, categories: ["social", "video"] },
  { domain: "linkedin.com", rank: 18, categories: ["social"] },
  { domain: "pinterest.com", rank: 25, categories: ["social", "entertainment"] },
  { domain: "vk.com", rank: 33, categories: ["social"] },
  { domain: "telegram.org", rank: 50, categories: ["communication", "social"] },
  { domain: "snapchat.com", rank: 60, categories: ["social", "communication"] },
  { domain: "discord.com", rank: 45, categories: ["communication", "gaming"] },
  { domain: "tumblr.com", rank: 120, categories: ["social", "entertainment"] },
  { domain: "quora.com", rank: 80, categories: ["social", "reference"] },
  { domain: "wechat.com", rank: 55, categories: ["communication", "social"] },
  { domain: "weibo.com", rank: 70, categories: ["social"] },
  
  // Streaming & Entertainment
  { domain: "youtube.com", rank: 2, categories: ["video", "social"] },
  { domain: "netflix.com", rank: 22, categories: ["video", "entertainment"] },
  { domain: "twitch.tv", rank: 35, categories: ["video", "gaming", "entertainment"] },
  { domain: "spotify.com", rank: 40, categories: ["music", "entertainment"] },
  { domain: "hulu.com", rank: 90, categories: ["video", "entertainment"] },
  { domain: "disney.com", rank: 100, categories: ["video", "entertainment"] },
  { domain: "disneyplus.com", rank: 85, categories: ["video", "entertainment"] },
  { domain: "hbomax.com", rank: 110, categories: ["video", "entertainment"] },
  { domain: "peacocktv.com", rank: 200, categories: ["video", "entertainment"] },
  { domain: "paramountplus.com", rank: 220, categories: ["video", "entertainment"] },
  { domain: "primevideo.com", rank: 95, categories: ["video", "entertainment"] },
  { domain: "vimeo.com", rank: 180, categories: ["video", "entertainment"] },
  { domain: "dailymotion.com", rank: 250, categories: ["video", "entertainment"] },
  { domain: "soundcloud.com", rank: 160, categories: ["music", "entertainment"] },
  { domain: "pandora.com", rank: 280, categories: ["music", "entertainment"] },
  { domain: "deezer.com", rank: 350, categories: ["music", "entertainment"] },
  { domain: "tidal.com", rank: 600, categories: ["music", "entertainment"] },
  { domain: "applemusic.com", rank: 130, categories: ["music", "entertainment"] },
  
  // E-commerce & Shopping
  { domain: "amazon.com", rank: 15, categories: ["shopping"] },
  { domain: "ebay.com", rank: 42, categories: ["shopping"] },
  { domain: "alibaba.com", rank: 65, categories: ["shopping"] },
  { domain: "aliexpress.com", rank: 75, categories: ["shopping"] },
  { domain: "walmart.com", rank: 88, categories: ["shopping"] },
  { domain: "etsy.com", rank: 115, categories: ["shopping"] },
  { domain: "target.com", rank: 140, categories: ["shopping"] },
  { domain: "bestbuy.com", rank: 190, categories: ["shopping", "dev"] },
  { domain: "homedepot.com", rank: 210, categories: ["shopping"] },
  { domain: "ikea.com", rank: 230, categories: ["shopping"] },
  { domain: "costco.com", rank: 260, categories: ["shopping"] },
  { domain: "shopify.com", rank: 175, categories: ["shopping", "productivity"] },
  { domain: "wayfair.com", rank: 300, categories: ["shopping"] },
  { domain: "lowes.com", rank: 320, categories: ["shopping"] },
  { domain: "macys.com", rank: 380, categories: ["shopping"] },
  { domain: "nordstrom.com", rank: 450, categories: ["shopping"] },
  { domain: "kohls.com", rank: 500, categories: ["shopping"] },
  { domain: "sephora.com", rank: 420, categories: ["shopping"] },
  { domain: "ulta.com", rank: 550, categories: ["shopping"] },
  { domain: "newegg.com", rank: 480, categories: ["shopping", "dev"] },
  
  // Productivity & Work Tools
  { domain: "chatgpt.com", rank: 5, categories: ["productivity"] },
  { domain: "office.com", rank: 28, categories: ["productivity"] },
  { domain: "microsoft.com", rank: 30, categories: ["productivity", "dev"] },
  { domain: "google.com/drive", rank: 32, categories: ["productivity"] },
  { domain: "docs.google.com", rank: 38, categories: ["productivity"] },
  { domain: "dropbox.com", rank: 125, categories: ["productivity"] },
  { domain: "zoom.us", rank: 48, categories: ["communication", "productivity"] },
  { domain: "slack.com", rank: 165, categories: ["communication", "productivity"] },
  { domain: "notion.so", rank: 195, categories: ["productivity"] },
  { domain: "trello.com", rank: 270, categories: ["productivity"] },
  { domain: "asana.com", rank: 340, categories: ["productivity"] },
  { domain: "monday.com", rank: 390, categories: ["productivity"] },
  { domain: "atlassian.com", rank: 240, categories: ["productivity", "dev"] },
  { domain: "jira.atlassian.com", rank: 290, categories: ["productivity", "dev"] },
  { domain: "confluence.atlassian.com", rank: 310, categories: ["productivity", "dev"] },
  { domain: "canva.com", rank: 105, categories: ["productivity"] },
  { domain: "figma.com", rank: 235, categories: ["productivity", "dev"] },
  { domain: "miro.com", rank: 410, categories: ["productivity"] },
  { domain: "airtable.com", rank: 470, categories: ["productivity"] },
  { domain: "salesforce.com", rank: 185, categories: ["productivity"] },
  
  // News & Media
  { domain: "cnn.com", rank: 58, categories: ["news"] },
  { domain: "bbc.com", rank: 62, categories: ["news"] },
  { domain: "nytimes.com", rank: 72, categories: ["news"] },
  { domain: "foxnews.com", rank: 98, categories: ["news"] },
  { domain: "washingtonpost.com", rank: 135, categories: ["news"] },
  { domain: "theguardian.com", rank: 145, categories: ["news"] },
  { domain: "wsj.com", rank: 170, categories: ["news", "finance"] },
  { domain: "reuters.com", rank: 205, categories: ["news"] },
  { domain: "bloomberg.com", rank: 215, categories: ["news", "finance"] },
  { domain: "forbes.com", rank: 225, categories: ["news", "finance"] },
  { domain: "businessinsider.com", rank: 245, categories: ["news", "finance"] },
  { domain: "cnbc.com", rank: 265, categories: ["news", "finance"] },
  { domain: "msnbc.com", rank: 285, categories: ["news"] },
  { domain: "npr.org", rank: 295, categories: ["news"] },
  { domain: "apnews.com", rank: 305, categories: ["news"] },
  { domain: "usatoday.com", rank: 315, categories: ["news"] },
  { domain: "latimes.com", rank: 365, categories: ["news"] },
  { domain: "nypost.com", rank: 375, categories: ["news"] },
  { domain: "time.com", rank: 385, categories: ["news"] },
  { domain: "newsweek.com", rank: 405, categories: ["news"] },
  
  // Tech & Development
  { domain: "github.com", rank: 20, categories: ["dev", "productivity"] },
  { domain: "stackoverflow.com", rank: 52, categories: ["dev", "reference"] },
  { domain: "medium.com", rank: 78, categories: ["dev", "reference"] },
  { domain: "dev.to", rank: 255, categories: ["dev", "reference"] },
  { domain: "gitlab.com", rank: 330, categories: ["dev", "productivity"] },
  { domain: "bitbucket.org", rank: 430, categories: ["dev", "productivity"] },
  { domain: "codepen.io", rank: 460, categories: ["dev", "productivity"] },
  { domain: "replit.com", rank: 520, categories: ["dev", "productivity"] },
  { domain: "codesandbox.io", rank: 590, categories: ["dev", "productivity"] },
  { domain: "jsfiddle.net", rank: 680, categories: ["dev", "productivity"] },
  { domain: "developer.mozilla.org", rank: 155, categories: ["dev", "reference"] },
  { domain: "w3schools.com", rank: 200, categories: ["dev", "reference", "education"] },
  { domain: "geeksforgeeks.org", rank: 360, categories: ["dev", "reference", "education"] },
  { domain: "freecodecamp.org", rank: 440, categories: ["dev", "education"] },
  { domain: "codecademy.com", rank: 530, categories: ["dev", "education"] },
  { domain: "udemy.com", rank: 275, categories: ["education", "dev"] },
  { domain: "coursera.org", rank: 325, categories: ["education", "dev"] },
  { domain: "leetcode.com", rank: 490, categories: ["dev", "education"] },
  { domain: "hackerrank.com", rank: 570, categories: ["dev", "education"] },
  { domain: "kaggle.com", rank: 610, categories: ["dev", "reference"] },
  
  // Reference & Research
  { domain: "wikipedia.org", rank: 10, categories: ["reference"] },
  { domain: "wikihow.com", rank: 150, categories: ["reference"] },
  { domain: "archive.org", rank: 345, categories: ["reference"] },
  { domain: "britannica.com", rank: 465, categories: ["reference", "education"] },
  { domain: "merriam-webster.com", rank: 510, categories: ["reference"] },
  { domain: "dictionary.com", rank: 540, categories: ["reference"] },
  { domain: "thesaurus.com", rank: 620, categories: ["reference"] },
  { domain: "scholar.google.com", rank: 355, categories: ["reference", "education"] },
  { domain: "researchgate.net", rank: 415, categories: ["reference", "education"] },
  { domain: "academia.edu", rank: 580, categories: ["reference", "education"] },
  
  // Finance & Banking
  { domain: "paypal.com", rank: 55, categories: ["finance"] },
  { domain: "chase.com", rank: 92, categories: ["finance"] },
  { domain: "bankofamerica.com", rank: 108, categories: ["finance"] },
  { domain: "wellsfargo.com", rank: 122, categories: ["finance"] },
  { domain: "americanexpress.com", rank: 142, categories: ["finance"] },
  { domain: "capitalone.com", rank: 158, categories: ["finance"] },
  { domain: "citi.com", rank: 172, categories: ["finance"] },
  { domain: "discover.com", rank: 188, categories: ["finance"] },
  { domain: "robinhood.com", rank: 198, categories: ["finance", "crypto"] },
  { domain: "coinbase.com", rank: 208, categories: ["crypto", "finance"] },
  { domain: "binance.com", rank: 218, categories: ["crypto", "finance"] },
  { domain: "fidelity.com", rank: 228, categories: ["finance"] },
  { domain: "vanguard.com", rank: 238, categories: ["finance"] },
  { domain: "schwab.com", rank: 248, categories: ["finance"] },
  { domain: "etrade.com", rank: 335, categories: ["finance"] },
  { domain: "tdameritrade.com", rank: 395, categories: ["finance"] },
  { domain: "mint.com", rank: 425, categories: ["finance", "productivity"] },
  { domain: "creditkarma.com", rank: 370, categories: ["finance"] },
  { domain: "nerdwallet.com", rank: 435, categories: ["finance", "reference"] },
  { domain: "zillow.com", rank: 102, categories: ["finance", "reference"] },
  
  // Gaming
  { domain: "steampowered.com", rank: 68, categories: ["gaming", "entertainment"] },
  { domain: "roblox.com", rank: 82, categories: ["gaming", "social", "entertainment"] },
  { domain: "epicgames.com", rank: 112, categories: ["gaming", "entertainment"] },
  { domain: "minecraft.net", rank: 132, categories: ["gaming", "entertainment"] },
  { domain: "ea.com", rank: 162, categories: ["gaming", "entertainment"] },
  { domain: "playstation.com", rank: 178, categories: ["gaming", "entertainment"] },
  { domain: "xbox.com", rank: 192, categories: ["gaming", "entertainment"] },
  { domain: "nintendo.com", rank: 202, categories: ["gaming", "entertainment"] },
  { domain: "ign.com", rank: 212, categories: ["gaming", "news", "entertainment"] },
  { domain: "gamespot.com", rank: 295, categories: ["gaming", "news", "entertainment"] },
  { domain: "kotaku.com", rank: 445, categories: ["gaming", "news", "entertainment"] },
  { domain: "polygon.com", rank: 485, categories: ["gaming", "news", "entertainment"] },
  { domain: "pcgamer.com", rank: 525, categories: ["gaming", "news", "entertainment"] },
  { domain: "gog.com", rank: 565, categories: ["gaming", "entertainment"] },
  { domain: "humblebundle.com", rank: 605, categories: ["gaming", "entertainment"] },
  { domain: "itch.io", rank: 645, categories: ["gaming", "dev"] },
  { domain: "unity.com", rank: 475, categories: ["gaming", "dev"] },
  { domain: "unrealengine.com", rank: 555, categories: ["gaming", "dev"] },
  
  // Travel
  { domain: "booking.com", rank: 95, categories: ["travel"] },
  { domain: "airbnb.com", rank: 118, categories: ["travel"] },
  { domain: "expedia.com", rank: 138, categories: ["travel"] },
  { domain: "tripadvisor.com", rank: 152, categories: ["travel", "reference"] },
  { domain: "hotels.com", rank: 168, categories: ["travel"] },
  { domain: "kayak.com", rank: 182, categories: ["travel"] },
  { domain: "priceline.com", rank: 222, categories: ["travel"] },
  { domain: "marriott.com", rank: 252, categories: ["travel"] },
  { domain: "hilton.com", rank: 262, categories: ["travel"] },
  { domain: "hyatt.com", rank: 272, categories: ["travel"] },
  { domain: "ihg.com", rank: 282, categories: ["travel"] },
  { domain: "delta.com", rank: 292, categories: ["travel"] },
  { domain: "united.com", rank: 302, categories: ["travel"] },
  { domain: "aa.com", rank: 312, categories: ["travel"] },
  { domain: "southwest.com", rank: 322, categories: ["travel"] },
  { domain: "jetblue.com", rank: 332, categories: ["travel"] },
  { domain: "spirit.com", rank: 342, categories: ["travel"] },
  { domain: "uber.com", rank: 148, categories: ["travel", "food_delivery"] },
  { domain: "lyft.com", rank: 258, categories: ["travel"] },
  
  // Food & Delivery
  { domain: "doordash.com", rank: 128, categories: ["food_delivery"] },
  { domain: "ubereats.com", rank: 165, categories: ["food_delivery"] },
  { domain: "grubhub.com", rank: 195, categories: ["food_delivery"] },
  { domain: "postmates.com", rank: 350, categories: ["food_delivery"] },
  { domain: "instacart.com", rank: 175, categories: ["food_delivery", "shopping"] },
  { domain: "yelp.com", rank: 185, categories: ["food_delivery", "reference"] },
  { domain: "seamless.com", rank: 455, categories: ["food_delivery"] },
  { domain: "opentable.com", rank: 495, categories: ["food_delivery"] },
  { domain: "allrecipes.com", rank: 535, categories: ["food_delivery", "reference"] },
  { domain: "foodnetwork.com", rank: 575, categories: ["food_delivery", "video"] },
  { domain: "epicurious.com", rank: 615, categories: ["food_delivery", "reference"] },
  { domain: "seriouseats.com", rank: 655, categories: ["food_delivery", "reference"] },
  
  // Test Domains
  { domain: "example.com", rank: 999, categories: ["test"] },
  
  // Health & Fitness
  { domain: "webmd.com", rank: 232, categories: ["health_fitness", "reference"] },
  { domain: "mayoclinic.org", rank: 268, categories: ["health_fitness", "reference"] },
  { domain: "nih.gov", rank: 288, categories: ["health_fitness", "government", "reference"] },
  { domain: "healthline.com", rank: 308, categories: ["health_fitness", "reference"] },
  { domain: "medicalnewstoday.com", rank: 328, categories: ["health_fitness", "news"] },
  { domain: "cvs.com", rank: 348, categories: ["health_fitness", "shopping"] },
  { domain: "walgreens.com", rank: 368, categories: ["health_fitness", "shopping"] },
  { domain: "myfitnesspal.com", rank: 505, categories: ["health_fitness", "productivity"] },
  { domain: "fitbit.com", rank: 545, categories: ["health_fitness", "shopping"] },
  { domain: "peloton.com", rank: 585, categories: ["health_fitness", "video"] },
  { domain: "strava.com", rank: 625, categories: ["health_fitness", "social"] },
  
  // Education
  { domain: "khanacademy.org", rank: 400, categories: ["education", "reference"] },
  { domain: "edx.org", rank: 515, categories: ["education"] },
  { domain: "ted.com", rank: 560, categories: ["education", "reference"] },
  { domain: "skillshare.com", rank: 630, categories: ["education"] },
  { domain: "masterclass.com", rank: 635, categories: ["education", "video"] },
  { domain: "brilliant.org", rank: 640, categories: ["education"] },
  { domain: "duolingo.com", rank: 660, categories: ["education"] },
  { domain: "memrise.com", rank: 670, categories: ["education"] },
  { domain: "babbel.com", rank: 690, categories: ["education"] },
  { domain: "rosettastone.com", rank: 700, categories: ["education"] },
  
  // Government
  { domain: "irs.gov", rank: 298, categories: ["government"] },
  { domain: "usps.com", rank: 318, categories: ["government"] },
  { domain: "dmv.gov", rank: 338, categories: ["government"] },
  { domain: "state.gov", rank: 358, categories: ["government"] },
  { domain: "whitehouse.gov", rank: 378, categories: ["government"] },
  { domain: "senate.gov", rank: 398, categories: ["government"] },
  { domain: "house.gov", rank: 418, categories: ["government"] },
  { domain: "justice.gov", rank: 438, categories: ["government"] },
  { domain: "defense.gov", rank: 458, categories: ["government"] },
  { domain: "nasa.gov", rank: 478, categories: ["government", "reference"] },
  { domain: "noaa.gov", rank: 498, categories: ["government", "reference"] },
  { domain: "cdc.gov", rank: 388, categories: ["government", "health_fitness"] },
  { domain: "fda.gov", rank: 408, categories: ["government", "health_fitness"] },
  { domain: "epa.gov", rank: 428, categories: ["government"] },
  { domain: "fbi.gov", rank: 448, categories: ["government"] },
  { domain: "cia.gov", rank: 468, categories: ["government"] },
  { domain: "nsa.gov", rank: 488, categories: ["government"] },
  
  // Sports
  { domain: "espn.com", rank: 125, categories: ["sports", "news"] },
  { domain: "nfl.com", rank: 155, categories: ["sports"] },
  { domain: "nba.com", rank: 175, categories: ["sports"] },
  { domain: "mlb.com", rank: 195, categories: ["sports"] },
  { domain: "nhl.com", rank: 215, categories: ["sports"] },
  { domain: "fifa.com", rank: 235, categories: ["sports"] },
  { domain: "uefa.com", rank: 255, categories: ["sports"] },
  { domain: "olympic.org", rank: 275, categories: ["sports"] },
  { domain: "bleacherreport.com", rank: 295, categories: ["sports", "news"] },
  { domain: "foxsports.com", rank: 315, categories: ["sports", "news"] },
  { domain: "cbssports.com", rank: 335, categories: ["sports", "news"] },
  { domain: "si.com", rank: 355, categories: ["sports", "news"] },
  { domain: "theathleticcom", rank: 375, categories: ["sports", "news"] },
  { domain: "barstoolsports.com", rank: 395, categories: ["sports", "entertainment"] },
  
  // Adult Content
  { domain: "pornhub.com", rank: 11, categories: ["adult"] },
  { domain: "xvideos.com", rank: 17, categories: ["adult"] },
  { domain: "xnxx.com", rank: 21, categories: ["adult"] },
  { domain: "xhamster.com", rank: 24, categories: ["adult"] },
  { domain: "onlyfans.com", rank: 29, categories: ["adult", "social"] },
  
  // Crypto & Web3
  { domain: "crypto.com", rank: 650, categories: ["crypto", "finance"] },
  { domain: "kraken.com", rank: 665, categories: ["crypto", "finance"] },
  { domain: "gemini.com", rank: 675, categories: ["crypto", "finance"] },
  { domain: "metamask.io", rank: 685, categories: ["crypto", "productivity"] },
  { domain: "opensea.io", rank: 695, categories: ["crypto"] },
  { domain: "etherscan.io", rank: 705, categories: ["crypto", "reference"] },
  { domain: "coinmarketcap.com", rank: 710, categories: ["crypto", "reference"] },
  { domain: "coingecko.com", rank: 720, categories: ["crypto", "reference"] },
  
  // Additional popular sites
  { domain: "apple.com", rank: 34, categories: ["dev", "shopping"] },
  { domain: "live.com", rank: 41, categories: ["productivity", "communication"] },
  { domain: "mail.ru", rank: 36, categories: ["communication"] },
  { domain: "cloudflare.com", rank: 730, categories: ["dev", "productivity"] },
  { domain: "wordpress.com", rank: 740, categories: ["dev", "productivity"] },
  { domain: "wix.com", rank: 750, categories: ["dev", "productivity"] },
  { domain: "squarespace.com", rank: 760, categories: ["dev", "productivity"] },
  { domain: "godaddy.com", rank: 770, categories: ["dev", "productivity"] },
  { domain: "namecheap.com", rank: 780, categories: ["dev", "productivity"] },
  { domain: "digitalocean.com", rank: 790, categories: ["dev", "productivity"] },
  { domain: "aws.amazon.com", rank: 800, categories: ["dev", "productivity"] },
  { domain: "cloud.google.com", rank: 810, categories: ["dev", "productivity"] },
  { domain: "azure.microsoft.com", rank: 820, categories: ["dev", "productivity"] },
  { domain: "heroku.com", rank: 830, categories: ["dev", "productivity"] },
  { domain: "netlify.com", rank: 840, categories: ["dev", "productivity"] },
  { domain: "vercel.com", rank: 850, categories: ["dev", "productivity"] }
];

// Helper function to get categories for a domain
export function getCategoriesForDomain(domain) {
  // Remove www. prefix if present
  const cleanDomain = domain.replace(/^www\./, '');
  
  // Find exact match first
  const exactMatch = CATEGORIZED_DOMAINS.find(d => d.domain === cleanDomain);
  if (exactMatch) {
    return exactMatch.categories;
  }
  
  // Check for subdomain matches (e.g., mail.google.com matches google.com)
  const parts = cleanDomain.split('.');
  if (parts.length > 2) {
    const baseDomain = parts.slice(-2).join('.');
    const baseMatch = CATEGORIZED_DOMAINS.find(d => d.domain === baseDomain);
    if (baseMatch) {
      return baseMatch.categories;
    }
  }
  
  return [];
}

// Helper function to get domains by category
export function getDomainsByCategory(category) {
  return CATEGORIZED_DOMAINS
    .filter(d => d.categories.includes(category))
    .map(d => d.domain);
}

// Helper function to get category info
export function getCategoryInfo(categoryId) {
  return DOMAIN_CATEGORIES[categoryId] || null;
}

// Export for use in other modules
export default {
  DOMAIN_CATEGORIES,
  CATEGORIZED_DOMAINS,
  getCategoriesForDomain,
  getDomainsByCategory,
  getCategoryInfo
};