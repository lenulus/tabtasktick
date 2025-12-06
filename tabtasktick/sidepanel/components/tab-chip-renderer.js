/**
 * Tab Chip Renderer Component
 *
 * Shared UI component for rendering tab association chips across all surfaces.
 * Phase 11: Tab-Task Association
 *
 * ARCHITECTURAL NOTE: This component consolidates duplicate rendering logic
 * that was previously in panel.js, tasks-view.js, and collection-detail.js.
 * Single source of truth for tab chip UI.
 */

import {
  getCurrentTabSnapshot,
  formatTabTitle,
  getFallbackFavicon,
  isTabOpen
} from '../../services/utils/tab-snapshot.js';
import { notifications } from './notification.js';

export class TabChipRenderer {
  /**
   * Render tab chip (linked state)
   *
   * @param {Object} tabSnapshot - Tab snapshot object
   * @param {Function} escapeHtml - HTML escaping function
   * @returns {string} HTML string
   */
  static renderTabChip(tabSnapshot, escapeHtml) {
    const favicon = tabSnapshot.favIconUrl || getFallbackFavicon(tabSnapshot.url);
    const title = formatTabTitle(tabSnapshot.title || tabSnapshot.url, 35);
    const isActive = tabSnapshot.isOpen !== false; // Assume open if not checked

    return `
      <div class="tab-chip ${isActive ? 'active' : 'inactive'}" data-tab-snapshot='${JSON.stringify(tabSnapshot).replace(/'/g, '&#39;')}'>
        <img class="favicon" src="${escapeHtml(favicon)}" width="16" height="16" alt="">
        <span class="tab-title">${escapeHtml(title)}</span>
        ${!isActive ? '<span class="status-badge">Closed</span>' : ''}
        <button type="button" class="remove-btn" aria-label="Remove tab association" title="Remove tab association">×</button>
      </div>
    `;
  }

  /**
   * Render empty tab state (unlinked)
   *
   * @returns {string} HTML string
   */
  static renderEmptyTabState() {
    return `
      <button type="button" class="add-current-tab-btn subtle" id="add-current-tab-btn">
        <span class="icon">🔗</span>
        <span>Link to current tab</span>
      </button>
    `;
  }

  /**
   * Render tab references with status checking (for edit modals)
   *
   * @param {Array} tabReferences - Array of tab snapshots
   * @param {Function} escapeHtml - HTML escaping function
   * @returns {Promise<string>} HTML string
   */
  static async renderTabReferences(tabReferences, escapeHtml) {
    if (!tabReferences || tabReferences.length === 0) {
      return this.renderEmptyTabState();
    }

    // Check which tabs are still open
    const referencesWithStatus = await Promise.all(
      tabReferences.map(async (ref) => ({
        ...ref,
        isOpen: await isTabOpen(ref.chromeTabId)
      }))
    );

    return referencesWithStatus.map(ref => this.renderTabChip(ref, escapeHtml)).join('');
  }

  /**
   * Setup tab chip interaction handlers
   *
   * @param {HTMLElement|string} container - Container element or selector
   * @param {Array} initialReferences - Initial tab references
   * @param {Function} escapeHtml - HTML escaping function
   * @param {Object} options - Options
   * @param {boolean} options.multipleMode - Allow multiple tabs (default: true for edit, false for create)
   */
  static setupTabChipHandlers(container, initialReferences = [], escapeHtml, options = {}) {
    const { multipleMode = true } = options;

    const containerEl = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!containerEl) {
      return;
    }

    let currentReferences = [...initialReferences];

    // Store references in container for access during form submission
    containerEl.dataset.tabReferences = JSON.stringify(currentReferences);

    // Handle clicks on container (event delegation)
    containerEl.addEventListener('click', async (e) => {
      // Handle remove button click
      const removeBtn = e.target.closest('.remove-btn');
      if (removeBtn) {
        const chip = removeBtn.closest('.tab-chip');
        if (chip) {
          try {
            const tabSnapshot = JSON.parse(chip.dataset.tabSnapshot);
            // Remove this reference from array
            currentReferences = currentReferences.filter(
              ref => ref.chromeTabId !== tabSnapshot.chromeTabId
            );
            containerEl.dataset.tabReferences = JSON.stringify(currentReferences);

            // Re-render
            containerEl.innerHTML = currentReferences.length > 0
              ? currentReferences.map(ref => this.renderTabChip(ref, escapeHtml)).join('')
              : this.renderEmptyTabState();
          } catch (error) {
            console.warn('[TabChipRenderer] Failed to parse tab snapshot:', error);
          }
        }
        return;
      }

      // Handle add current tab button click
      const addBtn = e.target.closest('.add-current-tab-btn');
      if (addBtn) {
        const snapshot = await getCurrentTabSnapshot();
        if (snapshot) {
          // Check if already exists
          const exists = currentReferences.some(ref => ref.chromeTabId === snapshot.chromeTabId);

          if (!exists) {
            if (multipleMode) {
              // Add to array
              currentReferences.push(snapshot);
            } else {
              // Replace (single mode)
              currentReferences = [snapshot];
            }

            containerEl.dataset.tabReferences = JSON.stringify(currentReferences);
            containerEl.innerHTML = currentReferences.map(ref => this.renderTabChip(ref, escapeHtml)).join('');
          } else {
            notifications.show('This tab is already linked', 'info');
          }
        } else {
          notifications.show('No active tab found', 'warning');
        }
      }
    });
  }

  /**
   * Render tab reference badge for task cards (clickable)
   *
   * @param {Array} tabReferences - Tab references
   * @param {string} taskId - Task ID for click handler
   * @param {Function} escapeHtml - HTML escaping function
   * @returns {string} HTML string
   */
  static renderTabReferenceBadge(tabReferences, taskId, escapeHtml) {
    if (!tabReferences || tabReferences.length === 0) {
      return '';
    }

    const tabCount = tabReferences.length;
    const tabWord = tabCount === 1 ? 'tab' : 'tabs';
    const firstRef = tabReferences[0];
    const favicon = firstRef.favIconUrl || getFallbackFavicon(firstRef.url);

    return `
      <button type="button" class="tab-reference-badge" data-action="open-tabs" data-task-id="${taskId}" title="Open ${tabCount} associated ${tabWord}">
        <img class="favicon" src="${escapeHtml(favicon)}" width="12" height="12" alt="">
        <span class="tab-count">${tabCount} ${tabWord}</span>
      </button>
    `;
  }
}
