/**
 * Note Modal - Add Note to Tab in Collection
 *
 * Simple dialog for adding/editing notes on tabs within collections.
 * Communicates with background script via chrome.runtime.sendMessage().
 */

class NoteModalController {
  constructor() {
    this.tabData = null;
    this.tabId = null;
  }

  async init() {
    // Parse tab data from URL parameters
    this.tabData = this.parseUrlParams();

    if (!this.tabData || !this.tabData.tabId) {
      alert('No tab specified');
      window.close();
      return;
    }

    this.tabId = this.tabData.tabId;

    // Show main container
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');

    // Setup event listeners
    this.setupEventListeners();

    // Load tab data
    await this.loadTab();
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const data = {};

    if (params.has('tabId')) {
      data.tabId = params.get('tabId');
    }

    if (params.has('url')) {
      data.url = decodeURIComponent(params.get('url'));
    }

    if (params.has('title')) {
      data.title = decodeURIComponent(params.get('title'));
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  setupEventListeners() {
    // Textarea character count
    const textarea = document.getElementById('note-textarea');
    const charCount = document.getElementById('char-count');

    textarea.addEventListener('input', () => {
      const length = textarea.value.length;
      charCount.textContent = `${length} / 255`;

      if (length > 250) {
        charCount.classList.add('warning');
      } else {
        charCount.classList.remove('warning');
      }
    });

    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    cancelBtn.addEventListener('click', () => {
      window.close();
    });

    // Save button
    const saveBtn = document.getElementById('save-btn');
    saveBtn.addEventListener('click', () => {
      this.handleSave();
    });

    // Ctrl+Enter to save
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this.handleSave();
      }
    });
  }

  async loadTab() {
    try {
      // Get tab from storage
      const response = await chrome.runtime.sendMessage({
        action: 'getTab',
        tabId: this.tabId
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Tab not found');
      }

      const tab = response.tab;

      // Check if tab exists in storage (must be in a collection)
      if (!tab) {
        throw new Error('This tab is not in a collection. Use "Add to Collection" first.');
      }

      // Display tab info
      document.getElementById('tab-title').textContent = tab.title || tab.url;
      document.getElementById('tab-url').textContent = tab.url;

      // Pre-fill existing note if any
      if (tab.note) {
        const textarea = document.getElementById('note-textarea');
        textarea.value = tab.note;

        // Update character count
        const charCount = document.getElementById('char-count');
        charCount.textContent = `${tab.note.length} / 255`;
      }

      // Focus textarea
      document.getElementById('note-textarea').focus();
    } catch (error) {
      console.error('Error loading tab:', error);
      alert(`Error: ${error.message}`);
      window.close();
    }
  }

  async handleSave() {
    const textarea = document.getElementById('note-textarea');
    const note = textarea.value.trim();

    const saveBtn = document.getElementById('save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'updateTab',
        tabId: this.tabId,
        updates: { note }
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to save note');
      }

      // Show success notification
      await chrome.runtime.sendMessage({
        action: 'showNotification',
        title: 'Note Saved',
        message: note ? 'Note added to tab' : 'Note removed from tab'
      });

      // Close window after brief delay
      setTimeout(() => {
        window.close();
      }, 300);
    } catch (error) {
      console.error('Error saving note:', error);
      alert(`Error: ${error.message}`);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Note';
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new NoteModalController();
  controller.init();
});
