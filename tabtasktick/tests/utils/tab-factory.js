// Tab Factory - Generates test tab data for unit tests

let tabIdCounter = 1;
let windowIdCounter = 1;
let groupIdCounter = 1;

export function resetCounters() {
  tabIdCounter = 1;
  windowIdCounter = 1;
  groupIdCounter = 1;
}

export function createTab(overrides = {}) {
  const defaults = {
    id: tabIdCounter++,
    windowId: 1,
    groupId: -1,
    index: 0,
    url: 'https://example.com',
    title: 'Example Page',
    favIconUrl: 'https://example.com/favicon.ico',
    active: false,
    pinned: false,
    audible: false,
    mutedInfo: { muted: false },
    incognito: false,
    selected: false,
    discarded: false,
    autoDiscardable: true,
    status: 'complete'
  };
  
  return { ...defaults, ...overrides };
}

export function createWindow(overrides = {}) {
  const defaults = {
    id: windowIdCounter++,
    focused: false,
    incognito: false,
    type: 'normal',
    state: 'normal',
    alwaysOnTop: false,
    left: 0,
    top: 0,
    width: 1200,
    height: 800
  };
  
  return { ...defaults, ...overrides };
}

export function createTabGroup(overrides = {}) {
  const defaults = {
    id: groupIdCounter++,
    windowId: 1,
    title: 'Test Group',
    color: 'blue',
    collapsed: false
  };
  
  return { ...defaults, ...overrides };
}

// Generate a set of tabs for common test scenarios
export function generateTestScenarios() {
  resetCounters();
  
  return {
    // Duplicate tabs scenario
    duplicates: [
      createTab({ url: 'https://github.com/repo', title: 'GitHub Repo' }),
      createTab({ url: 'https://github.com/repo', title: 'GitHub Repo' }),
      createTab({ url: 'https://github.com/repo?tab=issues', title: 'GitHub Repo' }), // Should be duplicate after normalization
      createTab({ url: 'https://stackoverflow.com/questions/123', title: 'Stack Overflow' }),
      createTab({ url: 'https://stackoverflow.com/questions/123#answer-456', title: 'Stack Overflow' }) // Should be duplicate
    ],
    
    // Domain grouping scenario
    domainGroups: [
      createTab({ url: 'https://docs.google.com/doc1', title: 'Google Doc 1' }),
      createTab({ url: 'https://docs.google.com/doc2', title: 'Google Doc 2' }),
      createTab({ url: 'https://drive.google.com/file1', title: 'Google Drive' }),
      createTab({ url: 'https://mail.google.com', title: 'Gmail' }),
      createTab({ url: 'https://github.com/repo1', title: 'Repo 1' }),
      createTab({ url: 'https://github.com/repo2', title: 'Repo 2' })
    ],
    
    // Category-based scenario
    categorized: [
      createTab({ url: 'https://reddit.com/r/programming', title: 'Reddit' }),
      createTab({ url: 'https://twitter.com/home', title: 'Twitter' }),
      createTab({ url: 'https://facebook.com', title: 'Facebook' }),
      createTab({ url: 'https://news.ycombinator.com', title: 'Hacker News' }),
      createTab({ url: 'https://cnn.com/article', title: 'CNN Article' }),
      createTab({ url: 'https://bbc.com/news', title: 'BBC News' })
    ],
    
    // Window and group scenario
    multiWindow: {
      window1: createWindow({ id: 1, focused: true }),
      window2: createWindow({ id: 2 }),
      window3: createWindow({ id: 3 }),
      group1: createTabGroup({ id: 1, windowId: 1, title: 'Work' }),
      group2: createTabGroup({ id: 2, windowId: 2, title: 'Research' }),
      tabs: [
        // Window 1 - some grouped, some not
        createTab({ windowId: 1, groupId: 1, url: 'https://jira.company.com' }),
        createTab({ windowId: 1, groupId: 1, url: 'https://github.company.com' }),
        createTab({ windowId: 1, groupId: -1, url: 'https://google.com' }),
        // Window 2 - research group
        createTab({ windowId: 2, groupId: 2, url: 'https://arxiv.org/paper1' }),
        createTab({ windowId: 2, groupId: 2, url: 'https://arxiv.org/paper2' }),
        // Window 3 - solo tab (for testing solo window conditions)
        createTab({ windowId: 3, url: 'https://old-tab.com' })
      ]
    },
    
    // Time-based scenario (with age tracking)
    aged: [
      createTab({ url: 'https://very-old.com', title: 'Very Old Tab' }),
      createTab({ url: 'https://old.com', title: 'Old Tab' }),
      createTab({ url: 'https://recent.com', title: 'Recent Tab' }),
      createTab({ url: 'https://new.com', title: 'New Tab', active: true })
    ],
    
    // Pinned and special tabs
    special: [
      createTab({ pinned: true, url: 'https://mail.google.com' }),
      createTab({ audible: true, url: 'https://youtube.com/watch?v=123' }),
      createTab({ url: 'chrome://extensions/', title: 'Extensions' }),
      createTab({ url: 'chrome-extension://abc/page.html', title: 'Extension Page' })
    ]
  };
}

// Generate large dataset for performance testing
export function generateLargeDataset(tabCount = 200) {
  resetCounters();
  const tabs = [];
  const domains = ['google.com', 'github.com', 'stackoverflow.com', 'reddit.com', 'news.ycombinator.com'];
  const categories = ['social', 'dev', 'news', 'docs', 'shopping'];
  
  for (let i = 0; i < tabCount; i++) {
    const domain = domains[i % domains.length];
    const windowId = Math.floor(i / 20) + 1; // ~20 tabs per window
    const groupId = i % 10 === 0 ? -1 : Math.floor(i / 10) + 1; // Some ungrouped
    
    tabs.push(createTab({
      id: i + 1,
      windowId,
      groupId,
      url: `https://${domain}/page-${i}`,
      title: `Page ${i} - ${domain}`,
      pinned: i % 50 === 0, // ~2% pinned
      audible: i % 30 === 0 // ~3% playing audio
    }));
  }
  
  return tabs;
}

// Helper to add time tracking data to tabs
export function addTimeTracking(tabs, baseTime = Date.now()) {
  const timeData = new Map();
  
  tabs.forEach((tab, index) => {
    const age = index * 10 * 60 * 1000; // Each tab 10 minutes older
    const lastActive = tab.active ? baseTime : baseTime - (5 * 60 * 1000); // Active now, others 5 min ago
    
    timeData.set(tab.id, {
      created: baseTime - age,
      lastActive,
      lastAccessed: lastActive
    });
  });
  
  return timeData;
}

// Helper to generate tab origin data (for Gmail spawn tracking, etc.)
export function addOriginData(tabs) {
  const origins = new Map();
  
  tabs.forEach((tab, index) => {
    if (tab.url.includes('github.com') && index > 0) {
      origins.set(tab.id, 'search'); // Opened from search
    } else if (tab.url.includes('stackoverflow.com')) {
      origins.set(tab.id, 'gmail'); // Opened from Gmail
    }
    // Others have no origin (direct navigation)
  });
  
  return origins;
}