/**
 * Task Modal - Create Task from Context Menu
 *
 * Opens from context menu when user right-clicks on a tab or page
 * Creates a task with optional tab reference and collection assignment
 */

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const tabId = urlParams.get('tabId');
const tabUrl = urlParams.get('tabUrl');
const tabTitle = urlParams.get('tabTitle');

// DOM elements
const form = document.getElementById('task-form');
const summaryInput = document.getElementById('summary');
const notesInput = document.getElementById('notes');
const prioritySelect = document.getElementById('priority');
const statusSelect = document.getElementById('status');
const collectionSelect = document.getElementById('collection');
const dueDateInput = document.getElementById('dueDate');
const tagsInput = document.getElementById('tags');
const cancelBtn = document.getElementById('cancel-btn');
const createBtn = document.getElementById('create-btn');
const errorDiv = document.getElementById('error');
const loadingDiv = document.getElementById('loading');
const tabInfoDiv = document.getElementById('tab-info');
const tabTitleDiv = document.getElementById('tab-title');
const notesCounter = document.getElementById('notes-counter');

/**
 * Initialize the modal
 */
async function init() {
  try {
    showLoading(true);

    // Show tab info if tabTitle is provided
    if (tabTitle) {
      tabTitleDiv.textContent = tabTitle;
      tabInfoDiv.style.display = 'block';

      // Pre-fill summary with tab title (truncate if needed)
      summaryInput.value = tabTitle.substring(0, 200);
    }

    // Load collections for dropdown
    await loadCollections();

    showLoading(false);

    // Focus summary input
    summaryInput.focus();
    summaryInput.select();

  } catch (error) {
    console.error('Failed to initialize modal:', error);
    showError('Failed to load data: ' + error.message);
    showLoading(false);
  }
}

/**
 * Load collections for dropdown
 */
async function loadCollections() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getCollections'
    });

    if (response && response.collections) {
      // Clear existing options (except first)
      collectionSelect.innerHTML = '<option value="">-- No Collection --</option>';

      // Add active collections first
      const activeCollections = response.collections.filter(c => c.isActive);
      if (activeCollections.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Active Collections';
        activeCollections.forEach(collection => {
          const option = document.createElement('option');
          option.value = collection.id;
          option.textContent = collection.name;
          optgroup.appendChild(option);
        });
        collectionSelect.appendChild(optgroup);
      }

      // Add saved collections
      const savedCollections = response.collections.filter(c => !c.isActive);
      if (savedCollections.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Saved Collections';
        savedCollections.forEach(collection => {
          const option = document.createElement('option');
          option.value = collection.id;
          option.textContent = collection.name;
          optgroup.appendChild(option);
        });
        collectionSelect.appendChild(optgroup);
      }
    }
  } catch (error) {
    console.error('Failed to load collections:', error);
    // Don't show error - collections are optional
  }
}

/**
 * Handle form submission
 */
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const summary = summaryInput.value.trim();
  if (!summary) {
    showError('Summary is required');
    return;
  }

  try {
    createBtn.disabled = true;
    showLoading(true);

    // Parse tags
    const tags = tagsInput.value
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    // Build task data
    const taskData = {
      summary,
      notes: notesInput.value.trim(),
      priority: prioritySelect.value,
      status: statusSelect.value,
      tags,
      tabIds: []
    };

    // Add collection if selected
    const collectionId = collectionSelect.value;
    if (collectionId) {
      taskData.collectionId = collectionId;
    }

    // Add due date if selected
    if (dueDateInput.value) {
      taskData.dueDate = new Date(dueDateInput.value).getTime();
    }

    // If we have a tab reference, we need to find the tab in the collection
    // For now, just store the URL in notes if no collection
    if (tabUrl && !collectionId) {
      taskData.notes = taskData.notes
        ? `${taskData.notes}\n\nTab: ${tabUrl}`
        : `Tab: ${tabUrl}`;
    }

    // Create task via background script
    const response = await chrome.runtime.sendMessage({
      action: 'createTask',
      ...taskData
    });

    if (response && response.success) {
      // Task created successfully
      // Close the window
      window.close();
    } else {
      showError(response?.error || 'Failed to create task');
      createBtn.disabled = false;
      showLoading(false);
    }

  } catch (error) {
    console.error('Failed to create task:', error);
    showError('Failed to create task: ' + error.message);
    createBtn.disabled = false;
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
 * Update notes character counter
 */
notesInput.addEventListener('input', () => {
  const length = notesInput.value.length;
  notesCounter.textContent = length;

  if (length > 900) {
    notesCounter.style.color = length >= 1000 ? '#c00' : '#f60';
  } else {
    notesCounter.style.color = '#666';
  }
});

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
