#!/usr/bin/env python3
"""
Domain list processor for TabMaster Pro
Processes Tranco and other public domain lists to create a categorized top 1000 domains list
"""

import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from collections import defaultdict
import math

# Directory setup
SCRIPT_DIR = Path(__file__).parent
DATA_DIR = SCRIPT_DIR.parent / 'data'
RAW_DIR = DATA_DIR / 'raw'
PROCESSED_DIR = DATA_DIR / 'processed'

# Ensure directories exist
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# Adult/gambling content blocklist patterns
ADULT_GAMBLING_PATTERNS = [
    'porn', 'sex', 'xxx', 'xvideos', 'xnxx', 'xhamster', 'hentai', 'redtube', 
    'brazzers', 'youporn', 'cam', 'escort', 'adult', 'nsfw', 'nude',
    'bet', 'casino', 'bookmaker', 'wager', 'lotto', 'gambling', 'poker',
    'slots', 'bingo', '888', 'betway', 'sportbet', 'oddschecker'
]

# Allowlist for false positives
ALLOWLIST = [
    'sexualhealth.com',  # Example: legitimate health education
    'betterhealth.vic.gov.au',  # Example: contains 'bet' but is health site
]

# Domain categories mapping (simplified version for processing)
DOMAIN_CATEGORIES_SIMPLE = {
    # Search engines
    'google.com': ['search', 'productivity_tools'],
    'bing.com': ['search'],
    'yahoo.com': ['search', 'news_media'],
    'yandex.ru': ['search'],
    'yandex.com': ['search'],
    'baidu.com': ['search'],
    'duckduckgo.com': ['search'],
    'ask.com': ['search'],
    
    # Social Media
    'facebook.com': ['social'],
    'instagram.com': ['social'],
    'twitter.com': ['social'],
    'x.com': ['social'],
    'reddit.com': ['social', 'reference_research'],
    'linkedin.com': ['social', 'professional'],
    'pinterest.com': ['social', 'entertainment'],
    'tiktok.com': ['social', 'streaming_entertainment'],
    'snapchat.com': ['social', 'communication'],
    'discord.com': ['communication', 'gaming'],
    'telegram.org': ['communication', 'social'],
    'whatsapp.com': ['communication', 'social'],
    'wechat.com': ['communication', 'social'],
    'tumblr.com': ['social', 'entertainment'],
    'quora.com': ['social', 'reference_research'],
    'vk.com': ['social'],
    'ok.ru': ['social'],
    'weibo.com': ['social'],
    
    # Streaming & Entertainment
    'youtube.com': ['streaming_entertainment', 'social'],
    'netflix.com': ['streaming_entertainment'],
    'twitch.tv': ['streaming_entertainment', 'gaming'],
    'spotify.com': ['music', 'streaming_entertainment'],
    'hulu.com': ['streaming_entertainment'],
    'disney.com': ['streaming_entertainment', 'entertainment'],
    'disneyplus.com': ['streaming_entertainment'],
    'hbomax.com': ['streaming_entertainment'],
    'peacocktv.com': ['streaming_entertainment'],
    'paramountplus.com': ['streaming_entertainment'],
    'primevideo.com': ['streaming_entertainment'],
    'vimeo.com': ['streaming_entertainment'],
    'dailymotion.com': ['streaming_entertainment'],
    'soundcloud.com': ['music', 'streaming_entertainment'],
    'pandora.com': ['music', 'streaming_entertainment'],
    'deezer.com': ['music', 'streaming_entertainment'],
    
    # E-commerce & Shopping
    'amazon.com': ['shopping'],
    'ebay.com': ['shopping'],
    'alibaba.com': ['shopping'],
    'aliexpress.com': ['shopping'],
    'walmart.com': ['shopping'],
    'etsy.com': ['shopping'],
    'target.com': ['shopping'],
    'bestbuy.com': ['shopping', 'tech_dev'],
    'homedepot.com': ['shopping'],
    'ikea.com': ['shopping'],
    'costco.com': ['shopping'],
    'shopify.com': ['shopping', 'productivity_tools'],
    'wish.com': ['shopping'],
    'rakuten.com': ['shopping'],
    'mercadolibre.com': ['shopping'],
    'flipkart.com': ['shopping'],
    'jd.com': ['shopping'],
    'taobao.com': ['shopping'],
    'tmall.com': ['shopping'],
    
    # News & Media
    'cnn.com': ['news_media'],
    'bbc.com': ['news_media'],
    'bbc.co.uk': ['news_media'],
    'nytimes.com': ['news_media'],
    'foxnews.com': ['news_media'],
    'washingtonpost.com': ['news_media'],
    'theguardian.com': ['news_media'],
    'wsj.com': ['news_media', 'finance'],
    'reuters.com': ['news_media'],
    'bloomberg.com': ['news_media', 'finance'],
    'forbes.com': ['news_media', 'finance'],
    'businessinsider.com': ['news_media', 'finance'],
    'cnbc.com': ['news_media', 'finance'],
    'msnbc.com': ['news_media'],
    'npr.org': ['news_media'],
    'apnews.com': ['news_media'],
    'usatoday.com': ['news_media'],
    'latimes.com': ['news_media'],
    'nypost.com': ['news_media'],
    
    # Tech & Development
    'github.com': ['tech_dev', 'productivity_tools'],
    'stackoverflow.com': ['tech_dev', 'reference_research'],
    'medium.com': ['tech_dev', 'reference_research'],
    'dev.to': ['tech_dev', 'reference_research'],
    'gitlab.com': ['tech_dev', 'productivity_tools'],
    'bitbucket.org': ['tech_dev', 'productivity_tools'],
    'developer.mozilla.org': ['tech_dev', 'reference_research'],
    'w3schools.com': ['tech_dev', 'reference_research', 'education'],
    'geeksforgeeks.org': ['tech_dev', 'reference_research', 'education'],
    'freecodecamp.org': ['tech_dev', 'education'],
    'codecademy.com': ['tech_dev', 'education'],
    
    # Productivity Tools
    'microsoft.com': ['productivity_tools', 'tech_dev'],
    'office.com': ['productivity_tools'],
    'office365.com': ['productivity_tools'],
    'outlook.com': ['productivity_tools', 'communication'],
    'dropbox.com': ['productivity_tools'],
    'box.com': ['productivity_tools'],
    'zoom.us': ['communication', 'productivity_tools'],
    'slack.com': ['communication', 'productivity_tools'],
    'notion.so': ['productivity_tools'],
    'trello.com': ['productivity_tools'],
    'asana.com': ['productivity_tools'],
    'monday.com': ['productivity_tools'],
    'atlassian.com': ['productivity_tools', 'tech_dev'],
    'canva.com': ['productivity_tools', 'entertainment'],
    'figma.com': ['productivity_tools', 'tech_dev'],
    'miro.com': ['productivity_tools'],
    
    # Reference & Research
    'wikipedia.org': ['reference_research'],
    'wikihow.com': ['reference_research'],
    'archive.org': ['reference_research'],
    'britannica.com': ['reference_research', 'education'],
    'merriam-webster.com': ['reference_research'],
    'dictionary.com': ['reference_research'],
    'thesaurus.com': ['reference_research'],
    
    # Finance & Banking
    'paypal.com': ['finance'],
    'chase.com': ['finance'],
    'bankofamerica.com': ['finance'],
    'wellsfargo.com': ['finance'],
    'americanexpress.com': ['finance'],
    'capitalone.com': ['finance'],
    'citi.com': ['finance'],
    'discover.com': ['finance'],
    'robinhood.com': ['finance', 'crypto'],
    'coinbase.com': ['crypto', 'finance'],
    'binance.com': ['crypto', 'finance'],
    'kraken.com': ['crypto', 'finance'],
    
    # Gaming
    'steampowered.com': ['gaming'],
    'roblox.com': ['gaming', 'social'],
    'epicgames.com': ['gaming'],
    'minecraft.net': ['gaming'],
    'ea.com': ['gaming'],
    'playstation.com': ['gaming'],
    'xbox.com': ['gaming'],
    'nintendo.com': ['gaming'],
    'ign.com': ['gaming', 'news_media'],
    'gamespot.com': ['gaming', 'news_media'],
    
    # Travel
    'booking.com': ['travel'],
    'airbnb.com': ['travel'],
    'expedia.com': ['travel'],
    'tripadvisor.com': ['travel', 'reference_research'],
    'hotels.com': ['travel'],
    'kayak.com': ['travel'],
    'priceline.com': ['travel'],
    'marriott.com': ['travel'],
    'hilton.com': ['travel'],
    'uber.com': ['travel', 'food_delivery'],
    'lyft.com': ['travel'],
    
    # Food & Delivery
    'doordash.com': ['food_delivery'],
    'ubereats.com': ['food_delivery'],
    'grubhub.com': ['food_delivery'],
    'postmates.com': ['food_delivery'],
    'instacart.com': ['food_delivery', 'shopping'],
    'yelp.com': ['food_delivery', 'reference_research'],
    
    # Health & Fitness
    'webmd.com': ['health_fitness', 'reference_research'],
    'mayoclinic.org': ['health_fitness', 'reference_research'],
    'nih.gov': ['health_fitness', 'government', 'reference_research'],
    'healthline.com': ['health_fitness', 'reference_research'],
    
    # Education
    'khanacademy.org': ['education', 'reference_research'],
    'coursera.org': ['education', 'tech_dev'],
    'udemy.com': ['education', 'tech_dev'],
    'edx.org': ['education'],
    'ted.com': ['education', 'reference_research'],
    'duolingo.com': ['education'],
    
    # Government
    'irs.gov': ['government'],
    'usps.com': ['government'],
    'state.gov': ['government'],
    'whitehouse.gov': ['government'],
    'nasa.gov': ['government', 'reference_research'],
    'cdc.gov': ['government', 'health_fitness'],
    
    # Sports
    'espn.com': ['sports', 'news_media'],
    'nfl.com': ['sports'],
    'nba.com': ['sports'],
    'mlb.com': ['sports'],
    'fifa.com': ['sports'],
    
    # Infrastructure/CDN/Tech services
    'cloudflare.com': ['tech_dev', 'productivity_tools'],
    'amazonaws.com': ['tech_dev', 'productivity_tools'],
    'akamai.net': ['tech_dev'],
    'fastly.net': ['tech_dev'],
    'cloudfront.net': ['tech_dev'],
    'googleapis.com': ['tech_dev'],
    'gstatic.com': ['tech_dev'],
    'googleusercontent.com': ['tech_dev'],
    'googlevideo.com': ['streaming_entertainment'],
    'googletagmanager.com': ['tech_dev'],
    'google-analytics.com': ['tech_dev'],
    'doubleclick.net': ['tech_dev'],
    'cloudflare-dns.com': ['tech_dev'],
}


def is_adult_or_gambling(domain):
    """Check if domain contains adult or gambling content patterns"""
    domain_lower = domain.lower()
    
    # Check allowlist first
    for allowed in ALLOWLIST:
        if allowed in domain_lower:
            return False
    
    # Check blocklist patterns
    for pattern in ADULT_GAMBLING_PATTERNS:
        if pattern in domain_lower:
            return True
    
    return False


def normalize_domain(domain):
    """Normalize domain to registrable domain"""
    # Remove protocol if present
    domain = re.sub(r'^https?://', '', domain)
    # Remove path if present
    domain = domain.split('/')[0]
    # Remove port if present
    domain = domain.split(':')[0]
    # Remove trailing dot
    domain = domain.rstrip('.')
    # Convert to lowercase
    domain = domain.lower()
    
    # Simple extraction - this won't handle all edge cases but will work for most domains
    # For domains like bbc.co.uk, we want to keep it as is
    parts = domain.split('.')
    
    # Handle common second-level TLDs
    two_level_tlds = ['co.uk', 'co.jp', 'co.kr', 'co.za', 'com.au', 'com.br', 'com.cn', 
                      'com.mx', 'com.tw', 'net.au', 'org.uk', 'gov.uk', 'ac.uk']
    
    if len(parts) >= 3:
        potential_tld = f"{parts[-2]}.{parts[-1]}"
        if potential_tld in two_level_tlds:
            # Return last 3 parts for two-level TLDs
            if len(parts) == 3:
                return domain
            else:
                return '.'.join(parts[-3:])
    
    # For regular domains, return last 2 parts
    if len(parts) >= 2:
        return '.'.join(parts[-2:])
    
    return domain


def geometric_mean(numbers):
    """Calculate geometric mean of a list of numbers"""
    if not numbers:
        return 0
    product = 1
    for num in numbers:
        product *= num
    return math.pow(product, 1/len(numbers))


def process_tranco_list():
    """Process Tranco top 1M list"""
    domains = {}
    
    tranco_file = RAW_DIR / 'top-1m.csv'
    if not tranco_file.exists():
        print("Error: Tranco file not found")
        return domains
    
    with open(tranco_file, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        for i, row in enumerate(reader):
            if i >= 2000:  # Only take top 2000 for buffer
                break
            
            rank = int(row[0])
            domain = row[1]
            normalized = normalize_domain(domain)
            
            if normalized and not is_adult_or_gambling(normalized):
                if normalized not in domains:
                    domains[normalized] = {
                        'domain': normalized,
                        'ranks': {'tranco': rank},
                        'sources': ['tranco']
                    }
    
    return domains


def merge_domain_lists(all_domains):
    """Merge domain lists and calculate final rankings"""
    merged = []
    
    for domain, data in all_domains.items():
        # Calculate merged rank
        ranks = list(data['ranks'].values())
        if len(ranks) > 1:
            merged_rank = round(geometric_mean(ranks))
        else:
            merged_rank = ranks[0]
        
        # Get categories
        categories = DOMAIN_CATEGORIES_SIMPLE.get(domain, [])
        
        merged.append({
            'domain': domain,
            'rank': merged_rank,
            'categories': categories,
            'sources': data['sources'],
            'original_ranks': data['ranks']
        })
    
    # Sort by merged rank
    merged.sort(key=lambda x: x['rank'])
    
    # Take top 1000
    return merged[:1000]


def save_results(domains):
    """Save processed domain list and manifest"""
    timestamp = datetime.now(timezone.utc)
    
    # Save domain list
    output_file = PROCESSED_DIR / 'top_1000_domains.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(domains, f, indent=2)
    
    # Save manifest
    manifest = {
        'generated_at': timestamp.isoformat(),
        'sources': {
            'tranco': {
                'file': 'tranco_20250922_222539.csv.zip',
                'fetched_at': timestamp.isoformat(),
                'domains_processed': len(domains)
            }
        },
        'filtering': {
            'adult_gambling_patterns': ADULT_GAMBLING_PATTERNS,
            'allowlist': ALLOWLIST,
            'excluded_count': 0  # Will be updated during processing
        },
        'output': {
            'total_domains': len(domains),
            'categorized_domains': sum(1 for d in domains if d['categories']),
            'uncategorized_domains': sum(1 for d in domains if not d['categories'])
        }
    }
    
    manifest_file = DATA_DIR / 'sources_manifest.json'
    with open(manifest_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"Saved {len(domains)} domains to {output_file}")
    print(f"Manifest saved to {manifest_file}")


def main():
    """Main processing function"""
    print("Processing domain lists...")
    
    # Process Tranco list
    print("Loading Tranco top 2000...")
    domains = process_tranco_list()
    print(f"Loaded {len(domains)} domains from Tranco")
    
    # TODO: Add other public sources here
    # For now, we'll use Tranco as the primary source
    
    # Merge and rank
    print("Merging and ranking domains...")
    final_domains = merge_domain_lists(domains)
    
    # Save results
    save_results(final_domains)
    
    # Print statistics
    categorized = sum(1 for d in final_domains if d['categories'])
    print(f"\nStatistics:")
    print(f"Total domains: {len(final_domains)}")
    print(f"Categorized: {categorized}")
    print(f"Uncategorized: {len(final_domains) - categorized}")
    
    # Print top 20 for verification
    print("\nTop 20 domains:")
    for i, domain in enumerate(final_domains[:20]):
        cats = ', '.join(domain['categories']) if domain['categories'] else 'uncategorized'
        print(f"{i+1}. {domain['domain']} - {cats}")


if __name__ == '__main__':
    main()