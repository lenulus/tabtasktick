/**
 * Collection Selector Modal - Add Tab to Collection
 *
 * Opens from context menu when user wants to add a tab to a collection
 * Shows existing collections and allows creating a new one
 */

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tabId = urlParams.get('tabId');
const tabUrl = urlParams.get('tabUrl');
const tabTitle = urlParams.get('tabTitle');

// State
let collections = [];
let selectedCollectionId = null;

// DOM elements
const loadingDiv = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const contentDiv = document.getElementById('content');
const searchInput = document.getElementById('search-input');
const collectionsList = document.getElementById('collections-list');
const newCollectionOption = document.getElementById('new-collection-option');
const newCollectionForm = document.getElementById('new-collection-form');
const newCollectionNameInput = document.getElementById('new-collection-name');
const cancelNewBtn = document.getElementById('cancel-new-btn');
const createNewBtn = document.getElementById('create-new-btn');
const cancelBtn = document.getElementById('cancel-btn');
const addBtn = document.getElementById('add-btn');
const tabInfoDiv = document.getElementById('tab-info');
const tabTitleDiv = document.getElementById('tab-title');

/**
 * Initialize the modal
 */
async function init() {
  try {
    showLoading(true);

    // Show tab info if provided
    if (tabTitle) {
      tabTitleDiv.textContent = tabTitle;
      tabInfoDiv.style.display = 'block';
    }

    // Load collections
    await loadCollections();

    showLoading(false);
    contentDiv.style.display = 'block';

  } catch (error) {
    console.error('Failed to initialize modal:', error);
    showError('Failed to load collections: ' + error.message);
    showLoading(false);
  }
}

/**
 * Load collections from background
 */
async function loadCollections() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getCollections'
    });

    if (response && response.collections) {
      collections = response.collections;
      renderCollections();
    } else {
      collections = [];
      renderCollections();
    }

  } catch (error) {
    console.error('Failed to load collections:', error);
    throw error;
  }
}

/**
 * Render collections list
 */
function renderCollections(searchTerm = '') {
  // Filter collections by search term
  let filtered = collections;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = collections.filter(c =>
      c.name.toLowerCase().includes(term) ||
      (c.description && c.description.toLowerCase().includes(term))
    );
  }

  // Sort: active first, then by lastAccessed
  filtered.sort((a, b) => {
    if (a.isActive && !b.isActive) return -1;
    if (!a.isActive && b.isActive) return 1;
    const aTime = a.metadata?.lastAccessed || a.createdAt || 0;
    const bTime = b.metadata?.lastAccessed || b.createdAt || 0;
    return bTime - aTime;
  });

  // Clear list (keep new collection option)
  collectionsList.innerHTML = '';
  collectionsList.appendChild(newCollectionOption);

  // Render collections
  if (filtered.length === 0) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = searchTerm
      ? 'No collections found'
      : 'No collections yet. Create your first one!';
    collectionsList.appendChild(emptyState);
    return;
  }

  filtered.forEach(collection => {
    const item = document.createElement('div');
    item.className = 'collection-item';
    if (selectedCollectionId === collection.id) {
      item.classList.add('selected');
    }

    const name = document.createElement('div');
    name.className = 'collection-name';
    name.textContent = collection.name;

    const status = document.createElement('span');
    status.className = `collection-status ${collection.isActive ? 'active' : 'saved'}`;
    status.textContent = collection.isActive ? 'Active' : 'Saved';
    name.appendChild(status);

    const meta = document.createElement('div');
    meta.className = 'collection-meta';

    // Count tabs/folders (placeholder - would need actual data)
    const parts = [];
    if (collection.metadata?.tabCount) {
      parts.push(`${collection.metadata.tabCount} tabs`);
    }
    if (collection.metadata?.folderCount) {
      parts.push(`${collection.metadata.folderCount} folders`);
    }
    if (collection.tags && collection.tags.length > 0) {
      parts.push(`Tags: ${collection.tags.slice(0, 2).join(', ')}`);
    }
    meta.textContent = parts.join(' • ');

    item.appendChild(name);
    item.appendChild(meta);

    item.addEventListener('click', () => {
      selectCollection(collection.id);
    });

    collectionsList.appendChild(item);
  });
}

/**
 * Select a collection
 */
function selectCollection(collectionId) {
  selectedCollectionId = collectionId;

  // Update UI
  const items = collectionsList.querySelectorAll('.collection-item');
  items.forEach(item => {
    if (item.dataset.collectionId === collectionId) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  // Enable add button
  addBtn.disabled = false;
}

/**
 * Show new collection form
 */
newCollectionOption.addEventListener('click', () => {
  newCollectionForm.classList.add('visible');
  newCollectionNameInput.focus();
});

/**
 * Cancel new collection
 */
cancelNewBtn.addEventListener('click', () => {
  newCollectionForm.classList.remove('visible');
  newCollectionNameInput.value = '';
});

/**
 * Create new collection
 */
createNewBtn.addEventListener('click', async () => {
  const name = newCollectionNameInput.value.trim();
  if (!name) {
    showError('Collection name is required');
    return;
  }

  try {
    createNewBtn.disabled = true;

    // Create collection via background
    const response = await chrome.runtime.sendMessage({
      action: 'createCollection',
      name,
      windowId: null, // Create as saved collection
      description: '',
      tags: []
    });

    if (response && response.collection) {
      // Add to local list
      collections.push(response.collection);

      // Select it
      selectedCollectionId = response.collection.id;

      // Hide form
      newCollectionForm.classList.remove('visible');
      newCollectionNameInput.value = '';

      // Re-render
      renderCollections(searchInput.value);

      // Enable add button
      addBtn.disabled = false;

    } else {
      showError(response?.error || 'Failed to create collection');
    }

  } catch (error) {
    console.error('Failed to create collection:', error);
    showError('Failed to create collection: ' + error.message);
  } finally {
    createNewBtn.disabled = false;
  }
});

/**
 * Handle search input
 */
searchInput.addEventListener('input', (e) => {
  renderCollections(e.target.value);
});

/**
 * Handle add button
 */
addBtn.addEventListener('click', async () => {
  if (!selectedCollectionId) {
    return;
  }

  try {
    addBtn.disabled = true;

    // TODO: In Phase 6, implement actual tab addition to collection
    // For now, just show a notification and close

    // Notify background
    await chrome.runtime.sendMessage({
      action: 'addTabToCollection',
      collectionId: selectedCollectionId,
      tabId: tabId ? parseInt(tabId) : null,
      tabUrl,
      tabTitle
    });

    // Close window
    window.close();

  } catch (error) {
    console.error('Failed to add tab to collection:', error);
    showError('Failed to add tab: ' + error.message);
    addBtn.disabled = false;
  }
});

/**
 * Handle cancel button
 */
cancelBtn.addEventListener('click', () => {
  window.close();
});

/**
 * Show/hide loading
 */
function showLoading(show) {
  loadingDiv.style.display = show ? 'block' : 'none';
}

/**
 * Show error message
 */
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';

  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

/**
 * Handle ESC key to close
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (newCollectionForm.classList.contains('visible')) {
      newCollectionForm.classList.remove('visible');
      newCollectionNameInput.value = '';
    } else {
      window.close();
    }
  }
});

// Initialize on load
init();
