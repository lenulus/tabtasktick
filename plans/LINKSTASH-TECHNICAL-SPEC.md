# LinkStash Technical Specification

## Data Models

### Core Bookmark Model
```typescript
interface Bookmark {
  // Identity
  id: string;                    // UUID v4
  url: string;                   // Full URL
  domain: string;                // Extracted domain

  // Content
  title: string;                 // User-editable title
  originalTitle: string;         // Page title at capture time
  description?: string;          // Meta description or user note
  notes?: string;                // Markdown notes
  highlights?: string[];         // Captured text selections

  // Visual
  favicon?: string;              // Data URI or URL
  screenshot?: string;           // Thumbnail data URI
  color?: string;                // Dominant color for UI

  // Organization
  tags: string[];                // User tags
  collections: string[];         // Collection IDs
  category?: string;             // Auto-detected category

  // Metadata
  createdAt: number;             // Unix timestamp
  updatedAt: number;             // Unix timestamp
  lastVisited?: number;          // Unix timestamp
  visitCount: number;            // Visit counter

  // Status
  status: 'active' | 'archived' | 'broken' | 'checking';
  lastHealthCheck?: number;      // Unix timestamp
  healthCheckError?: string;     // Error message if broken

  // Relations
  relatedBookmarks?: string[];   // Related bookmark IDs
  parentBookmark?: string;       // For bookmark threads

  // Custom
  customFields?: Record<string, any>;
  metadata?: PageMetadata;       // Extended metadata
}

interface PageMetadata {
  author?: string;
  publishedDate?: string;
  modifiedDate?: string;
  readingTime?: number;          // Estimated minutes
  wordCount?: number;
  language?: string;
  ogImage?: string;               // Open Graph image
  ogDescription?: string;
  keywords?: string[];
  contentType?: string;           // article, video, product, etc.
}
```

### Collection Model
```typescript
interface Collection {
  id: string;
  name: string;
  description?: string;
  icon?: string;                  // Emoji or icon class
  color?: string;                 // UI color

  type: 'manual' | 'smart' | 'project';

  // For smart collections
  rules?: CollectionRule[];       // Like TabMaster rules

  // For projects
  projectData?: {
    status: 'active' | 'completed' | 'archived';
    dueDate?: string;
    collaborators?: string[];
    notes?: string;
  };

  // Metadata
  createdAt: number;
  updatedAt: number;
  bookmarkCount: number;          // Cached count
  lastAccessed?: number;

  // Display
  sortOrder?: number;
  isPinned: boolean;
  isExpanded: boolean;            // UI state
}

interface CollectionRule {
  when: RuleCondition;            // Reuse from TabMaster
  priority?: number;
}
```

### Tag Model
```typescript
interface Tag {
  name: string;                   // Primary key
  count: number;                  // Usage count
  color?: string;                 // Optional color
  aliases?: string[];             // Alternative names
  parentTag?: string;             // For tag hierarchies
  createdAt: number;
  lastUsed: number;

  // Auto-tag rules
  autoApplyRules?: {
    domains?: string[];
    urlPatterns?: string[];
    keywords?: string[];
  };
}
```

## API Design

### Side Panel API
```javascript
// manifest.json addition
{
  "side_panel": {
    "default_path": "side-panel/panel.html"
  }
}

// Opening the side panel
chrome.sidePanel.setOptions({
  path: 'panel.html',
  enabled: true
});

// Set panel behavior
chrome.sidePanel.setPanelBehavior({
  openPanelOnActionClick: true
});
```

### Service Worker API
```javascript
// Background service worker
class BookmarkService {
  async init() {
    await this.db.open();
    await this.setupListeners();
    await this.scheduleHealthChecks();
  }

  // CRUD Operations
  async create(bookmarkData) {
    const bookmark = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      visitCount: 0,
      status: 'active',
      tags: [],
      collections: [],
      ...bookmarkData,

      // Auto-enrich
      domain: new URL(bookmarkData.url).hostname,
      category: await this.categorize(bookmarkData.url)
    };

    // Extract metadata in background
    this.enrichBookmark(bookmark.id);

    return await this.db.bookmarks.add(bookmark);
  }

  async enrichBookmark(bookmarkId) {
    // Fetch page and extract metadata
    const response = await fetch(bookmark.url);
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'text/html');

    const metadata = {
      originalTitle: doc.title,
      description: doc.querySelector('meta[name="description"]')?.content,
      ogImage: doc.querySelector('meta[property="og:image"]')?.content,
      author: doc.querySelector('meta[name="author"]')?.content,
      keywords: doc.querySelector('meta[name="keywords"]')?.content?.split(','),
      // ... extract more metadata
    };

    await this.update(bookmarkId, { metadata });
  }

  // Search with advanced filters
  async search(query, filters = {}) {
    const {
      tags = [],
      collections = [],
      category = null,
      dateRange = null,
      status = 'active',
      sortBy = 'relevance'
    } = filters;

    // Use IndexedDB compound indices for performance
    let results = await this.db.bookmarks
      .where('status').equals(status)
      .filter(bookmark => {
        // Full-text search
        if (query && !this.matchesQuery(bookmark, query)) {
          return false;
        }

        // Tag filter
        if (tags.length && !tags.some(tag => bookmark.tags.includes(tag))) {
          return false;
        }

        // Date range filter
        if (dateRange && !this.inDateRange(bookmark, dateRange)) {
          return false;
        }

        return true;
      })
      .toArray();

    // Sort results
    return this.sortResults(results, sortBy, query);
  }

  // Smart categorization
  async categorize(url) {
    // First try domain-based categorization
    const domain = new URL(url).hostname;
    const category = getCategoryForDomain(domain);

    if (category !== 'unknown') {
      return category;
    }

    // Fall back to content-based categorization
    // This could use ML in the future
    return await this.contentBasedCategorization(url);
  }

  // Health checking
  async checkHealth(bookmarkId) {
    const bookmark = await this.get(bookmarkId);

    try {
      const response = await fetch(bookmark.url, {
        method: 'HEAD',
        timeout: 5000
      });

      if (response.ok) {
        await this.update(bookmarkId, {
          status: 'active',
          lastHealthCheck: Date.now()
        });
      } else if (response.status === 404) {
        await this.handleBrokenLink(bookmark);
      }
    } catch (error) {
      await this.update(bookmarkId, {
        status: 'broken',
        lastHealthCheck: Date.now(),
        healthCheckError: error.message
      });
    }
  }

  async handleBrokenLink(bookmark) {
    // Try Wayback Machine
    const waybackUrl = `https://web.archive.org/web/*/${bookmark.url}`;
    const response = await fetch(`https://archive.org/wayback/available?url=${bookmark.url}`);
    const data = await response.json();

    if (data.archived_snapshots?.closest?.available) {
      await this.update(bookmark.id, {
        status: 'archived',
        waybackUrl: data.archived_snapshots.closest.url,
        lastHealthCheck: Date.now()
      });
    } else {
      await this.update(bookmark.id, {
        status: 'broken',
        lastHealthCheck: Date.now()
      });
    }
  }
}
```

### Content Script API
```javascript
// Content script for extraction
class ContentExtractor {
  extract() {
    return {
      url: window.location.href,
      title: document.title,
      description: this.getMetaContent('description'),

      // Get selected text if any
      selectedText: window.getSelection().toString(),

      // Get main content
      content: this.extractMainContent(),

      // Get images
      images: this.extractImages(),

      // Reading time estimate
      readingTime: this.estimateReadingTime(),

      // Structured data
      structuredData: this.extractStructuredData()
    };
  }

  extractMainContent() {
    // Use Readability.js or similar
    const article = new Readability(document.cloneNode(true)).parse();
    return {
      content: article.content,
      excerpt: article.excerpt,
      wordCount: article.content.split(' ').length
    };
  }

  extractImages() {
    const images = [];

    // Open Graph image
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage) {
      images.push({
        url: ogImage.content,
        type: 'og'
      });
    }

    // First few content images
    document.querySelectorAll('article img, main img').forEach((img, i) => {
      if (i < 3 && img.src) {
        images.push({
          url: img.src,
          alt: img.alt,
          type: 'content'
        });
      }
    });

    return images;
  }

  extractStructuredData() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    const data = [];

    scripts.forEach(script => {
      try {
        data.push(JSON.parse(script.textContent));
      } catch (e) {
        // Invalid JSON
      }
    });

    return data;
  }

  estimateReadingTime() {
    const content = document.querySelector('article, main, .content');
    if (!content) return null;

    const text = content.textContent;
    const wordCount = text.split(/\s+/).length;
    const readingSpeed = 200; // words per minute

    return Math.ceil(wordCount / readingSpeed);
  }
}
```

## Smart Collections Engine

### Rule-Based Collections
```javascript
// Reuse TabMaster's predicate system
const smartCollections = [
  {
    name: "📚 Read Later",
    rules: {
      all: [
        { includes: ["tags", "read-later"] },
        { eq: ["status", "active"] }
      ]
    }
  },
  {
    name: "📰 Recent News",
    rules: {
      all: [
        { eq: ["category", "news"] },
        { lt: ["daysSinceCreated", 7] }
      ]
    }
  },
  {
    name: "🔧 Dev Resources",
    rules: {
      any: [
        { eq: ["category", "dev"] },
        { includes: ["tags", "programming"] },
        { includes: ["domain", "github.com"] }
      ]
    }
  },
  {
    name: "⏰ Expiring Soon",
    rules: {
      all: [
        { exists: ["customFields.deadline"] },
        { lt: ["customFields.daysUntilDeadline", 7] }
      ]
    }
  },
  {
    name: "🌟 Frequently Used",
    rules: {
      all: [
        { gt: ["visitCount", 10] },
        { lt: ["daysSinceVisit", 30] }
      ]
    }
  }
];
```

## Search Implementation

### Full-Text Search Index
```javascript
class SearchIndex {
  constructor() {
    this.index = new FlexSearch.Document({
      tokenize: "forward",
      cache: true,
      document: {
        id: "id",
        index: ["title", "description", "notes", "tags"],
        store: ["url", "title", "favicon"]
      }
    });
  }

  async rebuild() {
    const bookmarks = await db.bookmarks.toArray();

    bookmarks.forEach(bookmark => {
      this.index.add({
        id: bookmark.id,
        title: bookmark.title,
        description: bookmark.description,
        notes: bookmark.notes,
        tags: bookmark.tags.join(' '),
        url: bookmark.url,
        favicon: bookmark.favicon
      });
    });
  }

  search(query, limit = 50) {
    return this.index.search(query, {
      limit,
      enrich: true,
      suggest: true
    });
  }
}
```

### Smart Suggestions
```javascript
class SmartSuggestions {
  async getSuggestions(bookmark) {
    const suggestions = {
      tags: await this.suggestTags(bookmark),
      related: await this.findRelated(bookmark),
      collections: await this.suggestCollections(bookmark),
      duplicates: await this.findDuplicates(bookmark)
    };

    return suggestions;
  }

  async suggestTags(bookmark) {
    const suggestions = new Set();

    // Based on domain
    const domainTags = await this.getTagsForDomain(bookmark.domain);
    domainTags.forEach(tag => suggestions.add(tag));

    // Based on category
    if (bookmark.category) {
      suggestions.add(bookmark.category);
    }

    // Based on content keywords
    if (bookmark.metadata?.keywords) {
      bookmark.metadata.keywords
        .slice(0, 3)
        .forEach(keyword => suggestions.add(keyword.toLowerCase()));
    }

    // Based on similar bookmarks
    const similar = await this.findSimilar(bookmark);
    similar.forEach(sim => {
      sim.tags.forEach(tag => suggestions.add(tag));
    });

    // Remove already applied tags
    bookmark.tags.forEach(tag => suggestions.delete(tag));

    return Array.from(suggestions).slice(0, 5);
  }

  async findRelated(bookmark) {
    // Find bookmarks with:
    // 1. Same domain
    // 2. Overlapping tags
    // 3. Similar titles
    // 4. Linked from/to this page

    const related = await db.bookmarks
      .where('domain').equals(bookmark.domain)
      .or('tags').anyOf(bookmark.tags)
      .limit(10)
      .toArray();

    // Score by relevance
    return related
      .map(rel => ({
        ...rel,
        score: this.calculateRelevance(bookmark, rel)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }
}
```

## Performance Optimizations

### Virtual Scrolling
```javascript
class VirtualBookmarkList {
  constructor(container, itemHeight = 80) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2;
    this.items = [];
    this.scrollTop = 0;
  }

  render(bookmarks) {
    this.items = bookmarks;
    const totalHeight = bookmarks.length * this.itemHeight;

    // Create scrollable container
    this.container.innerHTML = `
      <div style="height: ${totalHeight}px; position: relative;">
        <div class="visible-items" style="transform: translateY(${this.scrollTop}px);">
          ${this.renderVisibleItems()}
        </div>
      </div>
    `;
  }

  renderVisibleItems() {
    const start = Math.floor(this.scrollTop / this.itemHeight);
    const end = start + this.visibleItems;

    return this.items
      .slice(start, end)
      .map((bookmark, i) => this.renderBookmark(bookmark, start + i))
      .join('');
  }

  renderBookmark(bookmark, index) {
    return `
      <div class="bookmark-item" style="position: absolute; top: ${index * this.itemHeight}px;">
        <!-- Bookmark content -->
      </div>
    `;
  }
}
```

### Lazy Loading Images
```javascript
class LazyImageLoader {
  constructor() {
    this.observer = new IntersectionObserver(
      entries => this.handleIntersection(entries),
      { rootMargin: '50px' }
    );
  }

  observe(element) {
    if (element.dataset.src) {
      this.observer.observe(element);
    }
  }

  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;

        // Load image
        img.src = img.dataset.src;
        img.onload = () => img.classList.add('loaded');

        // Stop observing
        this.observer.unobserve(img);
      }
    });
  }
}
```

## Chrome Extension Integration Points

### Context Menu Integration
```javascript
chrome.contextMenus.create({
  id: 'save-to-linkstash',
  title: 'Save to LinkStash',
  contexts: ['page', 'link', 'selection']
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const bookmarkData = {
    url: info.linkUrl || info.pageUrl,
    title: tab.title,
    selectedText: info.selectionText
  };

  // Open side panel with pre-filled data
  chrome.sidePanel.open({ windowId: tab.windowId });
  chrome.runtime.sendMessage({
    action: 'quickAdd',
    data: bookmarkData
  });
});
```

### Omnibox Integration
```javascript
chrome.omnibox.onInputEntered.addListener((text) => {
  if (text.startsWith('tag:')) {
    // Search by tag
    const tag = text.slice(4);
    searchBookmarksByTag(tag);
  } else if (text.startsWith('note:')) {
    // Create quick note
    const note = text.slice(5);
    createNoteBookmark(note);
  } else {
    // General search
    searchBookmarks(text);
  }
});
```

### Tab Integration with TabMaster Pro
```javascript
// Save tab group as collection
async function saveTabGroup(groupId) {
  const tabs = await chrome.tabs.query({ groupId });
  const group = await chrome.tabGroups.get(groupId);

  const collection = {
    name: group.title || `Collection ${Date.now()}`,
    type: 'manual',
    color: group.color
  };

  const collectionId = await createCollection(collection);

  // Add bookmarks for each tab
  for (const tab of tabs) {
    await createBookmark({
      url: tab.url,
      title: tab.title,
      favicon: tab.favIconUrl,
      collections: [collectionId],
      tags: ['imported-from-tabs']
    });
  }
}
```

This technical specification provides the detailed implementation blueprint for LinkStash, leveraging modern web APIs, proven architectural patterns, and the lessons learned from TabMaster Pro.