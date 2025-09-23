#!/usr/bin/env python3
"""
Convert processed domain list to JavaScript module for TabMaster Pro
"""

import json
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
PROCESSED_DIR = DATA_DIR / 'processed'
LIB_DIR = SCRIPT_DIR.parent / 'lib'

# Extended category mapping for more domains
EXTENDED_CATEGORIES = {
    # Russian sites
    'mail.ru': ['communication', 'portal'],
    'yandex.ru': ['search', 'portal'],
    'vk.com': ['social'],
    'ok.ru': ['social'],
    'dzen.ru': ['news_media', 'entertainment'],
    'avito.ru': ['shopping'],
    'wildberries.ru': ['shopping'],
    'ozon.ru': ['shopping'],
    'sberbank.ru': ['finance'],
    'kinopoisk.ru': ['streaming_entertainment'],
    'ria.ru': ['news_media'],
    'rambler.ru': ['portal', 'news_media'],
    'lenta.ru': ['news_media'],
    'tass.ru': ['news_media'],
    'rbc.ru': ['news_media', 'finance'],
    'gosuslugi.ru': ['government'],
    
    # Chinese sites
    'baidu.com': ['search'],
    'qq.com': ['social', 'portal'],
    'taobao.com': ['shopping'],
    'tmall.com': ['shopping'],
    'jd.com': ['shopping'],
    'weibo.com': ['social'],
    'sina.com.cn': ['portal', 'news_media'],
    'sohu.com': ['portal', 'news_media'],
    '163.com': ['portal', 'news_media'],
    'bilibili.com': ['streaming_entertainment', 'social'],
    'zhihu.com': ['social', 'reference_research'],
    'douyin.com': ['streaming_entertainment', 'social'],
    'alipay.com': ['finance'],
    'tencent.com': ['tech_dev', 'gaming'],
    
    # Japanese sites
    'yahoo.co.jp': ['portal', 'search'],
    'rakuten.co.jp': ['shopping'],
    'amazon.co.jp': ['shopping'],
    'nicovideo.jp': ['streaming_entertainment', 'social'],
    'dmm.com': ['entertainment', 'shopping'],
    'fc2.com': ['tech_dev', 'entertainment'],
    
    # German sites
    'spiegel.de': ['news_media'],
    'bild.de': ['news_media'],
    'zeit.de': ['news_media'],
    'otto.de': ['shopping'],
    'mediamarkt.de': ['shopping'],
    
    # French sites
    'lemonde.fr': ['news_media'],
    'lefigaro.fr': ['news_media'],
    'leboncoin.fr': ['shopping'],
    'orange.fr': ['communication', 'portal'],
    'free.fr': ['communication', 'portal'],
    
    # UK specific
    'bbc.co.uk': ['news_media'],
    'gov.uk': ['government'],
    'dailymail.co.uk': ['news_media'],
    'theguardian.com': ['news_media'],
    'telegraph.co.uk': ['news_media'],
    'tesco.com': ['shopping'],
    'argos.co.uk': ['shopping'],
    
    # Tech/Dev sites
    'apple.com': ['tech_dev', 'shopping'],
    'adobe.com': ['productivity_tools', 'tech_dev'],
    'oracle.com': ['tech_dev', 'productivity_tools'],
    'salesforce.com': ['productivity_tools'],
    'shopify.com': ['shopping', 'productivity_tools'],
    'wordpress.com': ['tech_dev', 'productivity_tools'],
    'wordpress.org': ['tech_dev'],
    'wix.com': ['tech_dev', 'productivity_tools'],
    'squarespace.com': ['tech_dev', 'productivity_tools'],
    'godaddy.com': ['tech_dev'],
    'namecheap.com': ['tech_dev'],
    'digitalocean.com': ['tech_dev'],
    'heroku.com': ['tech_dev'],
    'netlify.com': ['tech_dev'],
    'vercel.com': ['tech_dev'],
    'npmjs.com': ['tech_dev'],
    'pypi.org': ['tech_dev'],
    'rubygems.org': ['tech_dev'],
    'packagist.org': ['tech_dev'],
    'docker.com': ['tech_dev'],
    'kubernetes.io': ['tech_dev'],
    'terraform.io': ['tech_dev'],
    'ansible.com': ['tech_dev'],
    'jenkins.io': ['tech_dev'],
    'circleci.com': ['tech_dev'],
    'travis-ci.org': ['tech_dev'],
    
    # Social/Communication
    'zoom.us': ['communication', 'productivity_tools'],
    'skype.com': ['communication'],
    'teams.microsoft.com': ['communication', 'productivity_tools'],
    'meet.google.com': ['communication', 'productivity_tools'],
    'messenger.com': ['communication', 'social'],
    'signal.org': ['communication'],
    'viber.com': ['communication'],
    'line.me': ['communication', 'social'],
    'kakao.com': ['communication', 'social'],
    
    # Streaming/Entertainment
    'netflix.com': ['streaming_entertainment'],
    'hulu.com': ['streaming_entertainment'],
    'disney.com': ['entertainment', 'streaming_entertainment'],
    'disneyplus.com': ['streaming_entertainment'],
    'hbo.com': ['streaming_entertainment'],
    'hbomax.com': ['streaming_entertainment'],
    'peacocktv.com': ['streaming_entertainment'],
    'paramount.com': ['streaming_entertainment'],
    'paramountplus.com': ['streaming_entertainment'],
    'crunchyroll.com': ['streaming_entertainment'],
    'funimation.com': ['streaming_entertainment'],
    'plex.tv': ['streaming_entertainment'],
    
    # News/Media
    'reuters.com': ['news_media'],
    'bloomberg.com': ['news_media', 'finance'],
    'wsj.com': ['news_media', 'finance'],
    'ft.com': ['news_media', 'finance'],
    'economist.com': ['news_media', 'finance'],
    'buzzfeed.com': ['news_media', 'entertainment'],
    'huffpost.com': ['news_media'],
    'vice.com': ['news_media', 'entertainment'],
    'vox.com': ['news_media'],
    'axios.com': ['news_media'],
    'politico.com': ['news_media'],
    'thehill.com': ['news_media'],
    'slate.com': ['news_media'],
    'salon.com': ['news_media'],
    'motherjones.com': ['news_media'],
    'breitbart.com': ['news_media'],
    'infowars.com': ['news_media'],
    'drudgereport.com': ['news_media'],
    
    # E-commerce/Shopping
    'shopify.com': ['shopping', 'productivity_tools'],
    'wish.com': ['shopping'],
    'wayfair.com': ['shopping'],
    'overstock.com': ['shopping'],
    'newegg.com': ['shopping', 'tech_dev'],
    'bhphotovideo.com': ['shopping'],
    'adorama.com': ['shopping'],
    'sephora.com': ['shopping'],
    'ulta.com': ['shopping'],
    'nordstrom.com': ['shopping'],
    'macys.com': ['shopping'],
    'kohls.com': ['shopping'],
    'jcpenney.com': ['shopping'],
    'gap.com': ['shopping'],
    'oldnavy.com': ['shopping'],
    'forever21.com': ['shopping'],
    'hm.com': ['shopping'],
    'zara.com': ['shopping'],
    'uniqlo.com': ['shopping'],
    'shein.com': ['shopping'],
    'asos.com': ['shopping'],
    'zalando.com': ['shopping'],
    
    # Finance
    'visa.com': ['finance'],
    'mastercard.com': ['finance'],
    'stripe.com': ['finance', 'tech_dev'],
    'square.com': ['finance', 'tech_dev'],
    'venmo.com': ['finance'],
    'cashapp.com': ['finance'],
    'zelle.com': ['finance'],
    'wise.com': ['finance'],
    'revolut.com': ['finance'],
    'chime.com': ['finance'],
    'sofi.com': ['finance'],
    'ally.com': ['finance'],
    'marcus.com': ['finance'],
    'schwab.com': ['finance'],
    'fidelity.com': ['finance'],
    'vanguard.com': ['finance'],
    'etrade.com': ['finance'],
    'tdameritrade.com': ['finance'],
    'interactivebrokers.com': ['finance'],
    
    # Education
    'coursera.org': ['education'],
    'udacity.com': ['education', 'tech_dev'],
    'edx.org': ['education'],
    'udemy.com': ['education', 'tech_dev'],
    'pluralsight.com': ['education', 'tech_dev'],
    'lynda.com': ['education'],
    'skillshare.com': ['education'],
    'masterclass.com': ['education', 'entertainment'],
    'brilliant.org': ['education'],
    'khanacademy.org': ['education', 'reference_research'],
    'mit.edu': ['education'],
    'stanford.edu': ['education'],
    'harvard.edu': ['education'],
    'oxford.ac.uk': ['education'],
    'cambridge.org': ['education'],
    
    # Reference
    'britannica.com': ['reference_research'],
    'wikihow.com': ['reference_research'],
    'howstuffworks.com': ['reference_research'],
    'snopes.com': ['reference_research'],
    'urbandictionary.com': ['reference_research'],
    'genius.com': ['reference_research', 'music'],
    
    # Health
    'nih.gov': ['health_fitness', 'government', 'reference_research'],
    'who.int': ['health_fitness', 'government'],
    'cdc.gov': ['health_fitness', 'government'],
    'webmd.com': ['health_fitness', 'reference_research'],
    'mayoclinic.org': ['health_fitness', 'reference_research'],
    'healthline.com': ['health_fitness', 'reference_research'],
    'medlineplus.gov': ['health_fitness', 'government', 'reference_research'],
    'drugs.com': ['health_fitness', 'reference_research'],
    
    # Government
    'whitehouse.gov': ['government'],
    'senate.gov': ['government'],
    'house.gov': ['government'],
    'supremecourt.gov': ['government'],
    'irs.gov': ['government'],
    'ssa.gov': ['government'],
    'va.gov': ['government'],
    'usda.gov': ['government'],
    'noaa.gov': ['government', 'reference_research'],
    'nasa.gov': ['government', 'reference_research'],
    'fbi.gov': ['government'],
    'cia.gov': ['government'],
    'nsa.gov': ['government'],
    'state.gov': ['government'],
    'treasury.gov': ['government'],
    'justice.gov': ['government'],
    'defense.gov': ['government'],
    'dhs.gov': ['government'],
    
    # Travel
    'booking.com': ['travel'],
    'expedia.com': ['travel'],
    'hotels.com': ['travel'],
    'airbnb.com': ['travel'],
    'vrbo.com': ['travel'],
    'tripadvisor.com': ['travel', 'reference_research'],
    'kayak.com': ['travel'],
    'skyscanner.com': ['travel'],
    'priceline.com': ['travel'],
    'agoda.com': ['travel'],
    'hostelworld.com': ['travel'],
    
    # CDN/Infrastructure
    'akamaihd.net': ['tech_dev'],
    'akamaitechnologies.com': ['tech_dev'],
    'cloudflare.net': ['tech_dev'],
    'fastly.net': ['tech_dev'],
    'cloudfront.net': ['tech_dev'],
    'azureedge.net': ['tech_dev'],
    'edgecastcdn.net': ['tech_dev'],
    'stackpathcdn.com': ['tech_dev'],
    'bootstrapcdn.com': ['tech_dev'],
    'jsdelivr.net': ['tech_dev'],
    'unpkg.com': ['tech_dev'],
    'cdnjs.com': ['tech_dev'],
    
    # Gaming
    'steampowered.com': ['gaming'],
    'steamcommunity.com': ['gaming', 'social'],
    'epicgames.com': ['gaming'],
    'ea.com': ['gaming'],
    'ubisoft.com': ['gaming'],
    'activision.com': ['gaming'],
    'blizzard.com': ['gaming'],
    'riotgames.com': ['gaming'],
    'minecraft.net': ['gaming'],
    'roblox.com': ['gaming', 'social'],
    'fortnite.com': ['gaming'],
    'leagueoflegends.com': ['gaming'],
    'worldofwarcraft.com': ['gaming'],
    'callofduty.com': ['gaming'],
    'battlefield.com': ['gaming'],
    'origin.com': ['gaming'],
    'gog.com': ['gaming'],
    'humblebundle.com': ['gaming'],
    'itch.io': ['gaming', 'tech_dev'],
    'gamestop.com': ['gaming', 'shopping'],
    
    # Sports
    'espn.com': ['sports', 'news_media'],
    'nfl.com': ['sports'],
    'nba.com': ['sports'],
    'mlb.com': ['sports'],
    'nhl.com': ['sports'],
    'fifa.com': ['sports'],
    'uefa.com': ['sports'],
    'premierleague.com': ['sports'],
    'laliga.com': ['sports'],
    'bundesliga.com': ['sports'],
    'seriea.com': ['sports'],
    'ligue1.com': ['sports'],
    'formula1.com': ['sports'],
    'nascar.com': ['sports'],
    'pga.com': ['sports'],
    'wimbledon.com': ['sports'],
    'olympics.com': ['sports'],
    'espncricinfo.com': ['sports'],
    
    # Music
    'spotify.com': ['music', 'streaming_entertainment'],
    'applemusic.com': ['music', 'streaming_entertainment'],
    'soundcloud.com': ['music', 'streaming_entertainment'],
    'bandcamp.com': ['music'],
    'tidal.com': ['music', 'streaming_entertainment'],
    'deezer.com': ['music', 'streaming_entertainment'],
    'pandora.com': ['music', 'streaming_entertainment'],
    'lastfm.com': ['music', 'social'],
    'shazam.com': ['music'],
    'musixmatch.com': ['music', 'reference_research'],
    'discogs.com': ['music', 'reference_research'],
    'allmusic.com': ['music', 'reference_research'],
    'pitchfork.com': ['music', 'news_media'],
    'rollingstone.com': ['music', 'news_media', 'entertainment'],
    'billboard.com': ['music', 'news_media'],
    'nme.com': ['music', 'news_media'],
    'stereogum.com': ['music', 'news_media'],
    
    # Food
    'ubereats.com': ['food_delivery'],
    'doordash.com': ['food_delivery'],
    'grubhub.com': ['food_delivery'],
    'seamless.com': ['food_delivery'],
    'postmates.com': ['food_delivery'],
    'deliveroo.com': ['food_delivery'],
    'justeat.com': ['food_delivery'],
    'zomato.com': ['food_delivery'],
    'swiggy.com': ['food_delivery'],
    'yelp.com': ['food_delivery', 'reference_research'],
    'opentable.com': ['food_delivery'],
    'allrecipes.com': ['food_delivery', 'reference_research'],
    'foodnetwork.com': ['food_delivery', 'entertainment'],
    'epicurious.com': ['food_delivery', 'reference_research'],
    'seriouseats.com': ['food_delivery', 'reference_research'],
    'bonappetit.com': ['food_delivery', 'reference_research'],
    
    # Crypto
    'coinbase.com': ['crypto', 'finance'],
    'binance.com': ['crypto', 'finance'],
    'kraken.com': ['crypto', 'finance'],
    'gemini.com': ['crypto', 'finance'],
    'bitstamp.com': ['crypto', 'finance'],
    'bitfinex.com': ['crypto', 'finance'],
    'kucoin.com': ['crypto', 'finance'],
    'huobi.com': ['crypto', 'finance'],
    'okx.com': ['crypto', 'finance'],
    'crypto.com': ['crypto', 'finance'],
    'blockchain.com': ['crypto', 'finance'],
    'etherscan.io': ['crypto', 'reference_research'],
    'coinmarketcap.com': ['crypto', 'reference_research'],
    'coingecko.com': ['crypto', 'reference_research'],
    'tradingview.com': ['finance', 'reference_research'],
}


def merge_categories(domain_data):
    """Merge existing categories with extended mapping"""
    domain = domain_data['domain']
    existing = domain_data.get('categories', [])
    extended = EXTENDED_CATEGORIES.get(domain, [])
    
    # Combine and deduplicate
    all_categories = list(set(existing + extended))
    
    return all_categories


def convert_to_js():
    """Convert JSON domain list to JavaScript module"""
    # Load processed domains
    input_file = PROCESSED_DIR / 'top_1000_domains.json'
    with open(input_file, 'r', encoding='utf-8') as f:
        domains = json.load(f)
    
    # Enhance categories
    for domain_data in domains:
        domain_data['categories'] = merge_categories(domain_data)
    
    # Create JavaScript content
    js_content = '''// Auto-generated domain categorization for TabMaster Pro
// Generated from Tranco top 1M list
// Last updated: ''' + str(Path(input_file).stat().st_mtime) + '''

export const CATEGORIZED_DOMAINS = [
'''
    
    # Add each domain
    for i, domain_data in enumerate(domains):
        js_content += '  {\n'
        js_content += f'    domain: "{domain_data["domain"]}",\n'
        js_content += f'    rank: {domain_data["rank"]},\n'
        js_content += f'    categories: {json.dumps(domain_data["categories"])}\n'
        js_content += '  }'
        if i < len(domains) - 1:
            js_content += ','
        js_content += '\n'
    
    js_content += '''];

// Helper function to get categories for a domain
export function getCategoriesForDomain(domain) {
  // Remove www. prefix if present
  const cleanDomain = domain.replace(/^www\\./, '');
  
  // Find exact match first
  const exactMatch = CATEGORIZED_DOMAINS.find(d => d.domain === cleanDomain);
  if (exactMatch) {
    return exactMatch.categories;
  }
  
  // Check for subdomain matches
  const parts = cleanDomain.split('.');
  if (parts.length > 2) {
    // Try without first subdomain
    const withoutSubdomain = parts.slice(1).join('.');
    const subdomainMatch = CATEGORIZED_DOMAINS.find(d => d.domain === withoutSubdomain);
    if (subdomainMatch) {
      return subdomainMatch.categories;
    }
  }
  
  return [];
}

// Export for use in background.js
export default {
  CATEGORIZED_DOMAINS,
  getCategoriesForDomain
};
'''
    
    # Save to lib directory  
    output_file = LIB_DIR / 'domain-categories-generated.js'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"Generated {output_file}")
    
    # Print statistics
    categorized = sum(1 for d in domains if d['categories'])
    print(f"Total domains: {len(domains)}")
    print(f"Categorized: {categorized} ({categorized/len(domains)*100:.1f}%)")
    print(f"Uncategorized: {len(domains) - categorized}")


if __name__ == '__main__':
    convert_to_js()