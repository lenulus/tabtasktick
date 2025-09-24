// Snooze Modal Component for TabMaster Pro
// Provides enhanced snooze interface with smart presets and custom scheduling

class SnoozeModal {
  constructor() {
    this.modal = null;
    this.backdrop = null;
    this.selectedTabs = [];
    this.onSnooze = null;
    this.onCancel = null;
    
    // Smart presets configuration
    this.presets = [
      {
        id: 'tomorrow',
        label: 'Tomorrow',
        sublabel: '9 AM',
        icon: '🌅',
        getTime: () => {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          return tomorrow.getTime();
        }
      },
      {
        id: 'after_lunch',
        label: 'After Lunch',
        sublabel: this.getAfterLunchTime(),
        icon: '🍽️',
        getTime: () => {
          const now = new Date();
          const lunch = new Date();
          
          // If before noon, set to today 1 PM
          if (now.getHours() < 12) {
            lunch.setHours(13, 0, 0, 0);
          } else if (now.getHours() < 13) {
            // If during lunch hour, set to 2 PM
            lunch.setHours(14, 0, 0, 0);
          } else {
            // If after lunch, set to tomorrow 1 PM
            lunch.setDate(lunch.getDate() + 1);
            lunch.setHours(13, 0, 0, 0);
          }
          
          return lunch.getTime();
        }
      },
      {
        id: 'end_of_day',
        label: 'End of Day',
        sublabel: this.getEndOfDayTime(),
        icon: '🌙',
        getTime: () => {
          const endOfDay = new Date();
          
          // If already past 5 PM, set to tomorrow
          if (endOfDay.getHours() >= 17) {
            endOfDay.setDate(endOfDay.getDate() + 1);
          }
          
          endOfDay.setHours(17, 0, 0, 0);
          return endOfDay.getTime();
        }
      },
      {
        id: 'next_week',
        label: 'Next Week',
        sublabel: 'Same time',
        icon: '📅',
        getTime: () => {
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);
          return nextWeek.getTime();
        }
      },
      {
        id: 'one_hour',
        label: 'In 1 Hour',
        sublabel: '',
        icon: '⏰',
        getTime: () => Date.now() + (60 * 60 * 1000)
      },
      {
        id: 'monday',
        label: 'Monday',
        sublabel: '9 AM',
        icon: '🔄',
        getTime: () => {
          const monday = new Date();
          const today = monday.getDay();
          const daysUntilMonday = today === 0 ? 1 : (8 - today) % 7;
          
          if (daysUntilMonday === 0 && monday.getHours() >= 9) {
            // If it's Monday and past 9 AM, go to next Monday
            monday.setDate(monday.getDate() + 7);
          } else {
            monday.setDate(monday.getDate() + daysUntilMonday);
          }
          
          monday.setHours(9, 0, 0, 0);
          return monday.getTime();
        }
      }
    ];
  }
  
  getAfterLunchTime() {
    const now = new Date();
    if (now.getHours() < 12) {
      return '1 PM';
    } else if (now.getHours() < 13) {
      return '2 PM';
    } else {
      return 'Tomorrow 1 PM';
    }
  }
  
  getEndOfDayTime() {
    const now = new Date();
    if (now.getHours() >= 17) {
      return 'Tomorrow 5 PM';
    } else {
      return '5 PM';
    }
  }
  
  show(selectedTabs = []) {
    this.selectedTabs = selectedTabs;
    this.create();
    this.attachEventListeners();
    
    // Show modal with animation
    requestAnimationFrame(() => {
      this.backdrop.classList.add('show');
      this.modal.classList.add('show');
    });
    
    // Focus first preset button
    const firstButton = this.modal.querySelector('.preset-button');
    if (firstButton) {
      firstButton.focus();
    }
  }
  
  hide() {
    if (!this.modal) return;
    
    this.backdrop.classList.remove('show');
    this.modal.classList.remove('show');
    
    setTimeout(() => {
      this.destroy();
    }, 300);
  }
  
  create() {
    // Create backdrop
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'snooze-backdrop';
    
    // Create modal
    this.modal = document.createElement('div');
    this.modal.className = 'snooze-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-labelledby', 'snooze-title');
    this.modal.setAttribute('aria-describedby', 'snooze-description');
    
    const tabCount = this.selectedTabs.length || 1;
    const tabText = tabCount === 1 ? 'Tab' : `${tabCount} Tabs`;
    
    this.modal.innerHTML = `
      <div class="snooze-header">
        <h2 id="snooze-title">Snooze ${tabText}</h2>
        <button class="snooze-close" aria-label="Close dialog">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      
      <div class="snooze-content">
        <div class="snooze-presets">
          <h3>Quick Presets</h3>
          <div class="preset-grid">
            ${this.presets.map(preset => `
              <button class="preset-button" data-preset-id="${preset.id}">
                <span class="preset-icon">${preset.icon}</span>
                <span class="preset-label">${preset.label}</span>
                ${preset.sublabel ? `<span class="preset-sublabel">${preset.sublabel}</span>` : ''}
              </button>
            `).join('')}
          </div>
        </div>
        
        <div class="snooze-custom">
          <h3>Custom Time</h3>
          <div class="custom-inputs">
            <div class="input-group">
              <label for="snooze-date">Date</label>
              <input type="date" id="snooze-date" min="${this.getMinDate()}">
            </div>
            <div class="input-group">
              <label for="snooze-time">Time</label>
              <input type="time" id="snooze-time">
            </div>
          </div>
          <div class="custom-preview" id="custom-preview"></div>
        </div>
        
        ${tabCount > 1 ? `
          <div class="snooze-info" id="snooze-description">
            <span class="info-icon">💡</span>
            <span>Snoozing ${tabCount} selected tabs together</span>
          </div>
        ` : ''}
      </div>
      
      <div class="snooze-footer">
        <button class="snooze-button secondary" id="snooze-cancel">Cancel</button>
        <button class="snooze-button primary" id="snooze-confirm" disabled>Snooze ${tabText}</button>
      </div>
    `;
    
    // Add to DOM
    document.body.appendChild(this.backdrop);
    document.body.appendChild(this.modal);
  }
  
  destroy() {
    if (this.backdrop) {
      this.backdrop.remove();
      this.backdrop = null;
    }
    
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
  
  attachEventListeners() {
    // Close button
    this.modal.querySelector('.snooze-close').addEventListener('click', () => {
      this.handleCancel();
    });
    
    // Cancel button
    this.modal.querySelector('#snooze-cancel').addEventListener('click', () => {
      this.handleCancel();
    });
    
    // Confirm button
    this.modal.querySelector('#snooze-confirm').addEventListener('click', () => {
      this.handleConfirm();
    });
    
    // Backdrop click
    this.backdrop.addEventListener('click', () => {
      this.handleCancel();
    });
    
    // Preset buttons
    this.modal.querySelectorAll('.preset-button').forEach(button => {
      button.addEventListener('click', (e) => {
        this.handlePresetSelect(e.currentTarget.dataset.presetId);
      });
    });
    
    // Custom date/time inputs
    const dateInput = this.modal.querySelector('#snooze-date');
    const timeInput = this.modal.querySelector('#snooze-time');
    
    dateInput.addEventListener('change', () => this.handleCustomChange());
    timeInput.addEventListener('change', () => this.handleCustomChange());
    
    // Keyboard events
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.handleCancel();
      }
    });
    
    // Trap focus within modal
    this.trapFocus();
  }
  
  trapFocus() {
    const focusableElements = this.modal.querySelectorAll(
      'button, input, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    this.modal.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });
  }
  
  handlePresetSelect(presetId) {
    const preset = this.presets.find(p => p.id === presetId);
    if (!preset) return;
    
    // Clear custom selection
    this.clearCustomInputs();
    
    // Highlight selected preset
    this.modal.querySelectorAll('.preset-button').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.presetId === presetId);
    });
    
    // Store selected time
    this.selectedTime = preset.getTime();
    this.selectedPresetId = presetId;
    
    // Enable confirm button
    const confirmBtn = this.modal.querySelector('#snooze-confirm');
    confirmBtn.disabled = false;
    
    // Update preview
    this.updatePreview(this.selectedTime);
  }
  
  handleCustomChange() {
    const dateInput = this.modal.querySelector('#snooze-date');
    const timeInput = this.modal.querySelector('#snooze-time');
    
    if (!dateInput.value || !timeInput.value) return;
    
    // Clear preset selection
    this.modal.querySelectorAll('.preset-button').forEach(btn => {
      btn.classList.remove('selected');
    });
    
    // Calculate timestamp
    const date = new Date(dateInput.value + 'T' + timeInput.value);
    const timestamp = date.getTime();
    
    // Validate not in past
    if (timestamp <= Date.now()) {
      this.showError('Please select a future time');
      this.modal.querySelector('#snooze-confirm').disabled = true;
      return;
    }
    
    this.selectedTime = timestamp;
    this.selectedPresetId = null;
    
    // Enable confirm button
    this.modal.querySelector('#snooze-confirm').disabled = false;
    
    // Update preview
    this.updatePreview(timestamp);
  }
  
  updatePreview(timestamp) {
    const preview = this.modal.querySelector('#custom-preview');
    const date = new Date(timestamp);
    const options = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric', 
      hour: 'numeric', 
      minute: '2-digit' 
    };
    
    const formatted = date.toLocaleString('en-US', options);
    const relative = this.getRelativeTime(timestamp);
    
    preview.innerHTML = `
      <span class="preview-absolute">${formatted}</span>
      <span class="preview-relative">(${relative})</span>
    `;
  }
  
  getRelativeTime(timestamp) {
    const diff = timestamp - Date.now();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    return `in ${minutes} minute${minutes > 1 ? 's' : ''}`;
  }
  
  clearCustomInputs() {
    const dateInput = this.modal.querySelector('#snooze-date');
    const timeInput = this.modal.querySelector('#snooze-time');
    const preview = this.modal.querySelector('#custom-preview');
    
    dateInput.value = '';
    timeInput.value = '';
    preview.innerHTML = '';
  }
  
  showError(message) {
    const preview = this.modal.querySelector('#custom-preview');
    preview.innerHTML = `<span class="error-message">${message}</span>`;
  }
  
  getMinDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  handleConfirm() {
    if (!this.selectedTime || !this.onSnooze) return;
    
    const snoozeData = {
      timestamp: this.selectedTime,
      presetId: this.selectedPresetId,
      tabIds: this.selectedTabs.map(tab => tab.id),
      tabCount: this.selectedTabs.length || 1
    };
    
    this.onSnooze(snoozeData);
    this.hide();
  }
  
  handleCancel() {
    if (this.onCancel) {
      this.onCancel();
    }
    this.hide();
  }
}

// Export for use in other files
window.SnoozeModal = SnoozeModal;