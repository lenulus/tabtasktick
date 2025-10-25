/**
 * Modal Service - Centralized modal management
 *
 * Eliminates duplicate modal creation logic across views.
 * Provides consistent modal behavior, lifecycle management, and event handling.
 *
 * Architecture Compliance:
 * - Services-First: Modal logic centralized in reusable service
 * - No Duplication: Single source of truth for modal behavior
 * - Deterministic: Same config → same modal structure
 */

class ModalService {
  constructor() {
    this.modals = new Map();
  }

  /**
   * Create a modal with the specified configuration
   * @param {Object} config - Modal configuration
   * @param {string} config.id - Unique modal identifier
   * @param {string} config.title - Modal title
   * @param {string} [config.size='md'] - Modal size: 'sm', 'md', 'lg'
   * @param {string} config.body - Modal body HTML content
   * @param {string} [config.footer] - Optional modal footer HTML
   * @param {Function} [config.onClose] - Optional callback when modal closes
   * @param {Object} [config.events] - Optional event handlers map
   * @returns {HTMLElement} The created modal element
   */
  create(config) {
    const { id, title, size = 'md', body, footer, onClose, events = {} } = config;

    // Return existing modal if already created
    if (this.modals.has(id)) {
      return this.modals.get(id);
    }

    const modal = this.buildModal({ id, title, size, body, footer });
    this.modals.set(id, { element: modal, onClose, events });
    this.attachEventListeners(modal, id, onClose, events);

    return modal;
  }

  /**
   * Build modal DOM structure
   * @private
   */
  buildModal({ id, title, size, body, footer }) {
    const modal = document.createElement('div');
    modal.id = id;
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content modal-${size}">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="close-btn" data-modal-close="${id}">&times;</button>
        </div>
        <div class="modal-body">
          ${body}
        </div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  /**
   * Attach event listeners to modal
   * @private
   */
  attachEventListeners(modal, id, onClose, events) {
    // Close button
    const closeBtn = modal.querySelector(`[data-modal-close="${id}"]`);
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hide(id);
        if (onClose) onClose();
      });
    }

    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hide(id);
        if (onClose) onClose();
      }
    });

    // Custom event handlers
    Object.entries(events).forEach(([selector, handler]) => {
      const element = modal.querySelector(selector);
      if (element) {
        element.addEventListener('click', handler);
      }
    });
  }

  /**
   * Show a modal by ID
   * @param {string} id - Modal identifier
   */
  show(id) {
    const modalData = this.modals.get(id);
    if (modalData) {
      modalData.element.style.display = 'flex';
    }
  }

  /**
   * Hide a modal by ID
   * @param {string} id - Modal identifier
   */
  hide(id) {
    const modalData = this.modals.get(id);
    if (modalData) {
      modalData.element.style.display = 'none';
    }
  }

  /**
   * Update modal body content
   * @param {string} id - Modal identifier
   * @param {string} bodyHtml - New body HTML content
   */
  updateBody(id, bodyHtml) {
    const modalData = this.modals.get(id);
    if (modalData) {
      const body = modalData.element.querySelector('.modal-body');
      if (body) {
        body.innerHTML = bodyHtml;
      }
    }
  }

  /**
   * Update modal title
   * @param {string} id - Modal identifier
   * @param {string} title - New title
   */
  updateTitle(id, title) {
    const modalData = this.modals.get(id);
    if (modalData) {
      const titleElement = modalData.element.querySelector('.modal-header h3');
      if (titleElement) {
        titleElement.textContent = title;
      }
    }
  }

  /**
   * Get modal element by ID
   * @param {string} id - Modal identifier
   * @returns {HTMLElement|null} The modal element or null if not found
   */
  get(id) {
    const modalData = this.modals.get(id);
    return modalData ? modalData.element : null;
  }

  /**
   * Check if modal exists
   * @param {string} id - Modal identifier
   * @returns {boolean} True if modal exists
   */
  exists(id) {
    return this.modals.has(id);
  }

  /**
   * Destroy a modal and remove from DOM
   * @param {string} id - Modal identifier
   */
  destroy(id) {
    const modalData = this.modals.get(id);
    if (modalData) {
      modalData.element.remove();
      this.modals.delete(id);
    }
  }

  /**
   * Destroy all modals
   */
  destroyAll() {
    this.modals.forEach((modalData, id) => {
      modalData.element.remove();
    });
    this.modals.clear();
  }
}

// Export singleton instance
export default new ModalService();
