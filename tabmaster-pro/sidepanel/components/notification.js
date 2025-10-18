/**
 * Notification System for Side Panel
 *
 * Displays toast notifications with auto-dismiss and queue management.
 * Supports success, error, and info variants.
 */

class NotificationManager {
  constructor() {
    this.container = null;
    this.queue = [];
    this.activeNotifications = new Set();
    this.defaultDuration = 3000; // 3 seconds
  }

  /**
   * Initialize the notification system
   */
  init() {
    this.container = document.getElementById('notification-container');
    if (!this.container) {
      console.error('Notification container not found');
    }
  }

  /**
   * Show a success notification
   */
  success(message, duration = this.defaultDuration) {
    return this.show(message, 'success', duration);
  }

  /**
   * Show an error notification
   */
  error(message, duration = this.defaultDuration) {
    return this.show(message, 'error', duration);
  }

  /**
   * Show an info notification
   */
  info(message, duration = this.defaultDuration) {
    return this.show(message, 'info', duration);
  }

  /**
   * Show a notification
   */
  show(message, type = 'info', duration = this.defaultDuration) {
    if (!this.container) {
      console.error('Notification system not initialized');
      return null;
    }

    const notification = this.createNotification(message, type);
    this.container.appendChild(notification);
    this.activeNotifications.add(notification);

    // Animate in
    requestAnimationFrame(() => {
      notification.classList.add('notification-enter');
    });

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(() => {
        this.dismiss(notification);
      }, duration);
    }

    return notification;
  }

  /**
   * Create notification element
   */
  createNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');

    const icon = this.getIcon(type);
    const messageEl = document.createElement('span');
    messageEl.className = 'notification-message';
    messageEl.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', () => {
      this.dismiss(notification);
    });

    notification.innerHTML = `
      <span class="notification-icon">${icon}</span>
    `;
    notification.appendChild(messageEl);
    notification.appendChild(closeBtn);

    return notification;
  }

  /**
   * Get icon for notification type
   */
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || icons.info;
  }

  /**
   * Dismiss a notification
   */
  dismiss(notification) {
    if (!this.activeNotifications.has(notification)) {
      return;
    }

    notification.classList.remove('notification-enter');
    notification.classList.add('notification-exit');

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      this.activeNotifications.delete(notification);
    }, 300); // Match CSS animation duration
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    this.activeNotifications.forEach(notification => {
      this.dismiss(notification);
    });
  }
}

// Notification styles (to be added to panel.css)
const notificationStyles = `
.notification {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  min-width: 300px;
  max-width: 350px;
  opacity: 0;
  transform: translateX(100%);
  transition: opacity 0.3s, transform 0.3s;
}

.notification-enter {
  opacity: 1;
  transform: translateX(0);
}

.notification-exit {
  opacity: 0;
  transform: translateX(100%);
}

.notification-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.notification-message {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.4;
}

.notification-close {
  background: transparent;
  border: none;
  font-size: 24px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  flex-shrink: 0;
}

.notification-close:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.notification-success {
  border-left: 4px solid var(--success-color);
}

.notification-success .notification-icon {
  color: var(--success-color);
}

.notification-error {
  border-left: 4px solid var(--error-color);
}

.notification-error .notification-icon {
  color: var(--error-color);
}

.notification-info {
  border-left: 4px solid var(--info-color);
}

.notification-info .notification-icon {
  color: var(--info-color);
}
`;

// Export singleton instance
export const notifications = new NotificationManager();

// Export class for testing
export { NotificationManager };
