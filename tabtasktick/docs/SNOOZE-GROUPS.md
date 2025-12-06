# Snooze and Group Behavior Documentation

## Snooze Tab Group Preservation

When tabs are snoozed in TabMaster Pro, their group association is preserved and restored when possible.

### Snoozing Behavior

When a tab is snoozed:
1. The tab's current group ID (if any) is saved along with other tab metadata
2. The tab is closed from the current window
3. The snoozed tab data is stored in Chrome's local storage

### Restoration Behavior

When a snoozed tab is restored (either individually or via "Wake All"):
1. A new tab is created with the original URL
2. The extension checks if the original group still exists
3. If the group exists: The tab is automatically added back to that group
4. If the group no longer exists: The tab remains ungrouped in the current window

### Implementation Details

The group preservation logic is implemented in `background-integrated.js`:
- `snoozeTabs()`: Stores the `groupId` property when snoozing
- `restoreSnoozedTab()`: Attempts to restore group association
- `wakeAllSnoozedTabs()`: Batch restores tabs with their group associations

### Edge Cases

- **Group deleted while tab snoozed**: The tab will be restored without a group
- **Multiple windows**: Tabs are restored to the current active window
- **Group renamed**: The tab will still rejoin (groups are tracked by ID, not name)

## Group by Domain Behavior

The "Group by Domain" feature intelligently manages tab groups to avoid duplicates.

### Grouping Logic

When "Group by Domain" is triggered:
1. **Scans current window**: Only processes tabs in the current window
2. **Skips grouped tabs**: Tabs already in groups are not moved
3. **Checks existing groups**: Before creating a new group, checks if a group with the domain name already exists
4. **Reuses groups**: If a matching group exists, ungrouped tabs are added to it
5. **Creates new groups**: Only creates new groups for domains with 2+ ungrouped tabs AND no existing group

### Example Scenarios

**Scenario 1: No existing groups**
- 3 ungrouped tabs from `example.com`
- Result: Creates 1 new group "example.com" with all 3 tabs

**Scenario 2: Existing group**
- 1 group "example.com" with 2 tabs
- 2 ungrouped tabs from `example.com`
- Result: Adds the 2 ungrouped tabs to the existing group (now 4 tabs total)

**Scenario 3: Mixed domains**
- 1 group "site1.com" with 2 tabs
- 3 ungrouped tabs: 1 from `site1.com`, 2 from `site2.com`
- Result:
  - Adds 1 tab to existing "site1.com" group
  - Creates new group "site2.com" with 2 tabs

### Design Decisions

1. **Single window scope**: Groups are managed per window to avoid confusion
2. **Preserve existing groups**: Never moves tabs that are already grouped
3. **Minimum group size**: Only creates groups for domains with 2+ tabs (unless adding to existing)
4. **Group naming**: Groups are named after the domain for easy identification

### Implementation

The logic is in `background-integrated.js`:
- `groupTabsByDomain()`: Main grouping function with duplicate prevention
- Returns: `{ groupsCreated, groupsReused, totalTabsGrouped }`