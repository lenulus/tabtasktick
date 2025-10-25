/**
 * Compact Emoji Picker Component
 *
 * Space-efficient emoji picker for sidepanel forms.
 * Popover-style UI that fits in 1-2 line equivalents.
 *
 * Architecture: Reuses EMOJI_CATEGORIES from dashboard data module
 */

// Import emoji data from dashboard (reuse, don't duplicate)
import { EMOJI_CATEGORIES } from '../../dashboard/modules/data/emoji-data.js';

export class EmojiPicker {
  constructor(options = {}) {
    this.inputId = options.inputId || 'emoji-input';
    this.initialEmoji = options.initialEmoji || '📁';
    this.onChange = options.onChange || (() => {});
    this.container = null;
    this.currentEmoji = this.initialEmoji;
    this.isOpen = false;
  }

  /**
   * Create the compact emoji picker UI
   * Returns HTML element to insert into form
   */
  create() {
    const wrapper = document.createElement('div');
    wrapper.className = 'emoji-picker-compact';

    wrapper.innerHTML = `
      <input type="hidden" id="${this.inputId}" value="${this.currentEmoji}">

      <div class="emoji-picker-trigger">
        <button type="button" class="emoji-current-btn" data-emoji-trigger>
          <span class="emoji-display">${this.currentEmoji}</span>
          <span class="emoji-arrow">▼</span>
        </button>
      </div>

      <div class="emoji-picker-popover" data-emoji-popover hidden>
        <div class="emoji-categories">
          ${this.renderCategoryTabs()}
        </div>
        <div class="emoji-grid-container">
          <div class="emoji-grid" data-emoji-grid>
            ${this.renderEmojiGrid('folders')}
          </div>
        </div>
      </div>
    `;

    this.container = wrapper;
    this.attachEventListeners();
    return wrapper;
  }

  /**
   * Render category tabs (compact, 1 line)
   */
  renderCategoryTabs() {
    const categories = Object.keys(EMOJI_CATEGORIES);
    return categories.map((key, index) => {
      const category = EMOJI_CATEGORIES[key];
      const emoji = category.emojis[0]; // Use first emoji as icon
      const isActive = index === 0 ? 'active' : '';
      return `
        <button
          type="button"
          class="emoji-category-tab ${isActive}"
          data-category="${key}"
          title="${category.name}"
        >${emoji}</button>
      `;
    }).join('');
  }

  /**
   * Render emoji grid for a category
   */
  renderEmojiGrid(categoryKey) {
    const emojis = EMOJI_CATEGORIES[categoryKey].emojis;
    return emojis.map(emoji => `
      <button
        type="button"
        class="emoji-option"
        data-emoji="${emoji}"
      >${emoji}</button>
    `).join('');
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    // Toggle popover
    const trigger = this.container.querySelector('[data-emoji-trigger]');
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.togglePopover();
    });

    // Category switching
    const categoryTabs = this.container.querySelectorAll('.emoji-category-tab');
    categoryTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.switchCategory(tab.dataset.category, tab);
      });
    });

    // Emoji selection
    this.attachEmojiListeners();

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target) && this.isOpen) {
        this.closePopover();
      }
    });
  }

  /**
   * Attach listeners to emoji buttons
   */
  attachEmojiListeners() {
    const emojiButtons = this.container.querySelectorAll('.emoji-option');
    emojiButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectEmoji(btn.dataset.emoji);
      });
    });
  }

  /**
   * Toggle popover visibility
   */
  togglePopover() {
    const popover = this.container.querySelector('[data-emoji-popover]');
    if (this.isOpen) {
      this.closePopover();
    } else {
      this.openPopover();
    }
  }

  /**
   * Open popover
   */
  openPopover() {
    const popover = this.container.querySelector('[data-emoji-popover]');
    popover.hidden = false;
    this.isOpen = true;

    // Update arrow
    const arrow = this.container.querySelector('.emoji-arrow');
    arrow.textContent = '▲';
  }

  /**
   * Close popover
   */
  closePopover() {
    const popover = this.container.querySelector('[data-emoji-popover]');
    popover.hidden = true;
    this.isOpen = false;

    // Update arrow
    const arrow = this.container.querySelector('.emoji-arrow');
    arrow.textContent = '▼';
  }

  /**
   * Switch category
   */
  switchCategory(categoryKey, clickedTab) {
    // Update active tab
    const tabs = this.container.querySelectorAll('.emoji-category-tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    clickedTab.classList.add('active');

    // Update grid
    const grid = this.container.querySelector('[data-emoji-grid]');
    grid.innerHTML = this.renderEmojiGrid(categoryKey);

    // Re-attach listeners
    this.attachEmojiListeners();
  }

  /**
   * Select an emoji
   */
  selectEmoji(emoji) {
    this.currentEmoji = emoji;

    // Update display
    const display = this.container.querySelector('.emoji-display');
    display.textContent = emoji;

    // Update hidden input
    const input = this.container.querySelector(`#${this.inputId}`);
    input.value = emoji;

    // Call onChange callback
    this.onChange(emoji);

    // Close popover
    this.closePopover();
  }

  /**
   * Set emoji programmatically
   */
  setEmoji(emoji) {
    this.selectEmoji(emoji);
  }

  /**
   * Get current emoji
   */
  getEmoji() {
    return this.currentEmoji;
  }

  /**
   * Destroy picker (cleanup)
   */
  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}
