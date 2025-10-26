/**
 * Emoji Suggestions Utility
 * Phase 4.2.7: Smart emoji suggestion based on collection names
 *
 * Pure utility - no side effects, deterministic
 */

// Keyword-to-emoji mappings (60+ categories)
const EMOJI_MAPPINGS = {
  // Work & Productivity
  work: '💼',
  job: '💼',
  office: '💼',
  business: '💼',
  career: '💼',
  professional: '💼',

  // Development & Code
  code: '💻',
  dev: '💻',
  development: '💻',
  programming: '💻',
  github: '💻',
  git: '💻',
  software: '💻',
  engineer: '💻',
  coding: '💻',

  // Bugs & Issues
  bug: '🐛',
  fix: '🐛',
  issue: '🐛',
  error: '🐛',
  debug: '🐛',

  // Documentation
  docs: '📚',
  documentation: '📚',
  wiki: '📚',
  manual: '📚',
  guide: '📚',
  tutorial: '📚',

  // Research & Learning
  research: '🔬',
  learn: '🔬',
  learning: '🔬',
  study: '🔬',
  reading: '🔬',
  article: '🔬',

  // Shopping
  shop: '🛒',
  shopping: '🛒',
  buy: '🛒',
  purchase: '🛒',
  amazon: '🛒',
  store: '🛒',

  // Finance & Money
  finance: '💰',
  money: '💰',
  banking: '💰',
  tax: '💰',
  budget: '💰',
  investment: '💰',
  stock: '💰',

  // Health & Fitness
  health: '🏥',
  medical: '🏥',
  doctor: '🏥',
  fitness: '🏥',
  workout: '🏥',
  exercise: '🏥',

  // Travel
  travel: '✈️',
  vacation: '✈️',
  trip: '✈️',
  flight: '✈️',
  hotel: '✈️',
  destination: '✈️',

  // Food & Cooking
  food: '🍔',
  recipe: '🍔',
  cooking: '🍔',
  restaurant: '🍔',
  meal: '🍔',
  dinner: '🍔',

  // Home & Living
  home: '🏠',
  house: '🏠',
  renovation: '🏠',
  furniture: '🏠',
  decor: '🏠',

  // Personal
  personal: '👤',
  life: '👤',
  family: '👤',
  private: '👤',

  // Creative & Design
  design: '🎨',
  art: '🎨',
  creative: '🎨',
  graphic: '🎨',
  illustration: '🎨',

  // Music
  music: '🎵',
  spotify: '🎵',
  playlist: '🎵',
  song: '🎵',
  audio: '🎵',

  // Video & Media
  video: '📹',
  youtube: '📹',
  watch: '📹',
  movie: '📹',
  film: '📹',

  // Social
  social: '💬',
  friends: '💬',
  chat: '💬',
  message: '💬',
  conversation: '💬',

  // Education
  school: '🎓',
  university: '🎓',
  course: '🎓',
  class: '🎓',
  education: '🎓',
  college: '🎓',

  // Project Management
  project: '📋',
  plan: '📋',
  organize: '📋',
  management: '📋',
  task: '📋',
  todo: '📋',

  // Ideas & Notes
  idea: '💡',
  brainstorm: '💡',
  notes: '💡',
  concept: '💡',
  thought: '💡',

  // Urgent & Priority
  urgent: '🚨',
  critical: '🚨',
  asap: '🚨',
  important: '🚨',
  priority: '🚨',

  // Archive & Storage
  archive: '📦',
  storage: '📦',
  backup: '📦',
  saved: '📦',

  // Communication
  email: '📧',
  mail: '📧',
  inbox: '📧',

  // Calendar & Events
  calendar: '📅',
  event: '📅',
  meeting: '📅',
  schedule: '📅',
  appointment: '📅',

  // News & Updates
  news: '📰',
  update: '📰',
  announcement: '📰',

  // Science & Technology
  science: '🔬',
  tech: '💻',
  technology: '💻',
  innovation: '💻',

  // Gaming
  game: '🎮',
  gaming: '🎮',
  play: '🎮',

  // Books & Reading
  book: '📖',
  read: '📖',
  reading: '📖',
  literature: '📖',

  // Photography
  photo: '📷',
  photography: '📷',
  camera: '📷',
  picture: '📷',

  // Writing
  write: '✍️',
  writing: '✍️',
  blog: '✍️',
  journal: '✍️',

  // Tools & Utilities
  tool: '🔧',
  utility: '🔧',
  settings: '⚙️',
  config: '⚙️',
  configuration: '⚙️',

  // Security
  security: '🔒',
  privacy: '🔒',
  password: '🔒',
  secure: '🔒',

  // Cloud & Storage
  cloud: '☁️',
  drive: '☁️',
  sync: '☁️',

  // Data & Analytics
  data: '📊',
  analytics: '📊',
  stats: '📊',
  statistics: '📊',
  chart: '📊',

  // Reference & Resources
  reference: '📚',
  resource: '📚',
  library: '📚',

  // Favorites & Starred
  favorite: '⭐',
  star: '⭐',
  starred: '⭐',
  bookmark: '🔖',

  // Temporary
  temp: '⏱️',
  temporary: '⏱️',
  draft: '⏱️'
};

// Fallback emojis for when no keyword matches
const FALLBACK_EMOJIS = [
  '📁', '📂', '📌', '🔖', '⭐', '🎯', '🗂️', '📑', '🏷️', '🗃️'
];

/**
 * Suggest an emoji based on collection name
 * @param {string} name - Collection name
 * @returns {string} Suggested emoji
 */
export function suggestEmoji(name) {
  if (!name || typeof name !== 'string') {
    return getRandomFallbackEmoji();
  }

  // Normalize name: lowercase, trim
  const normalizedName = name.toLowerCase().trim();

  // Split into words (handle spaces, hyphens, underscores)
  const words = normalizedName.split(/[\s\-_]+/);

  // Check first word first (prioritize)
  if (words.length > 0) {
    const firstWord = words[0];
    if (EMOJI_MAPPINGS[firstWord]) {
      return EMOJI_MAPPINGS[firstWord];
    }
  }

  // Check all words
  for (const word of words) {
    if (EMOJI_MAPPINGS[word]) {
      return EMOJI_MAPPINGS[word];
    }
  }

  // Check for partial matches (word contains keyword)
  for (const word of words) {
    for (const [keyword, emoji] of Object.entries(EMOJI_MAPPINGS)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        return emoji;
      }
    }
  }

  // No match found - return random fallback
  return getRandomFallbackEmoji();
}

/**
 * Get a random fallback emoji
 * @returns {string} Random emoji from fallback list
 */
function getRandomFallbackEmoji() {
  const index = Math.floor(Math.random() * FALLBACK_EMOJIS.length);
  return FALLBACK_EMOJIS[index];
}

/**
 * Get all available emoji keywords (for testing/documentation)
 * @returns {string[]} Array of keywords
 */
export function getAllKeywords() {
  return Object.keys(EMOJI_MAPPINGS).sort();
}

/**
 * Get emoji for a specific keyword (direct lookup)
 * @param {string} keyword - Keyword to look up
 * @returns {string|null} Emoji or null if not found
 */
export function getEmojiForKeyword(keyword) {
  if (!keyword || typeof keyword !== 'string') {
    return null;
  }
  return EMOJI_MAPPINGS[keyword.toLowerCase()] || null;
}
