/**
 * Note Modal - Add Note to Tab
 *
 * Opens from context menu when user wants to add a note to a tab
 * Only available for tabs that are already in a collection
 */

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tabId = urlParams.get('tabId');
const tabUrl = urlParams.get('tabUrl');
const tabTitle = urlParams.get('tabTitle');
const storageTabId = urlParams.get('storageTabId'); // Tab ID in IndexedDB

// DOM elements
const form = document.getElementById('note-form');
const noteTextarea = document.getElementById('note');
const charCount = document.getElementById('char-count');
const tabTitleDiv = document.getElementById('tab-title');
const cancelBtn = document.getElementById('cancel-btn');
const saveBtn = document.getElementById('save-btn');
const errorDiv = document.getElementById('error');
const loadingDiv = document.getElementById('loading');

/**
 * Initialize the modal
 */
async function init() {
  try {
    // Show tab title
    tabTitleDiv.textContent = tabTitle || 'Unknown Tab';

    // If storageTabId is provided, load existing note
    if (storageTabId) {
      showLoading(true);
      await loadExistingNote();
      showLoading(false);
    }

    // Focus note textarea
    noteTextarea.focus();

  } catch (error) {
    console.error('Failed to initialize modal:', error);
    showError('Failed to load note: ' + error.message);
    showLoading(false);
  }
}

/**
 * Load existing note from storage
 */
async function loadExistingNote() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getTab',
      tabId: storageTabId
    });

    if (response && response.tab && response.tab.note) {
      noteTextarea.value = response.tab.note;
      updateCharCounter();
    }

  } catch (error) {
    console.error('Failed to load existing note:', error);
    // Don't show error - note might not exist yet
  }
}

/**
 * Handle form submission
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const note = noteTextarea.value.trim();

  try {
    saveBtn.disabled = true;
    showLoading(true);

    // Save note via background script
    const response = await chrome.runtime.sendMessage({
      action: 'updateTabNote',
      storageTabId: storageTabId,
      tabId: tabId ? parseInt(tabId) : null,
      tabUrl,
      note
    });

    if (response && response.success) {
      // Note saved successfully
      window.close();
    } else {
      showError(response?.error || 'Failed to save note');
      saveBtn.disabled = false;
      showLoading(false);
    }

  } catch (error) {
    console.error('Failed to save note:', error);
    showError('Failed to save note: ' + error.message);
    saveBtn.disabled = false;
    showLoading(false);
  }
});

/**
 * Handle cancel button
 */
cancelBtn.addEventListener('click', () => {
  window.close();
});

/**
 * Update character counter
 */
noteTextarea.addEventListener('input', updateCharCounter);

function updateCharCounter() {
  const length = noteTextarea.value.length;
  charCount.textContent = length;

  // Update counter styling
  const counterDiv = charCount.parentElement;
  counterDiv.classList.remove('warning', 'error');

  if (length > 240) {
    counterDiv.classList.add('warning');
  }
  if (length >= 255) {
    counterDiv.classList.add('error');
  }
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
  loadingDiv.style.display = show ? 'block' : 'none';
  form.style.display = show ? 'none' : 'block';
}

/**
 * Show error message
 */
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';

  // Auto-hide after 5 seconds
  setTimeout(() => {
    errorDiv.style.display = 'none';
  }, 5000);
}

/**
 * Handle ESC key to close
 */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.close();
  }
});

// Initialize on load
init();
