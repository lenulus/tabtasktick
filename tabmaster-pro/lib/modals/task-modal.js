/**
 * Task Modal - Create/Edit Task Dialog
 *
 * Opened from context menus to create tasks with pre-filled tab references.
 * Communicates with background script via chrome.runtime.sendMessage().
 */

class TaskModalController {
  constructor() {
    this.collections = [];
    this.currentCollectionTabs = [];
    this.selectedTabIds = new Set();
    this.tags = new Set();
    this.prefillData = null;
  }

  async init() {
    // Parse URL parameters for pre-fill data
    this.prefillData = this.parseUrlParams();

    // Show form, hide loading
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('form-container').classList.remove('hidden');

    // Setup event listeners
    this.setupEventListeners();

    // Load data
    await this.loadCollections();

    // Pre-fill form if data provided
    if (this.prefillData) {
      this.prefillForm(this.prefillData);
    }
  }

  parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const data = {};

    if (params.has('summary')) {
      data.summary = decodeURIComponent(params.get('summary'));
    }

    if (params.has('tabId')) {
      data.tabId = params.get('tabId');
    }

    if (params.has('url')) {
      data.url = decodeURIComponent(params.get('url'));
    }

    if (params.has('title')) {
      data.title = decodeURIComponent(params.get('title'));
    }

    if (params.has('collectionId')) {
      data.collectionId = params.get('collectionId');
    }

    return Object.keys(data).length > 0 ? data : null;
  }

  setupEventListeners() {
    // Form submission
    const form = document.getElementById('task-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    cancelBtn.addEventListener('click', () => {
      window.close();
    });

    // Collection selection
    const collectionSelect = document.getElementById('collection');
    collectionSelect.addEventListener('change', (e) => {
      this.handleCollectionChange(e.target.value);
    });

    // Tag input
    const tagInput = document.getElementById('tag-input');
    const addTagBtn = document.getElementById('add-tag-btn');

    addTagBtn.addEventListener('click', () => {
      this.addTag(tagInput.value.trim());
      tagInput.value = '';
    });

    tagInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addTag(tagInput.value.trim());
        tagInput.value = '';
      }
    });
  }

  async loadCollections() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getCollections'
      });

      if (!response || !response.success) {
        console.error('Failed to load collections:', response?.error);
        return;
      }

      this.collections = response.collections || [];
      this.renderCollectionsDropdown();
    } catch (error) {
      console.error('Error loading collections:', error);
    }
  }

  renderCollectionsDropdown() {
    const select = document.getElementById('collection');

    // Clear existing options except the first one (Uncategorized)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Add collection options
    this.collections.forEach(collection => {
      const option = document.createElement('option');
      option.value = collection.id;
      option.textContent = collection.name;

      // Mark active collections
      if (collection.isActive) {
        option.textContent += ' (Active)';
      }

      select.appendChild(option);
    });
  }

  async handleCollectionChange(collectionId) {
    const tabRefsContainer = document.getElementById('tab-references');

    if (!collectionId) {
      // Uncategorized selected
      tabRefsContainer.innerHTML = '<div class="empty-state">Select a collection to see tabs</div>';
      this.currentCollectionTabs = [];
      this.selectedTabIds.clear();
      return;
    }

    // Load tabs for selected collection
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getCompleteCollection',
        collectionId
      });

      if (!response || !response.success) {
        console.error('Failed to load collection:', response?.error);
        tabRefsContainer.innerHTML = '<div class="empty-state">Error loading tabs</div>';
        return;
      }

      const collection = response.collection;
      this.currentCollectionTabs = [];

      // Extract tabs from folders
      if (collection.folders) {
        collection.folders.forEach(folder => {
          if (folder.tabs) {
            folder.tabs.forEach(tab => {
              this.currentCollectionTabs.push({
                ...tab,
                folderName: folder.name
              });
            });
          }
        });
      }

      this.renderTabReferences();
    } catch (error) {
      console.error('Error loading collection tabs:', error);
      tabRefsContainer.innerHTML = '<div class="empty-state">Error loading tabs</div>';
    }
  }

  renderTabReferences() {
    const container = document.getElementById('tab-references');

    if (this.currentCollectionTabs.length === 0) {
      container.innerHTML = '<div class="empty-state">No tabs in this collection</div>';
      return;
    }

    container.innerHTML = '';
    this.currentCollectionTabs.forEach(tab => {
      const item = document.createElement('div');
      item.className = 'tab-reference-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `tab-${tab.id}`;
      checkbox.checked = this.selectedTabIds.has(tab.id);
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedTabIds.add(tab.id);
        } else {
          this.selectedTabIds.delete(tab.id);
        }
      });

      const label = document.createElement('label');
      label.htmlFor = `tab-${tab.id}`;
      label.className = 'tab-reference-label';
      label.textContent = `${tab.folderName ? tab.folderName + ' › ' : ''}${tab.title || tab.url}`;

      item.appendChild(checkbox);
      item.appendChild(label);
      container.appendChild(item);
    });
  }

  prefillForm(data) {
    // Pre-fill summary
    if (data.summary) {
      document.getElementById('summary').value = data.summary;
    } else if (data.title) {
      // Use tab title as summary if no summary provided
      document.getElementById('summary').value = data.title;
    }

    // Pre-select collection if provided
    if (data.collectionId) {
      document.getElementById('collection').value = data.collectionId;
      this.handleCollectionChange(data.collectionId);
    }
  }

  addTag(tag) {
    if (!tag || this.tags.has(tag)) {
      return;
    }

    this.tags.add(tag);
    this.renderTags();
  }

  removeTag(tag) {
    this.tags.delete(tag);
    this.renderTags();
  }

  renderTags() {
    const container = document.getElementById('tags-display');
    container.innerHTML = '';

    this.tags.forEach(tag => {
      const tagEl = document.createElement('div');
      tagEl.className = 'tag';

      const tagText = document.createElement('span');
      tagText.textContent = tag;

      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '×';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => this.removeTag(tag));

      tagEl.appendChild(tagText);
      tagEl.appendChild(removeBtn);
      container.appendChild(tagEl);
    });
  }

  validateForm() {
    const summary = document.getElementById('summary').value.trim();
    const summaryError = document.getElementById('summary-error');

    if (!summary) {
      summaryError.classList.add('visible');
      return false;
    }

    summaryError.classList.remove('visible');
    return true;
  }

  async handleSubmit() {
    if (!this.validateForm()) {
      return;
    }

    const createBtn = document.getElementById('create-btn');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';

    try {
      const formData = {
        summary: document.getElementById('summary').value.trim(),
        notes: document.getElementById('notes').value.trim() || undefined,
        collectionId: document.getElementById('collection').value || undefined,
        priority: document.getElementById('priority').value,
        status: document.getElementById('status').value,
        dueDate: this.parseDueDate(),
        tags: Array.from(this.tags),
        tabIds: Array.from(this.selectedTabIds)
      };

      const response = await chrome.runtime.sendMessage({
        action: 'createTask',
        params: formData
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Failed to create task');
      }

      // Show success notification (via background script)
      await chrome.runtime.sendMessage({
        action: 'showNotification',
        title: 'Task Created',
        message: `Created task: ${formData.summary}`
      });

      // Close window after brief delay
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (error) {
      console.error('Error creating task:', error);
      alert(`Error creating task: ${error.message}`);
      createBtn.disabled = false;
      createBtn.textContent = 'Create Task';
    }
  }

  parseDueDate() {
    const dueDateInput = document.getElementById('dueDate').value;
    if (!dueDateInput) {
      return undefined;
    }

    try {
      const date = new Date(dueDateInput);
      return date.getTime();
    } catch (error) {
      console.error('Error parsing due date:', error);
      return undefined;
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  const controller = new TaskModalController();
  controller.init();
});
