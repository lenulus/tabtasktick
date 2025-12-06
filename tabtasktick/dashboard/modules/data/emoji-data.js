/**
 * Emoji Data - Organized by category
 *
 * Centralized emoji definitions for collection icons.
 * Extracted from view layer to follow architectural principles.
 *
 * Architecture Compliance:
 * - Separation of Concerns: Data separate from presentation
 * - Reusability: Can be used across multiple views
 * - Maintainability: Single source of truth for emoji sets
 */

export const EMOJI_CATEGORIES = {
  folders: {
    name: 'Folders & Files',
    emojis: ['📁', '📂', '🗂️', '📋', '📄', '📃', '📑', '🗃️', '🗄️', '📦', '📇', '🗳️', '📰', '📚', '📖']
  },
  work: {
    name: 'Work & Productivity',
    emojis: ['💼', '🏢', '📊', '📈', '📉', '💰', '💵', '💳', '🏦', '📞', '📱', '💻', '⌨️', '🖥️', '🖨️', '📠', '✉️', '📧', '📮', '📬', '📭', '📪', '🗒️', '📝', '✏️', '✒️', '🖊️', '🖋️', '📌', '📍', '🔖', '🏷️']
  },
  dev: {
    name: 'Development & Tech',
    emojis: ['💻', '🖥️', '⌨️', '🖱️', '🖲️', '💾', '💿', '📀', '🔌', '🔋', '🔧', '🔨', '⚙️', '🛠️', '⚡', '🔥', '💡', '🔍', '🔎', '🧪', '🧬', '🚀', '🛸', '🤖', '👾', '🎮', '🕹️']
  },
  misc: {
    name: 'Miscellaneous',
    emojis: ['🎯', '📌', '⭐', '✨', '🌟', '💫', '🔔', '🔕', '🎨', '🎭', '🎪', '🎬', '🎤', '🎧', '🎵', '🎶', '📻', '📺', '📷', '📸', '🔐', '🔒', '🔓', '🔑', '🗝️', '🏆', '🥇', '🥈', '🥉', '🎖️', '🏅', '🎗️', '🎀', '🎁', '🎉', '🎊', '🎈', '❤️', '💙', '💚', '💛', '🧡', '💜', '🖤', '🤍', '🤎', '💖', '💝']
  }
};

/**
 * Get all emojis from all categories as a flat array
 * @returns {string[]} Array of all emojis
 */
export function getAllEmojis() {
  return Object.values(EMOJI_CATEGORIES).flatMap(category => category.emojis);
}

/**
 * Get emojis for a specific category
 * @param {string} categoryKey - Category key (folders, work, dev, misc)
 * @returns {string[]} Array of emojis in the category
 */
export function getEmojisByCategory(categoryKey) {
  return EMOJI_CATEGORIES[categoryKey]?.emojis || [];
}

/**
 * Get category name
 * @param {string} categoryKey - Category key
 * @returns {string} Category display name
 */
export function getCategoryName(categoryKey) {
  return EMOJI_CATEGORIES[categoryKey]?.name || '';
}

/**
 * Get all category keys
 * @returns {string[]} Array of category keys
 */
export function getCategoryKeys() {
  return Object.keys(EMOJI_CATEGORIES);
}
