# TabMaster Pro - Export/Import Guide

## Export Feature

The export feature creates a comprehensive backup of your TabMaster Pro data and current browser session.

### What Gets Exported

When you click the Export button, TabMaster Pro exports:

#### 1. **Current Browser Session**
- All open tabs with their:
  - URLs and titles
  - Favicon URLs
  - Window and group associations
  - Pin status
  - Active/audible states
  - Tab relationships (which tab opened which)
- All tab groups with:
  - Names and colors
  - Collapsed states
- All browser windows with:
  - Window types and states
  - Focus status

#### 2. **Extension Settings**
- All your custom rules
- General settings (snooze duration, thresholds, etc.)
- Whitelist domains
- Performance settings

#### 3. **TabMaster Data**
- Currently snoozed tabs with wake times
- Usage statistics (tabs closed, grouped, etc.)
- Custom tab groups created

### Export File Format

The export creates a JSON file named: `tabmaster-export-YYYY-MM-DD.json`

Example structure:
```json
{
  "version": "1.0.0",
  "exportDate": "2024-01-15T10:30:00Z",
  "browser": "Chrome/120.0.0.0",
  "currentSession": {
    "tabCount": 156,
    "windowCount": 3,
    "tabs": [...],
    "groups": [...],
    "windows": [...]
  },
  "extension": {
    "rules": [...],
    "settings": {...},
    "snoozedTabs": [...],
    "statistics": {...}
  }
}
```

### Use Cases

1. **Backup Before Major Changes**
   - Before closing many tabs
   - Before trying new rules
   - Before browser updates

2. **Session Transfer**
   - Move tabs between computers
   - Share research sessions with team
   - Archive project states

3. **Disaster Recovery**
   - Browser crash recovery
   - Accidental tab closure
   - System reinstall

## Import Feature (Coming Soon)

The import feature will allow you to:

### Restore Options

1. **Full Restore**
   - Replace all current tabs with exported session
   - Restore all settings and rules
   - Restore snoozed tabs

2. **Selective Restore**
   - Import only settings/rules
   - Import only specific tab groups
   - Merge with current session

3. **Smart Import**
   - Detect and skip duplicate tabs
   - Update existing rules
   - Merge statistics

### Import Workflow

1. Click Import button in Settings
2. Select your export file
3. Choose import options:
   - [ ] Replace current tabs
   - [ ] Import settings
   - [ ] Import rules
   - [ ] Import snoozed tabs
4. Preview changes
5. Confirm import

## Privacy & Security

### What's NOT Exported
- Passwords or form data
- Cookies or session data
- Incognito tabs
- Extension data from other extensions
- Browser history

### Sensitive Data Handling
- URLs are exported in plain text
- Consider the sensitivity of your tabs before sharing exports
- Exports can be encrypted using external tools if needed

## Advanced Usage

### Automating Exports

You can set up automated exports using the extension's API:

```javascript
// Example: Auto-export every day
chrome.alarms.create('dailyExport', {
  periodInMinutes: 24 * 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dailyExport') {
    chrome.runtime.sendMessage({action: 'exportData'});
  }
});
```

### Processing Export Files

Export files are standard JSON and can be processed with any tool:

```python
# Example: Count tabs by domain
import json
from urllib.parse import urlparse

with open('tabmaster-export-2024-01-15.json') as f:
    data = json.load(f)
    
domains = {}
for tab in data['currentSession']['tabs']:
    domain = urlparse(tab['url']).netloc
    domains[domain] = domains.get(domain, 0) + 1

for domain, count in sorted(domains.items(), key=lambda x: x[1], reverse=True)[:10]:
    print(f"{domain}: {count} tabs")
```

## Troubleshooting

### Export Not Working?
1. Check if downloads permission is granted
2. Check browser's download settings
3. Look for the file in your Downloads folder
4. Check console for error messages

### File Too Large?
- Consider closing some tabs before export
- Use compression tools on the JSON file
- Split exports by window or project

### Can't Import?
1. Ensure file format is correct
2. Check version compatibility
3. Try importing smaller portions
4. Check available memory

## Best Practices

1. **Regular Exports**: Export weekly or before major changes
2. **Naming Convention**: Add context to filename after export (e.g., `tabmaster-export-2024-01-15-project-research.json`)
3. **Storage**: Keep exports organized in folders by date/project
4. **Cleanup**: Delete old exports you no longer need
5. **Testing**: Test import on a different profile first