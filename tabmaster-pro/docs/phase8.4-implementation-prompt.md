# Phase 8.4 Implementation Prompt

Use this prompt to start a clean implementation session for Phase 8.4: Scheduled Export (Automatic Backup System).

---

## Prompt for Claude Code

```
I need you to implement Phase 8.4: Scheduled Export (Automatic Backup System) for TabMaster Pro.

## Context

TabMaster Pro is a Chrome extension following strict architectural principles:
- Services-First: All business logic in /services/*
- Message Passing: UI → Background → Services (cross-process)
- No Duplicate Implementations: Single source of truth
- Separation of Concerns: Selection vs Execution

## Implementation Plan

Please follow the detailed implementation plan at:
@tabmaster-pro/docs/phase8.4-scheduled-export-plan.md

## Key Requirements

1. **Full Snapshots**: Create complete exports with ALL data (tabs, windows, rules, snoozed tabs, settings)
2. **Chrome Downloads**: Save backups to Downloads folder via chrome.downloads API
3. **Dedicated Backups View**: Create new Dashboard view separate from Export/Import
4. **File Picker Restore**: Use enhanced file picker (Chrome security constraint - see technical analysis)
5. **Minimal Storage**: Only track metadata in chrome.storage.local (<5KB)

## Critical Technical Constraints

READ THIS FIRST: @tabmaster-pro/docs/phase8.4-restore-flow-technical-analysis.md

**Chrome Security Model**:
- Extensions CANNOT read downloaded files directly (even with downloadId)
- Must use File System Access API with file picker
- This is a hard security boundary - no workarounds exist

**Restore Flow**:
- Validate backup exists → Show file picker → User selects file → Import
- Pre-populate filename and start in Downloads folder
- Provide "Show in Folder" helper button
- Clear instructions explaining why file selection is required

## Implementation Steps

Follow the plan's 6-step breakdown (8-10 hours total):

### Step 1: Create ScheduledExportService (2h)
- File: /services/execution/ScheduledExportService.js
- Functions: enableScheduledExports, disableScheduledExports, triggerManualBackup, getBackupHistory, deleteBackup, cleanupOldBackups, handleAlarm
- Delegate to ExportImportService.exportData() for snapshot creation
- Use chrome.downloads.download() to save files
- Track download metadata in chrome.storage.local

### Step 2: Create Dedicated Backups View (2h)
- File: /dashboard/modules/views/backups.js (NEW)
- Separate from export-import.js (different mental model)
- Sections: Status Dashboard, Quick Actions, Backup History, Settings Summary
- Status: Next backup time, last backup, health indicator
- History: Grouped by Today/This Week/Older with pagination
- Actions: Backup Now, Restore, Show in Folder, Delete

### Step 3: Background Integration (1h)
- Add message handlers to background-integrated.js:
  - getScheduledExportConfig
  - enableScheduledExports
  - disableScheduledExports
  - triggerManualBackup
  - getBackupHistory
  - deleteBackup
  - getExportState (returns full state for snapshots)
- Add alarm handler for scheduled_backup and scheduled_backup_cleanup
- Ensure service worker restart handling (lazy initialization)

### Step 4: Restore Flow Implementation (1h)
- Create components/RestoreDialog.js
- Enhanced file picker with:
  - Backup validation before showing picker
  - Clear instructions and visual guides
  - Pre-populated filename (backup.filename.split('/').pop())
  - Start in 'downloads' folder
  - File type filter (application/json)
  - "Show in Folder" button
  - Success/error handling
- Use window.showOpenFilePicker() from File System Access API

### Step 5: Dashboard Navigation Update (30min)
- Add "Backups" to dashboard navigation
- Update dashboard.js to load backups view
- Update dashboard.css for new view styling
- Link to new backups.js module

### Step 6: Testing (2h)
- Unit tests for ScheduledExportService
- Test alarm scheduling and firing
- Test download creation and tracking
- Test restore flow with file picker
- Test cleanup with retention = 3
- Test with 200+ tabs
- Test service worker restart

## UX Considerations

Reference: @tabmaster-pro/docs/phase8.4-ux-architect-response.md

Key UX improvements:
- Separate Backups from Export/Import (different mental models)
- Show status: "Next backup in X hours" with health indicator
- Group history by time periods (Today/This Week/Older)
- Use explicit badges [AUTO]/[MANUAL] instead of emojis
- First-time help banner explaining file picker requirement
- Progressive disclosure for experienced users

## Success Criteria

- [ ] Automatic backups create FULL snapshots on schedule
- [ ] Backups download to Downloads folder via chrome.downloads
- [ ] Backups can be restored using file picker flow
- [ ] Metadata storage < 5KB for 50 backups
- [ ] Cleanup respects retention policy
- [ ] Manual "Backup Now" works
- [ ] Dedicated Backups view in Dashboard
- [ ] Service survives worker restarts
- [ ] Works with 200+ tabs efficiently

## Architecture Compliance

Verify before committing:
- ✅ All business logic in ScheduledExportService
- ✅ UI surfaces are THIN (just rendering + message passing)
- ✅ Delegates to ExportImportService (no duplication)
- ✅ Message passing for cross-process communication
- ✅ Static imports only (NO dynamic import())
- ✅ Handles service worker restarts (lazy initialization)

## Files to Create

1. /services/execution/ScheduledExportService.js
2. /dashboard/modules/views/backups.js
3. /components/RestoreDialog.js
4. /tests/services/ScheduledExportService.test.js

## Files to Modify

1. /background-integrated.js (message handlers, alarm handler)
2. /dashboard/dashboard.js (add Backups view)
3. /dashboard/dashboard.html (add Backups nav item)
4. /dashboard/dashboard.css (styling for backups view)

## Important Notes

- Read the technical analysis document FIRST to understand Chrome constraints
- DO NOT try to auto-read downloaded files (not possible)
- File picker is unavoidable due to Chrome security model
- Focus on optimizing the file picker UX within constraints
- Use chrome.downloads.show() to help users find files
- Validate backup existence before showing picker
- Clear communication about why file selection is needed

## Testing Command

npm test -- ScheduledExportService.test.js

## Documentation to Reference

1. Phase 8.4 Implementation Plan (main document)
2. Restore Flow Technical Analysis (Chrome API constraints)
3. UX Architect Response (UX recommendations)

Please implement Phase 8.4 following these specifications. Create the service first, then the UI, then integrate with background. Test thoroughly with 200+ tabs.
```

---

## Additional Context Files

When starting implementation, Claude should read these in order:

1. **Main Plan**: `tabmaster-pro/docs/phase8.4-scheduled-export-plan.md`
2. **Technical Constraints**: `tabmaster-pro/docs/phase8.4-restore-flow-technical-analysis.md`
3. **UX Considerations**: `tabmaster-pro/docs/phase8.4-ux-architect-response.md`
4. **Architecture Principles**: `CLAUDE.md`
5. **Service Dependencies**: `tabmaster-pro/services/ARCHITECTURE.md`

## Pre-Implementation Checklist

Before starting:
- [ ] Read all three Phase 8.4 documents
- [ ] Understand Chrome Downloads API limitations
- [ ] Review ExportImportService.exportData() API
- [ ] Review SnoozeService alarm patterns (for scheduling reference)
- [ ] Understand file picker requirement (security constraint)

## Post-Implementation Checklist

After completing:
- [ ] All unit tests passing
- [ ] Manual test with 200+ tabs
- [ ] Test service worker restart
- [ ] Test restore flow with file picker
- [ ] Test cleanup with different retention values
- [ ] Verify storage usage < 5KB
- [ ] Architecture guardian review (optional)
- [ ] Update TODO.md marking Phase 8.4 complete
