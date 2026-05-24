/**
 * Collection Selector Modal - Add Tab to Collection
 *
 * Allows selecting an existing collection or creating a new one to add a tab to.
 * Communicates with background script via chrome.runtime.sendMessage().
 */

import { t, tPlural, localizeDocument } from '../../services/utils/i18n.js';

class CollectionSelectorController {
  constructor() {
    this.collections = [];
    this.filteredCollections = [];
    this.tabData = null;
    this.isCreatingNew = false;
  }

  async init() {
    // Parse tab data from URL parameters
    this.tabData = this.parseUrlParams();

    // Show main container, hide loading
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('main-container').classList.remove('hidden');

    // Setup event listeners
    this.setupEventListeners();

    // Load collections
    await this.loadCollections();
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

    return data;
  }

  setupEventListeners() {
    // Search input
    const searchInput = document.getElementById('search-input');
    searchInput.addEventListener('input', (e) => {
      this.filterCollections(e.target.value);
    });

    // Cancel button
    const cancelBtn = document.getElementById('cancel-btn');
    cancelBtn.addEventListener('click', () => {
      window.close();
    });

    // New collection form buttons
    const cancelNewBtn = document.getElementById('cancel-new-btn');
    const createNewBtn = document.getElementById('create-new-btn');

    cancelNewBtn.addEventListener('click', () => {
      this.hideNewCollectionForm();
    });

    createNewBtn.addEventListener('click', () => {
      this.handleCreateNewCollection();
    });

    // Enter key in new collection name field
    const newNameInput = document.getElementById('new-collection-name');
    newNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleCreateNewCollection();
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
        this.renderError(t('modal_collection_loadFailed'));
        return;
      }

      this.collections = response.collections || [];

      // Sort by last accessed (most recent first)
      this.collections.sort((a, b) => {
        const aTime = a.metadata?.lastAccessed || a.metadata?.createdAt || 0;
        const bTime = b.metadata?.lastAccessed || b.metadata?.createdAt || 0;
        return bTime - aTime;
      });

      this.filteredCollections = [...this.collections];
      this.renderCollections();
    } catch (error) {
      console.error('Error loading collections:', error);
      this.renderError(t('modal_collection_loadError'));
    }
  }

  filterCollections(searchTerm) {
    const term = searchTerm.toLowerCase().trim();

    if (!term) {
      this.filteredCollections = [...this.collections];
    } else {
      this.filteredCollections = this.collections.filter(collection => {
        const name = collection.name?.toLowerCase() || '';
        const desc = collection.description?.toLowerCase() || '';
        const tags = (collection.tags || []).map(t => t.toLowerCase()).join(' ');

        return name.includes(term) || desc.includes(term) || tags.includes(term);
      });
    }

    this.renderCollections();
  }

  renderCollections() {
    const container = document.getElementById('collections-list');

    if (this.filteredCollections.length === 0 && this.collections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${t('modal_collection_emptyTitle')}</p>
          <p style="margin-top: 8px; font-size: 12px;">${t('modal_collection_emptyHint')}</p>
        </div>
      `;
    } else if (this.filteredCollections.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>${t('modal_collection_noMatch')}</p>
        </div>
      `;
    } else {
      container.innerHTML = '';

      // Render "Create New Collection" option
      const newItem = this.createNewCollectionItem();
      container.appendChild(newItem);

      // Render existing collections (limit to 10 for performance)
      const collectionsToShow = this.filteredCollections.slice(0, 10);
      collectionsToShow.forEach(collection => {
        const item = this.createCollectionItem(collection);
        container.appendChild(item);
      });

      if (this.filteredCollections.length > 10) {
        const moreItem = document.createElement('div');
        moreItem.className = 'collection-item';
        moreItem.style.fontStyle = 'italic';
        moreItem.style.color = 'var(--text-secondary)';
        moreItem.textContent = tPlural('modal_collection_moreCount', this.filteredCollections.length - 10);
        container.appendChild(moreItem);
      }
    }
  }

  createNewCollectionItem() {
    const item = document.createElement('div');
    item.className = 'collection-item new-collection';

    const name = document.createElement('div');
    name.className = 'collection-name';
    name.textContent = t('modal_collection_createNew');

    item.appendChild(name);
    item.addEventListener('click', () => {
      this.showNewCollectionForm();
    });

    return item;
  }

  createCollectionItem(collection) {
    const item = document.createElement('div');
    item.className = 'collection-item';

    const name = document.createElement('div');
    name.className = 'collection-name';
    name.textContent = collection.name;

    const meta = document.createElement('div');
    meta.className = 'collection-meta';

    const parts = [];
    if (collection.isActive) {
      parts.push(t('modal_collection_active'));
    }

    // Count tabs (from folders)
    let tabCount = 0;
    if (collection.folders) {
      collection.folders.forEach(folder => {
        if (folder.tabs) {
          tabCount += folder.tabs.length;
        }
      });
    }
    if (tabCount > 0) {
      parts.push(tPlural('modal_collection_tabCount', tabCount));
    }

    if (parts.length > 0) {
      meta.textContent = parts.join(' • ');
    }

    item.appendChild(name);
    if (meta.textContent) {
      item.appendChild(meta);
    }

    item.addEventListener('click', () => {
      this.handleSelectCollection(collection.id);
    });

    return item;
  }

  showNewCollectionForm() {
    const form = document.getElementById('new-collection-form');
    form.classList.add('visible');

    const nameInput = document.getElementById('new-collection-name');
    nameInput.value = '';
    nameInput.focus();

    this.isCreatingNew = true;
  }

  hideNewCollectionForm() {
    const form = document.getElementById('new-collection-form');
    form.classList.remove('visible');
    this.isCreatingNew = false;
  }

  async handleCreateNewCollection() {
    const nameInput = document.getElementById('new-collection-name');
    const name = nameInput.value.trim();

    if (!name) {
      alert(t('modal_collection_nameRequired'));
      nameInput.focus();
      return;
    }

    const createBtn = document.getElementById('create-new-btn');
    createBtn.disabled = true;
    createBtn.textContent = t('modal_collection_creating');

    try {
      // Create collection
      const createResponse = await chrome.runtime.sendMessage({
        action: 'createCollection',
        params: { name }
      });

      if (!createResponse || !createResponse.success) {
        throw new Error(createResponse?.error || t('modal_collection_createFailed'));
      }

      const collectionId = createResponse.collection.id;

      // Add tab to collection
      await this.addTabToCollection(collectionId);

      // Show success notification
      await chrome.runtime.sendMessage({
        action: 'showNotification',
        title: t('modal_collection_createdTitle'),
        message: t('modal_collection_createdMessage', name)
      });

      // Close window after brief delay
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (error) {
      console.error('Error creating collection:', error);
      alert(t('modal_collection_errorMessage', error.message));
      createBtn.disabled = false;
      createBtn.textContent = t('modal_collection_create');
    }
  }

  async handleSelectCollection(collectionId) {
    try {
      await this.addTabToCollection(collectionId);

      // Get collection name for notification
      const collection = this.collections.find(c => c.id === collectionId);
      const collectionName = collection?.name || t('modal_collection_fallbackName');

      // Show success notification
      await chrome.runtime.sendMessage({
        action: 'showNotification',
        title: t('modal_collection_addedTitle'),
        message: t('modal_collection_addedMessage', collectionName)
      });

      // Close window after brief delay
      setTimeout(() => {
        window.close();
      }, 500);
    } catch (error) {
      console.error('Error adding tab to collection:', error);
      alert(t('modal_collection_errorMessage', error.message));
    }
  }

  async addTabToCollection(collectionId) {
    if (!this.tabData || !this.tabData.url) {
      throw new Error(t('modal_collection_noTabData'));
    }

    // Get collection with folders to find where to add tab
    const collectionResponse = await chrome.runtime.sendMessage({
      action: 'getCompleteCollection',
      collectionId
    });

    if (!collectionResponse || !collectionResponse.success) {
      throw new Error(t('modal_collection_loadCollectionFailed'));
    }

    const collection = collectionResponse.collection;
    let folderId = null;

    // Find or create an "Unsorted" folder
    if (collection.folders && collection.folders.length > 0) {
      const unsortedFolder = collection.folders.find(f => f.name === 'Unsorted');
      if (unsortedFolder) {
        folderId = unsortedFolder.id;
      } else {
        // Use first folder
        folderId = collection.folders[0].id;
      }
    }

    // If no folder exists, create one
    if (!folderId) {
      const folderResponse = await chrome.runtime.sendMessage({
        action: 'createFolder',
        collectionId,
        params: { name: 'Unsorted', color: 'grey', position: 0 }
      });

      if (!folderResponse || !folderResponse.success) {
        throw new Error(t('modal_collection_createFolderFailed'));
      }

      folderId = folderResponse.folder.id;
    }

    // Add tab to folder
    const tabResponse = await chrome.runtime.sendMessage({
      action: 'createTab',
      folderId,
      params: {
        url: this.tabData.url,
        title: this.tabData.title || this.tabData.url,
        position: 0
      }
    });

    if (!tabResponse || !tabResponse.success) {
      throw new Error(t('modal_collection_addTabFailed'));
    }

    return tabResponse.tab;
  }

  renderError(message) {
    const container = document.getElementById('collections-list');
    container.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--error-color);">${this.escapeHtml(message)}</p>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  localizeDocument('modal_collection_docTitle');
  const controller = new CollectionSelectorController();
  controller.init();
});
