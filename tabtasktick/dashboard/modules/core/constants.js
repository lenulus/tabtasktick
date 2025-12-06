/**
 * Shared constants for TabMaster Pro
 */

// View types
export const VIEWS = {
  OVERVIEW: 'overview',
  TABS: 'tabs',
  GROUPS: 'groups',
  SNOOZED: 'snoozed',
  HISTORY: 'history',
  RULES: 'rules'
};

// Tab states
export const TAB_STATES = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PINNED: 'pinned',
  AUDIBLE: 'audible',
  MUTED: 'muted',
  GROUPED: 'grouped'
};

// Activity types
export const ACTIVITY_TYPES = {
  CLOSE: 'close',
  GROUP: 'group',
  SNOOZE: 'snooze',
  RULE: 'rule',
  OPEN: 'open',
  SUSPEND: 'suspend'
};

// Sort types
export const SORT_TYPES = {
  DEFAULT: 'default',
  ALPHABETICAL: 'alphabetical',
  DOMAIN: 'domain',
  RECENT: 'recent',
  OLDEST: 'oldest'
};

// Filter types
export const FILTER_TYPES = {
  ALL: 'all',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PINNED: 'pinned',
  AUDIBLE: 'audible',
  MUTED: 'muted',
  GROUPED: 'grouped',
  UNGROUPED: 'ungrouped'
};

// Storage keys
export const STORAGE_KEYS = {
  TABS_DATA: 'tabsData',
  SNOOZED_TABS: 'snoozedTabs',
  ACTIVITY_LOG: 'activityLog',
  SETTINGS: 'settings',
  RULES: 'rules',
  STATISTICS: 'statistics',
  WINDOW_NAMES: 'windowNames',
  WINDOW_SIGNATURES: 'windowSignatures',
  LAST_VIEW_STATE: 'lastViewState'
};

// Chrome group colors
export const CHROME_COLORS = {
  GREY: 'grey',
  BLUE: 'blue',
  RED: 'red',
  YELLOW: 'yellow',
  GREEN: 'green',
  PINK: 'pink',
  PURPLE: 'purple',
  CYAN: 'cyan',
  ORANGE: 'orange'
};

// Chart colors
export const CHART_COLORS = {
  PRIMARY: 'rgba(102, 126, 234, 0.8)',
  SECONDARY: 'rgba(245, 87, 108, 0.8)',
  TERTIARY: 'rgba(240, 147, 251, 0.8)',
  QUATERNARY: 'rgba(79, 172, 254, 0.8)',
  QUINARY: 'rgba(250, 112, 154, 0.8)'
};

// Time intervals
export const TIME_INTERVALS = {
  JUST_NOW: 60000, // 1 minute
  RECENT: 3600000, // 1 hour
  TODAY: 86400000, // 24 hours
  THIS_WEEK: 604800000 // 7 days
};

// Limits
export const LIMITS = {
  MAX_RECENT_ACTIVITIES: 10,
  MAX_HISTORY_ITEMS: 1000,
  MAX_TAB_TITLE_LENGTH: 60,
  MAX_BULK_SELECTION: 500,
  DEBOUNCE_DELAY: 300,
  CHART_UPDATE_DELAY: 1000
};

// Default settings
export const DEFAULT_SETTINGS = {
  theme: 'light',
  autoCloseEnabled: false,
  showNotifications: true,
  defaultSnoozeMinutes: 60,
  maxHistoryDays: 30,
  enableKeyboardShortcuts: true
};