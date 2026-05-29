/**
 * Collection Detail View Component
 *
 * THIN component - all business logic via message passing to background
 * Shows detailed view of a single collection with:
 * - Collection header (name, description, tags, metadata)
 * - Tasks section FIRST (per proposal visual hierarchy)
 * - Folders section (collapsible) with tabs
 * - Action buttons and inline editing
 */

import { notifications } from './components/notification.js';
import { modal } from './components/modal.js';
import { EmojiPicker } from './components/emoji-picker.js';
import { getCurrentTabSnapshot } from '../services/utils/tab-snapshot.js';
import { TabChipRenderer } from './components/tab-chip-renderer.js';
import { t } from '../services/utils/i18n.js';

export class CollectionDetailView {
  constructor(controller) {
    this.controller = controller;
    this.currentCollectionId = null;
    this.expandedFolders = new Set(); // Track which folders are expanded
    this.container = null;
  }

  /**
   * Initialize the view
   */
  init() {
    // Detail view will be rendered dynamically, no persistent container
  }

  /**
   * Show detail view for a collection
   */
  async show(collectionId) {
    try {
      this.currentCollectionId = collectionId;

      // Load collection data
      const collection = await this.loadCollection(collectionId);
      if (!collection) {
        notifications.error(t('sidepanel_detail_notFound'));
        return;
      }

      // Load folders and tabs
      const folders = await this.loadFolders(collectionId);
      const tabs = await this.loadTabs(folders);

      // Load tasks
      const tasks = await this.loadTasks(collectionId);

      // Render detail view
      this.render(collection, folders, tabs, tasks);
    } catch (error) {
      console.error('Failed to load collection detail:', error);
      notifications.error(t('sidepanel_detail_loadFailed'));
    }
  }

  /**
   * Hide detail view and return to collections list
   */
  hide() {
    this.currentCollectionId = null;
    this.expandedFolders.clear();

    // Show collections view again
    const collectionsView = document.getElementById('collections-content');
    if (collectionsView) {
      collectionsView.style.display = 'block';
    }

    // Remove detail view
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }

  /**
   * Load collection data
   */
  async loadCollection(collectionId) {
    const response = await this.controller.sendMessage('getCollection', { id: collectionId });
    return response?.collection || null;
  }

  /**
   * Load folders for collection
   */
  async loadFolders(collectionId) {
    const response = await this.controller.sendMessage('getFoldersByCollection', { collectionId });
    return response?.folders || [];
  }

  /**
   * Load tabs for folders and ungrouped tabs
   */
  async loadTabs(folders) {
    const allTabs = [];

    // Load tabs from folders
    for (const folder of folders) {
      const response = await this.controller.sendMessage('getTabsByFolder', { folderId: folder.id });
      const tabs = response?.tabs || [];
      allTabs.push(...tabs.map(tab => ({ ...tab, folderId: folder.id })));
    }

    // Load ungrouped tabs (folderId === null) for this collection only
    const ungroupedResponse = await this.controller.sendMessage('getUngroupedTabs', {
      collectionId: this.currentCollectionId
    });
    const ungroupedTabs = ungroupedResponse?.tabs || [];
    allTabs.push(...ungroupedTabs.map(tab => ({ ...tab, folderId: null })));

    return allTabs;
  }

  /**
   * Load tasks for collection
   */
  async loadTasks(collectionId) {
    const response = await this.controller.sendMessage('getTasks', {
      filters: { collectionId }
    });
    return response?.tasks || [];
  }

  /**
   * Load and display sync status for collection
   */
  async loadSyncStatus(collectionId) {
    try {
      const response = await this.controller.sendMessage('getSyncStatus', { collectionId });

      if (!response || !this.container) return;

      const lastSyncElement = this.container.querySelector('[data-status="last-sync"]');
      const pendingChangesElement = this.container.querySelector('[data-status="pending-changes"]');

      if (lastSyncElement) {
        if (response.lastSyncTime) {
          const timeAgo = this.formatTimeAgo(response.lastSyncTime);
          lastSyncElement.textContent = timeAgo;
          lastSyncElement.title = new Date(response.lastSyncTime).toLocaleString();
        } else {
          lastSyncElement.textContent = t('sidepanel_detail_syncNever');
        }
      }

      if (pendingChangesElement) {
        const count = response.pendingChanges || 0;
        pendingChangesElement.textContent = count.toString();
        if (count > 0) {
          pendingChangesElement.classList.add('has-pending');
        } else {
          pendingChangesElement.classList.remove('has-pending');
        }
      }
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  }

  /**
   * Format time ago (e.g., "2 minutes ago")
   */
  formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;

    if (diff < 60000) return t('sidepanel_time_justNow');
    if (diff < 3600000) return t('sidepanel_time_minAgo', String(Math.floor(diff / 60000)));
    if (diff < 86400000) return t('sidepanel_time_hoursAgo', String(Math.floor(diff / 3600000)));
    return t('sidepanel_time_daysAgo', String(Math.floor(diff / 86400000)));
  }

  /**
   * Render detail view
   */
  render(collection, folders, tabs, tasks) {
    // Hide collections list
    const collectionsView = document.getElementById('collections-content');
    if (collectionsView) {
      collectionsView.style.display = 'none';
    }

    // Remove existing container if present
    if (this.container) {
      this.container.remove();
      this.container = null;
    }

    // Create detail container
    const viewContainer = document.getElementById('collections-view');
    this.container = document.createElement('div');
    this.container.className = 'collection-detail-view';
    this.container.innerHTML = this.renderContent(collection, folders, tabs, tasks);

    viewContainer.appendChild(this.container);

    // Attach event listeners
    this.attachEventListeners();

    // Load sync status if collection is active
    if (collection.isActive) {
      this.loadSyncStatus(collection.id);
    }
  }

  /**
   * Render detail content
   */
  renderContent(collection, folders, tabs, tasks) {
    return `
      <div class="detail-header">
        <button class="btn-back" data-action="back">
          ${t('sidepanel_detail_back')}
        </button>
      </div>

      ${this.renderCollectionHeader(collection)}
      ${this.renderTasksSection(tasks, collection, tabs)}
      ${this.renderFoldersSection(folders, tabs)}
      ${this.renderSettingsSection(collection)}
      ${this.renderCollectionActions(collection)}
    `;
  }

  /**
   * Render collection header
   */
  renderCollectionHeader(collection) {
    const icon = collection.icon || '📁';
    const name = this.escapeHtml(collection.name || t('sidepanel_detail_untitledCollection'));
    const description = collection.description
      ? this.escapeHtml(collection.description)
      : '';

    const windowInfo = collection.isActive && collection.windowId
      ? `<span class="window-badge">${this.escapeHtml(t('sidepanel_detail_windowBadge', String(collection.windowId)))}</span>`
      : '';

    return `
      <div class="collection-header-detail">
        <div class="collection-title-row">
          <div class="collection-icon-large">${icon}</div>
          <div class="collection-header-info">
            <h2 class="collection-name-large">
              ${collection.isActive ? '<span class="active-indicator">🟢</span>' : ''}
              ${name}
              ${windowInfo}
            </h2>
            ${description ? `<p class="collection-description-large">${description}</p>` : ''}
          </div>
        </div>

        ${collection.tags && collection.tags.length > 0 ? `
          <div class="collection-tags-large">
            ${collection.tags.map(tag =>
    `<span class="tag">${this.escapeHtml(tag)}</span>`
  ).join('')}
          </div>
        ` : ''}

        <div class="collection-metadata">
          <span class="meta-item">
            <span class="meta-label">${t('sidepanel_detail_metaCreated')}</span>
            <span class="meta-value">${this.formatDateTime(collection.createdAt)}</span>
          </span>
          <span class="meta-item">
            <span class="meta-label">${t('sidepanel_detail_metaLastAccessed')}</span>
            <span class="meta-value">${this.formatDateTime(collection.metadata?.lastAccessed)}</span>
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Render tasks section (shown first per proposal)
   */
  renderTasksSection(tasks, collection, tabs) {
    // Group tasks by status
    const openTasks = tasks.filter(t => t.status === 'open');
    const activeTasks = tasks.filter(t => t.status === 'active');
    const completedTasks = tasks.filter(t => ['fixed', 'abandoned'].includes(t.status));

    return `
      <section class="detail-section tasks-section">
        <div class="section-header-detail">
          <h3 class="section-title-detail">
            ${t('sidepanel_detail_tasksHeader')}
            <span class="section-count-detail">${tasks.length}</span>
          </h3>
          <button class="btn btn-primary btn-sm" data-action="create-task">
            ${t('sidepanel_detail_newTask')}
          </button>
        </div>

        <div class="tasks-container">
          ${tasks.length === 0 ? `
            <div class="empty-state-inline">
              <p>${t('sidepanel_detail_noTasks')}</p>
            </div>
          ` : ''}

          ${openTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">${this.escapeHtml(t('sidepanel_detail_tasksOpen', String(openTasks.length)))}</h4>
              ${openTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}

          ${activeTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">${this.escapeHtml(t('sidepanel_detail_tasksActive', String(activeTasks.length)))}</h4>
              ${activeTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}

          ${completedTasks.length > 0 ? `
            <div class="task-group">
              <h4 class="task-group-title">${this.escapeHtml(t('sidepanel_detail_tasksCompleted', String(completedTasks.length)))}</h4>
              ${completedTasks.map(task => this.renderTaskCard(task, tabs)).join('')}
            </div>
          ` : ''}
        </div>
      </section>
    `;
  }

  /**
   * Render task card
   */
  renderTaskCard(task, allTabs) {
    const priorityIcon = {
      critical: '🔴',
      high: '🔴',
      medium: '⚪',
      low: '⚪'
    }[task.priority || 'medium'];

    // Get referenced tabs
    const referencedTabs = (task.tabIds || [])
      .map(tabId => allTabs.find(t => t.id === tabId))
      .filter(Boolean);

    const tabsPreview = referencedTabs.length > 0
      ? `<div class="task-tabs-preview">
           → ${referencedTabs.slice(0, 2).map(tabRef => this.escapeHtml(tabRef.title || tabRef.url)).join(', ')}
           ${referencedTabs.length > 2 ? this.escapeHtml(t('sidepanel_detail_moreTabs', String(referencedTabs.length - 2))) : ''}
         </div>`
      : '';

    const statusLabels = {
      open: t('sidepanel_detail_form_statusOpen'),
      active: t('sidepanel_detail_form_statusActive'),
      fixed: t('sidepanel_detail_form_statusFixed'),
      abandoned: t('sidepanel_detail_form_statusAbandoned')
    };
    const statusLabel = statusLabels[task.status] || task.status;

    return `
      <div class="task-card-detail" data-task-id="${task.id}">
        <div class="task-header-detail">
          <span class="task-priority-icon">${priorityIcon}</span>
          <span class="task-summary">${this.escapeHtml(task.summary)}</span>
          <span class="task-status-badge status-${task.status}">${this.escapeHtml(statusLabel)}</span>
        </div>
        ${tabsPreview}
        <div class="task-actions-detail">
          <button class="btn-icon" data-action="open-task-tabs" data-task-id="${task.id}" title="${this.escapeHtml(t('sidepanel_detail_openTabsTitle'))}">
            📂
          </button>
          <button class="btn-icon" data-action="mark-fixed" data-task-id="${task.id}" title="${this.escapeHtml(t('sidepanel_detail_markFixedTitle'))}">
            ✓
          </button>
          <button class="btn-icon" data-action="edit-task" data-task-id="${task.id}" title="${this.escapeHtml(t('sidepanel_detail_editTaskTitle'))}">
            ✏️
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Render folders section
   */
  renderFoldersSection(folders, tabs) {
    const ungroupedTabs = tabs.filter(t => t.folderId === null);

    return `
      <section class="detail-section folders-section">
        <div class="section-header-detail">
          <h3 class="section-title-detail">
            ${t('sidepanel_detail_foldersHeader')}
            <span class="section-count-detail">${this.escapeHtml(t('sidepanel_detail_foldersCount', [String(folders.length), String(tabs.length)]))}</span>
          </h3>
        </div>

        <div class="folders-container">
          ${folders.length === 0 && ungroupedTabs.length === 0 ? `
            <div class="empty-state-inline">
              <p>${t('sidepanel_detail_noFolders')}</p>
            </div>
          ` : ''}

          ${folders.map(folder => this.renderFolder(folder, tabs)).join('')}

          ${ungroupedTabs.length > 0 ? this.renderUngroupedTabs(ungroupedTabs) : ''}
        </div>
      </section>
    `;
  }

  /**
   * Render folder with tabs
   */
  renderFolder(folder, allTabs) {
    const folderTabs = allTabs.filter(t => t.folderId === folder.id);
    const isExpanded = this.expandedFolders.has(folder.id);

    return `
      <div class="folder-card" data-folder-id="${folder.id}">
        <div class="folder-header" data-action="toggle-folder" data-folder-id="${folder.id}">
          <span class="folder-toggle">${isExpanded ? '▼' : '▶'}</span>
          <span class="folder-name">${this.escapeHtml(folder.name || t('sidepanel_detail_untitledFolder'))}</span>
          <span class="folder-count">${this.escapeHtml(t('sidepanel_detail_folderTabsCount', String(folderTabs.length)))}</span>
        </div>

        <div class="folder-tabs ${isExpanded ? 'expanded' : 'collapsed'}">
          ${folderTabs.map(tab => this.renderTab(tab)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render ungrouped tabs section
   */
  renderUngroupedTabs(ungroupedTabs) {
    const isExpanded = this.expandedFolders.has('ungrouped');

    return `
      <div class="folder-card" data-folder-id="ungrouped">
        <div class="folder-header" data-action="toggle-folder" data-folder-id="ungrouped">
          <span class="folder-toggle">${isExpanded ? '▼' : '▶'}</span>
          <span class="folder-name">${t('sidepanel_detail_ungroupedTabs')}</span>
          <span class="folder-count">${this.escapeHtml(t('sidepanel_detail_folderTabsCount', String(ungroupedTabs.length)))}</span>
        </div>

        <div class="folder-tabs ${isExpanded ? 'expanded' : 'collapsed'}">
          ${ungroupedTabs.map(tab => this.renderTab(tab)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render tab with inline note editing
   */
  renderTab(tab) {
    const favicon = tab.favicon || '📄';
    const title = this.escapeHtml(tab.title || tab.url);
    const note = tab.note ? this.escapeHtml(tab.note) : '';

    return `
      <div class="tab-item" data-tab-id="${tab.id}">
        <div class="tab-header-item">
          ${tab.isPinned ? '<span class="tab-pinned-icon">📌</span>' : ''}
          <img src="${favicon}" class="tab-favicon" alt="" data-favicon>
          <span class="tab-title">${title}</span>
        </div>
        <div class="tab-note-container">
          <textarea
            class="tab-note-input"
            data-tab-id="${tab.id}"
            placeholder="${this.escapeHtml(t('sidepanel_detail_notePlaceholder'))}"
            maxlength="255"
            rows="1"
          >${note}</textarea>
          <span class="tab-note-chars">${this.escapeHtml(t('sidepanel_detail_noteChars', String(note.length)))}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render collection actions
   */
  /**
   * Render settings section (Phase 8: Progressive Sync settings)
   */
  renderSettingsSection(collection) {
    // Default settings if not present (backwards compatibility)
    const settings = collection.settings || {
      trackingEnabled: true,
      syncDebounceMs: 2000
    };

    // Only show settings for active collections
    if (!collection.isActive) {
      return '';
    }

    return `
      <section class="detail-section settings-section">
        <details class="settings-details">
          <summary class="section-header-detail">
            <h3 class="section-title-detail">${t('sidepanel_detail_settingsHeader')}</h3>
          </summary>

          <div class="settings-content">
            <p class="settings-info">
              ${t('sidepanel_detail_settingsInfo')}
            </p>

            <div class="setting-row">
              <label class="setting-label">
                <input
                  type="checkbox"
                  class="setting-checkbox"
                  data-setting="trackingEnabled"
                  ${settings.trackingEnabled ? 'checked' : ''}
                >
                <span class="setting-text">
                  <strong>${t('sidepanel_detail_trackingTitle')}</strong>
                  <span class="setting-description">${t('sidepanel_detail_trackingDesc')}</span>
                </span>
              </label>
            </div>

            <div class="setting-row">
              <label class="setting-label setting-label-slider">
                <span class="setting-text">
                  <strong>${t('sidepanel_detail_syncDelayTitle')}</strong>
                  <span class="setting-description">${this.escapeHtml(t('sidepanel_detail_syncDelayDesc', this.formatSyncDelay(settings.syncDebounceMs)))}</span>
                </span>
                <div class="slider-container">
                  <input
                    type="range"
                    class="setting-slider"
                    data-setting="syncDebounceMs"
                    min="0"
                    max="10000"
                    step="500"
                    value="${settings.syncDebounceMs}"
                    ${!settings.trackingEnabled ? 'disabled' : ''}
                  >
                  <div class="slider-labels">
                    <span>0s</span>
                    <span>5s</span>
                    <span>10s</span>
                  </div>
                </div>
              </label>
            </div>

            <div class="sync-status" data-collection-id="${collection.id}">
              <div class="sync-status-header">
                <strong>${t('sidepanel_detail_syncStatus')}</strong>
              </div>
              <div class="sync-status-info">
                <div class="sync-status-row">
                  <span class="sync-status-label">${t('sidepanel_detail_lastSynced')}</span>
                  <span class="sync-status-value" data-status="last-sync">${t('sidepanel_detail_loading')}</span>
                </div>
                <div class="sync-status-row">
                  <span class="sync-status-label">${t('sidepanel_detail_pendingChanges')}</span>
                  <span class="sync-status-value" data-status="pending-changes">${t('sidepanel_detail_loading')}</span>
                </div>
              </div>
            </div>

            <div class="settings-footer">
              <button class="btn btn-sm btn-secondary" data-action="save-settings">
                ${t('sidepanel_detail_saveSettings')}
              </button>
            </div>
          </div>
        </details>
      </section>
    `;
  }

  /**
   * Format sync delay for display
   */
  formatSyncDelay(ms) {
    if (ms === 0) return t('sidepanel_detail_syncDelayInstant');
    if (ms < 1000) return t('sidepanel_detail_syncDelayMs', String(ms));
    return t('sidepanel_detail_syncDelaySeconds', (ms / 1000).toFixed(1));
  }

  renderCollectionActions(collection) {
    return `
      <div class="collection-actions-detail">
        ${collection.isActive ? `
          <button class="btn btn-secondary" data-action="sync-collection">
            ${t('sidepanel_detail_refresh')}
          </button>
          <button class="btn btn-secondary" data-action="focus-window">
            ${t('sidepanel_detail_focusWindow')}
          </button>
          <button class="btn btn-secondary" data-action="close-window">
            ${t('sidepanel_detail_closeWindow')}
          </button>
        ` : `
          <button class="btn btn-primary" data-action="open-collection">
            ${t('sidepanel_detail_openCollection')}
          </button>
        `}
        <button class="btn btn-secondary" data-action="edit-collection">
          ${t('sidepanel_detail_editCollection')}
        </button>
      </div>
    `;
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.container) return;

    this.container.addEventListener('click', async (e) => {
      const button = e.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;

      switch (action) {
      case 'back':
        this.hide();
        break;
      case 'create-task':
        await this.handleCreateTask();
        break;
      case 'open-task-tabs':
        await this.handleOpenTaskTabs(button.dataset.taskId);
        break;
      case 'mark-fixed':
        await this.handleMarkFixed(button.dataset.taskId);
        break;
      case 'edit-task':
        await this.handleEditTask(button.dataset.taskId);
        break;
      case 'toggle-folder':
        this.handleToggleFolder(button.dataset.folderId);
        break;
      case 'sync-collection':
        await this.handleSyncCollection();
        break;
      case 'focus-window':
        await this.handleFocusWindow();
        break;
      case 'close-window':
        await this.handleCloseWindow();
        break;
      case 'open-collection':
        await this.handleOpenCollection();
        break;
      case 'edit-collection':
        await this.handleEditCollection();
        break;
      case 'save-settings':
        await this.handleSaveSettings();
        break;
      }
    });

    // Tab note editing
    this.container.addEventListener('blur', async (e) => {
      if (e.target.classList.contains('tab-note-input')) {
        await this.handleSaveTabNote(e.target);
      }
    }, true);

    // Character count update
    this.container.addEventListener('input', (e) => {
      if (e.target.classList.contains('tab-note-input')) {
        const charsSpan = e.target.nextElementSibling;
        if (charsSpan) {
          charsSpan.textContent = t('sidepanel_detail_noteChars', String(e.target.value.length));
        }
      }

      // Phase 8: Sync delay slider update
      if (e.target.classList.contains('setting-slider')) {
        const description = e.target.closest('.setting-label-slider').querySelector('.setting-description');
        if (description) {
          const value = parseInt(e.target.value);
          description.textContent = t('sidepanel_detail_syncDelayDesc', this.formatSyncDelay(value));
        }
      }
    });

    // Phase 8: Settings checkbox changes
    this.container.addEventListener('change', (e) => {
      if (e.target.dataset.setting === 'trackingEnabled') {
        const syncDelaySlider = this.container.querySelector('[data-setting="syncDebounceMs"]');

        if (e.target.checked) {
          syncDelaySlider.disabled = false;
        } else {
          syncDelaySlider.disabled = true;
        }
      }
    });

    // Favicon error handling (CSP-compliant)
    const faviconImages = this.container.querySelectorAll('[data-favicon]');
    faviconImages.forEach(img => {
      img.addEventListener('error', function() {
        this.style.display = 'none';
      });
    });
  }

  /**
   * Handle create task
   */
  async handleCreateTask() {
    try {
      const form = await this.createTaskForm();

      modal.open({
        title: t('sidepanel_detail_createTaskTitle'),
        content: form,
        size: 'medium',
        actions: [
          {
            label: t('common_cancel'),
            variant: 'secondary',
            autoClose: true
          },
          {
            label: t('sidepanel_detail_create'),
            variant: 'primary',
            onClick: async () => {
              await this.saveTask(null, form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to create task:', error);
      notifications.error(t('sidepanel_detail_createTaskFailed'));
    }
  }

  /**
   * Handle edit task
   */
  async handleEditTask(taskId) {
    try {
      const response = await this.controller.sendMessage('getTask', { id: taskId });
      const task = response?.task;

      if (!task) {
        notifications.error(t('sidepanel_detail_taskNotFound'));
        return;
      }

      const form = await this.createTaskForm(task);

      modal.open({
        title: t('sidepanel_tasks_editTitle'),
        content: form,
        size: 'medium',
        actions: [
          {
            label: t('common_cancel'),
            variant: 'secondary',
            autoClose: true
          },
          {
            label: t('common_save'),
            variant: 'primary',
            onClick: async () => {
              await this.saveTask(taskId, form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to edit task:', error);
      notifications.error(t('sidepanel_detail_editTaskFailed'));
    }
  }

  /**
   * Create task form (async for Phase 11 tab snapshot)
   */
  async createTaskForm(task = null) {
    const form = document.createElement('form');
    form.className = 'task-edit-form';

    // Phase 11: Render tab references or get current tab
    let tabReferencesHtml = '';
    if (task) {
      tabReferencesHtml = await TabChipRenderer.renderTabReferences(
        task.tabReferences || [],
        this.escapeHtml.bind(this)
      );
    } else {
      const currentTab = await getCurrentTabSnapshot();
      tabReferencesHtml = currentTab
        ? TabChipRenderer.renderTabChip(currentTab, this.escapeHtml.bind(this))
        : TabChipRenderer.renderEmptyTabState();
    }

    form.innerHTML = `
      <div class="form-group">
        <label for="task-summary">${t('sidepanel_detail_form_summaryLabel')}</label>
        <input
          type="text"
          id="task-summary"
          name="summary"
          value="${task ? this.escapeHtml(task.summary) : ''}"
          required
          class="form-input"
        >
      </div>

      <!-- Phase 11: Tab Association Section -->
      <div class="tab-association-section" id="tab-association-section">
        <label class="section-label">${t('sidepanel_detail_form_contextLabel')}</label>
        <div class="tab-chip-container" id="tab-chip-container">
          ${tabReferencesHtml}
        </div>
        <p class="helper-text">${t('sidepanel_detail_form_contextHelper')}</p>
      </div>

      <div class="form-group">
        <label for="task-notes">${t('sidepanel_detail_form_notesLabel')}</label>
        <textarea
          id="task-notes"
          name="notes"
          class="form-textarea"
          rows="3"
        >${task ? this.escapeHtml(task.notes || '') : ''}</textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="task-priority">${t('sidepanel_detail_form_priorityLabel')}</label>
          <select id="task-priority" name="priority" class="form-select">
            <option value="low" ${task?.priority === 'low' ? 'selected' : ''}>${t('sidepanel_detail_form_priorityLow')}</option>
            <option value="medium" ${!task || task.priority === 'medium' ? 'selected' : ''}>${t('sidepanel_detail_form_priorityMedium')}</option>
            <option value="high" ${task?.priority === 'high' ? 'selected' : ''}>${t('sidepanel_detail_form_priorityHigh')}</option>
            <option value="critical" ${task?.priority === 'critical' ? 'selected' : ''}>${t('sidepanel_detail_form_priorityCritical')}</option>
          </select>
        </div>

        <div class="form-group">
          <label for="task-status">${t('sidepanel_detail_form_statusLabel')}</label>
          <select id="task-status" name="status" class="form-select">
            <option value="open" ${!task || task.status === 'open' ? 'selected' : ''}>${t('sidepanel_detail_form_statusOpen')}</option>
            <option value="active" ${task?.status === 'active' ? 'selected' : ''}>${t('sidepanel_detail_form_statusActive')}</option>
            <option value="fixed" ${task?.status === 'fixed' ? 'selected' : ''}>${t('sidepanel_detail_form_statusFixed')}</option>
            <option value="abandoned" ${task?.status === 'abandoned' ? 'selected' : ''}>${t('sidepanel_detail_form_statusAbandoned')}</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label for="task-due-date">${t('sidepanel_detail_form_dueDateLabel')}</label>
        <input
          type="date"
          id="task-due-date"
          name="dueDate"
          value="${task?.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}"
          class="form-input"
        >
      </div>

      <div class="form-group">
        <label for="task-tags">${t('sidepanel_detail_form_tagsLabel')}</label>
        <input
          type="text"
          id="task-tags"
          name="tags"
          value="${task?.tags ? task.tags.join(', ') : ''}"
          class="form-input"
          placeholder="${this.escapeHtml(t('sidepanel_detail_form_tagsPlaceholder'))}"
        >
      </div>
    `;

    // Phase 11: Setup tab chip handlers after form is created
    setTimeout(() => {
      TabChipRenderer.setupTabChipHandlers(
        '#tab-chip-container',
        task ? task.tabReferences || [] : [],
        this.escapeHtml.bind(this),
        { multipleMode: true } // Multiple tabs allowed
      );
    }, 0);

    return form;
  }

  /**
   * Save task
   */
  async saveTask(taskId, form) {
    try {
      const formData = new FormData(form);
      const params = {
        summary: formData.get('summary'),
        notes: formData.get('notes') || null,
        priority: formData.get('priority'),
        status: formData.get('status'),
        dueDate: formData.get('dueDate') ? new Date(formData.get('dueDate')).getTime() : null,
        tags: formData.get('tags')
          ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
          : [],
        collectionId: this.currentCollectionId
      };

      // Phase 11: Include tab references
      const container = form.querySelector('#tab-chip-container');
      if (container?.dataset.tabReferences) {
        try {
          params.tabReferences = JSON.parse(container.dataset.tabReferences);
        } catch (error) {
          console.warn('[Phase 11] Failed to parse tab references:', error);
          params.tabReferences = [];
        }
      } else {
        params.tabReferences = [];
      }

      const action = taskId ? 'updateTask' : 'createTask';
      const response = await this.controller.sendMessage(action, taskId ? { id: taskId, updates: params } : { params });

      if (response?.success || response?.task) {
        notifications.success(taskId ? t('sidepanel_detail_taskUpdated') : t('sidepanel_detail_taskCreated'));
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || t('sidepanel_detail_saveTaskFailed'));
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      notifications.error(t('sidepanel_detail_saveTaskFailed'));
      throw error;
    }
  }

  /**
   * Handle open task tabs
   */
  async handleOpenTaskTabs(taskId) {
    try {
      const result = await this.controller.sendMessage('openTaskTabs', { taskId });

      if (result?.success) {
        notifications.success(t('sidepanel_detail_openedTabs', String(result.tabsOpened || 0)));
      } else {
        notifications.error(t('sidepanel_detail_openTaskTabsFailed'));
      }
    } catch (error) {
      console.error('Failed to open task tabs:', error);
      notifications.error(t('sidepanel_detail_openTaskTabsFailed'));
    }
  }

  /**
   * Handle mark task as fixed
   */
  async handleMarkFixed(taskId) {
    try {
      const response = await this.controller.sendMessage('updateTask', {
        id: taskId,
        updates: { status: 'fixed' }
      });

      if (response?.success) {
        notifications.success(t('sidepanel_detail_markedFixed'));
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || t('sidepanel_detail_updateTaskFailed'));
      }
    } catch (error) {
      console.error('Failed to mark task as fixed:', error);
      notifications.error(t('sidepanel_detail_updateTaskFailed'));
    }
  }

  /**
   * Handle toggle folder expansion
   */
  handleToggleFolder(folderId) {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }

    // Update UI
    const folderCard = this.container.querySelector(`[data-folder-id="${folderId}"]`);
    if (folderCard) {
      const toggle = folderCard.querySelector('.folder-toggle');
      const tabs = folderCard.querySelector('.folder-tabs');
      const isExpanded = this.expandedFolders.has(folderId);

      if (toggle) toggle.textContent = isExpanded ? '▼' : '▶';
      if (tabs) tabs.className = `folder-tabs ${isExpanded ? 'expanded' : 'collapsed'}`;
    }
  }

  /**
   * Handle save tab note
   */
  async handleSaveTabNote(textarea) {
    try {
      const tabId = textarea.dataset.tabId;
      const note = textarea.value.trim();

      const response = await this.controller.sendMessage('updateTab', {
        id: tabId,
        updates: { note: note || null }
      });

      if (response?.success) {
        // Show subtle success indicator
        textarea.style.borderColor = 'var(--success-color)';
        setTimeout(() => {
          textarea.style.borderColor = '';
        }, 1000);
      } else {
        throw new Error(response?.error || t('sidepanel_detail_saveNoteFailed'));
      }
    } catch (error) {
      console.error('Failed to save tab note:', error);
      notifications.error(t('sidepanel_detail_saveNoteFailed'));
    }
  }

  /**
   * Handle focus window
   */
  /**
   * Sync collection from Chrome window and refresh view
   */
  async handleSyncCollection() {
    try {
      // Show loading state
      notifications.info(t('sidepanel_detail_syncing'));

      // Call background to sync
      const response = await this.controller.sendMessage('syncCollectionFromWindow', {
        collectionId: this.currentCollectionId
      });

      if (response && response.success) {
        const changes = response.tabsAdded + response.tabsRemoved + response.tabsUpdated;

        if (changes === 0) {
          notifications.success(t('sidepanel_detail_upToDate'));
        } else {
          notifications.success(t('sidepanel_detail_refreshed', [String(response.tabsAdded), String(response.tabsUpdated), String(response.tabsRemoved)]));
        }

        // Refresh the view to show updated data
        await this.show(this.currentCollectionId);
      } else {
        notifications.error(response?.reason || t('sidepanel_detail_syncFailed'));
      }
    } catch (error) {
      console.error('Failed to sync collection:', error);
      notifications.error(t('sidepanel_detail_syncCollectionFailed'));
    }
  }

  async handleFocusWindow() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection || !collection.windowId) {
        notifications.error(t('sidepanel_detail_windowNotFound'));
        return;
      }

      await chrome.windows.update(collection.windowId, { focused: true });
      notifications.success(t('sidepanel_detail_windowFocused'));
    } catch (error) {
      console.error('Failed to focus window:', error);
      notifications.error(t('sidepanel_detail_focusWindowFailed'));
    }
  }

  /**
   * Handle close window
   */
  async handleCloseWindow() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection || !collection.windowId) {
        notifications.error(t('sidepanel_detail_windowNotFound'));
        return;
      }

      await chrome.windows.remove(collection.windowId);
      notifications.success(t('sidepanel_detail_windowClosedSaved'));
      this.hide();
      await this.controller.loadData();
    } catch (error) {
      console.error('Failed to close window:', error);
      notifications.error(t('sidepanel_detail_closeWindowFailed'));
    }
  }

  /**
   * Handle open collection
   */
  async handleOpenCollection() {
    try {
      const result = await this.controller.sendMessage('restoreCollection', {
        collectionId: this.currentCollectionId,
        createNewWindow: true,
        focused: true
      });

      if (result?.success) {
        notifications.success(t('sidepanel_detail_openedNewWindow'));
        // Reload collection to show updated active state
        await this.show(this.currentCollectionId);
      } else {
        notifications.error(t('sidepanel_detail_openCollectionFailed'));
      }
    } catch (error) {
      console.error('Failed to open collection:', error);
      notifications.error(t('sidepanel_detail_openCollectionFailed'));
    }
  }

  /**
   * Handle edit collection
   */
  async handleEditCollection() {
    try {
      const collection = await this.loadCollection(this.currentCollectionId);
      if (!collection) {
        notifications.error(t('sidepanel_detail_notFound'));
        return;
      }

      const form = this.createCollectionEditForm(collection);

      modal.open({
        title: t('sidepanel_detail_editCollectionTitle'),
        content: form,
        size: 'medium',
        actions: [
          {
            label: t('common_cancel'),
            variant: 'secondary',
            autoClose: true
          },
          {
            label: t('common_save'),
            variant: 'primary',
            onClick: async () => {
              await this.saveCollectionEdits(form);
            }
          }
        ]
      });
    } catch (error) {
      console.error('Failed to edit collection:', error);
      notifications.error(t('sidepanel_detail_editCollectionFailed'));
    }
  }

  /**
   * Create collection edit form
   */
  createCollectionEditForm(collection) {
    const form = document.createElement('form');
    form.className = 'collection-edit-form';
    form.innerHTML = `
      <div class="form-group">
        <label for="edit-name">${t('sidepanel_detail_form_nameLabel')}</label>
        <input
          type="text"
          id="edit-name"
          name="name"
          value="${this.escapeHtml(collection.name || '')}"
          required
          class="form-input"
        >
      </div>

      <div class="form-group">
        <label for="edit-description">${t('sidepanel_detail_form_descriptionLabel')}</label>
        <textarea
          id="edit-description"
          name="description"
          class="form-textarea"
          rows="3"
        >${this.escapeHtml(collection.description || '')}</textarea>
      </div>

      <div class="form-group" id="icon-group">
        <label for="edit-icon">${t('sidepanel_detail_form_iconLabel')}</label>
      </div>

      <div class="form-group">
        <label for="edit-tags">${t('sidepanel_detail_form_collectionTagsLabel')}</label>
        <input
          type="text"
          id="edit-tags"
          name="tags"
          value="${collection.tags ? collection.tags.join(', ') : ''}"
          class="form-input"
          placeholder="${this.escapeHtml(t('sidepanel_detail_form_collectionTagsPlaceholder'))}"
        >
      </div>
    `;

    // Add emoji picker component
    const emojiPicker = new EmojiPicker({
      inputId: 'edit-icon',
      initialEmoji: collection.icon || '📁'
    });

    const iconGroup = form.querySelector('#icon-group');
    iconGroup.appendChild(emojiPicker.create());

    return form;
  }

  /**
   * Save collection edits
   */
  async saveCollectionEdits(form) {
    try {
      const formData = new FormData(form);
      const updates = {
        name: formData.get('name'),
        description: formData.get('description') || null,
        icon: formData.get('icon') || '📁',
        tags: formData.get('tags')
          ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t)
          : []
      };

      const response = await this.controller.sendMessage('updateCollection', {
        id: this.currentCollectionId,
        updates
      });

      if (response?.success) {
        notifications.success(t('sidepanel_detail_collectionUpdated'));
        await this.show(this.currentCollectionId); // Refresh view
      } else {
        throw new Error(response?.error || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to save collection:', error);
      notifications.error(t('sidepanel_detail_saveChangesFailed'));
      throw error;
    }
  }

  /**
   * Phase 8: Handle save settings
   */
  async handleSaveSettings() {
    try {
      // Get current values from form
      const trackingEnabled = this.container.querySelector('[data-setting="trackingEnabled"]').checked;
      const syncDebounceMs = parseInt(this.container.querySelector('[data-setting="syncDebounceMs"]').value);

      const settings = {
        trackingEnabled,
        syncDebounceMs
      };

      // Send update to background
      const response = await this.controller.sendMessage('updateCollectionSettings', {
        collectionId: this.currentCollectionId,
        settings
      });

      if (response?.success) {
        notifications.success(t('sidepanel_detail_settingsSaved'));
        // Refresh view to show updated settings
        await this.show(this.currentCollectionId);
      } else {
        throw new Error(response?.error || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      notifications.error(t('sidepanel_detail_saveSettingsFailed'));
    }
  }

  /**
   * Format date/time
   */
  formatDateTime(timestamp) {
    if (!timestamp) return t('sidepanel_time_never');
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Phase 11: Tab chip rendering moved to TabChipRenderer component
  // See: /sidepanel/components/tab-chip-renderer.js
}
