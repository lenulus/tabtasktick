/**
 * Modal Component for Side Panel
 *
 * Reusable modal dialog with:
 * - Backdrop click to close
 * - ESC key handling
 * - Focus trap for accessibility
 * - Custom content support
 */

class ModalManager {
  constructor() {
    this.container = null;
    this.activeModal = null;
    this.previousFocus = null;
    this.focusableElements = [];
  }

  /**
   * Initialize the modal system
   */
  init() {
    this.container = document.getElementById('modal-container');
    if (!this.container) {
      console.error('Modal container not found');
      return;
    }

    // Backdrop click handler
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });

    // ESC key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.activeModal) {
        this.close();
      }
    });
  }

  /**
   * Open a modal
   */
  open(options = {}) {
    if (!this.container) {
      console.error('Modal system not initialized');
      return null;
    }

    const {
      title = '',
      content = '',
      actions = [],
      onClose = null,
      closeOnBackdrop = true,
      size = 'medium' // small, medium, large
    } = options;

    // Store previous focus
    this.previousFocus = document.activeElement;

    // Create modal
    const modal = this.createModal({ title, content, actions, size });
    this.activeModal = { element: modal, onClose, closeOnBackdrop };

    // Clear container and add modal
    this.container.innerHTML = '';
    this.container.appendChild(modal);
    this.container.classList.remove('hidden');

    // Setup focus trap
    this.setupFocusTrap(modal);

    // Focus first focusable element
    requestAnimationFrame(() => {
      this.focusFirst();
    });

    return modal;
  }

  /**
   * Create modal element
   */
  createModal({ title, content, actions, size }) {
    const modal = document.createElement('div');
    modal.className = `modal modal-${size}`;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    if (title) {
      modal.setAttribute('aria-labelledby', 'modal-title');
    }

    let html = '';

    // Header
    if (title) {
      html += `
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">${this.escapeHtml(title)}</h2>
          <button
            class="modal-close"
            aria-label="Close dialog"
            type="button"
          >×</button>
        </div>
      `;
    }

    // Content
    html += `
      <div class="modal-content">
        ${typeof content === 'string' ? content : ''}
      </div>
    `;

    // Actions
    if (actions.length > 0) {
      html += '<div class="modal-actions">';
      actions.forEach(action => {
        const {
          label = 'OK',
          variant = 'primary',
          onClick = null,
          autoClose = true
        } = action;

        const btnClass = `btn btn-${variant}`;
        html += `<button class="${btnClass}" data-action="${this.escapeHtml(label)}">${this.escapeHtml(label)}</button>`;
      });
      html += '</div>';
    }

    modal.innerHTML = html;

    // Attach event listeners
    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Action button handlers
    actions.forEach((action, index) => {
      const btn = modal.querySelectorAll('.modal-actions button')[index];
      if (btn && action.onClick) {
        btn.addEventListener('click', async () => {
          try {
            await action.onClick();
            if (action.autoClose !== false) {
              this.close();
            }
          } catch (error) {
            console.error('Modal action error:', error);
          }
        });
      } else if (btn) {
        btn.addEventListener('click', () => {
          if (action.autoClose !== false) {
            this.close();
          }
        });
      }
    });

    // If content is a DOM element, append it
    if (content instanceof HTMLElement) {
      const contentEl = modal.querySelector('.modal-content');
      contentEl.innerHTML = '';
      contentEl.appendChild(content);
    }

    return modal;
  }

  /**
   * Close the active modal
   */
  close() {
    if (!this.activeModal) {
      return;
    }

    const { onClose } = this.activeModal;

    // Call onClose callback
    if (typeof onClose === 'function') {
      try {
        onClose();
      } catch (error) {
        console.error('Modal onClose error:', error);
      }
    }

    // Hide container
    this.container.classList.add('hidden');
    this.container.innerHTML = '';

    // Restore focus
    if (this.previousFocus) {
      this.previousFocus.focus();
      this.previousFocus = null;
    }

    this.activeModal = null;
    this.focusableElements = [];
  }

  /**
   * Setup focus trap
   */
  setupFocusTrap(modal) {
    // Get all focusable elements
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    this.focusableElements = Array.from(modal.querySelectorAll(focusableSelector));

    if (this.focusableElements.length === 0) {
      return;
    }

    // Trap focus within modal
    modal.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') {
        return;
      }

      const firstElement = this.focusableElements[0];
      const lastElement = this.focusableElements[this.focusableElements.length - 1];

      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault();
        lastElement.focus();
      } else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault();
        firstElement.focus();
      }
    });
  }

  /**
   * Focus first focusable element
   */
  focusFirst() {
    if (this.focusableElements.length > 0) {
      this.focusableElements[0].focus();
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Check if a modal is currently open
   */
  isOpen() {
    return this.activeModal !== null;
  }
}

// Modal styles (to be added to panel.css)
const modalStyles = `
.modal {
  background: white;
  border-radius: 8px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.modal-small {
  width: 90%;
  max-width: 400px;
}

.modal-medium {
  width: 90%;
  max-width: 600px;
}

.modal-large {
  width: 90%;
  max-width: 800px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  background: transparent;
  border: none;
  font-size: 28px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
}

.modal-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.modal-content {
  padding: 20px;
  flex: 1;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
}
`;

// Export singleton instance
export const modal = new ModalManager();

// Export class for testing
export { ModalManager };
