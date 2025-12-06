// Phase 8.3: Load snooze formatters for SnoozeModal component
// Separate module file to comply with CSP (no inline scripts allowed)

import { formatSnoozeTitle, formatSnoozeDescription } from '../services/utils/snoozeFormatters.js';

// Expose to window for SnoozeModal component to use
window.formatSnoozeTitle = formatSnoozeTitle;
window.formatSnoozeDescription = formatSnoozeDescription;
