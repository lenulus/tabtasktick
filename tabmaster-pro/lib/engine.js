// Rules Engine - Core rule evaluation and action execution
// Integrates normalize.js for deduplication and predicate.js for condition evaluation

import { compile, checkIsDupe } from './predicate.js';
import { normalizeUrl, extractDomain, generateDupeKey, extractOrigin } from './normalize.js';
import { validateActionList, sortActionsByPriority } from './action-validator.js';
import { transformConditions } from './condition-transformer.js';

/**
 * Build indices for efficient rule evaluation
 * @param {Array} tabs - Array of tab objects
 * @returns {object} Indices organized by domain, origin, dupeKey, and category
 */
export function buildIndices(tabs) {
  const byDomain = {};
  const byOrigin = {};
  const byDupeKey = {};
  const byCategory = {};
  
  for (const tab of tabs) {
    // Enhance tab with derived fields
    tab.domain = tab.domain || extractDomain(tab.url);
    tab.dupeKey = tab.dupeKey || generateDupeKey(tab.url);
    tab.origin = tab.origin || extractOrigin(tab.referrer || '');
    tab.category = tab.category || 'unknown';
    
    // Calculate age if createdAt is available
    if (tab.createdAt) {
      tab.age = Date.now() - tab.createdAt;
    }
    
    // Add to indices
    (byDomain[tab.domain] ||= []).push(tab);
    (byOrigin[tab.origin] ||= []).push(tab);
    (byDupeKey[tab.dupeKey] ||= []).push(tab);
    (byCategory[tab.category] ||= []).push(tab);
  }
  
  return { byDomain, byOrigin, byDupeKey, byCategory };
}

/**
 * Evaluate which tabs match a rule's conditions
 * @param {object} rule - Rule with conditions and actions
 * @param {object} context - Context with tabs, windows, idx
 * @param {object} options - Evaluation options (skipPinned, etc)
 * @returns {Array} Array of matching tabs
 * @throws {Error} If rule compilation fails
 */
export function evaluateRule(rule, context, options = {}) {
  const matches = [];
  
  if (!rule.enabled) return matches;
  
  // Transform conditions from UI format to predicate format (or pass through if already in predicate format)
  const transformedConditions = transformConditions(rule.when);
  
  // Check for empty conditions
  if (transformedConditions.all && transformedConditions.all.length === 0) {
    console.warn('Rule has empty conditions, will not match any tabs');
    return matches;
  }
  
  const predicate = compile(transformedConditions);
  
  // Debug: Log duplicate groups
  console.log('Duplicate groups:', Object.keys(context.idx.byDupeKey).filter(key => 
    context.idx.byDupeKey[key].length > 1
  ).map(key => ({
    dupeKey: key,
    count: context.idx.byDupeKey[key].length,
    tabs: context.idx.byDupeKey[key].map(t => ({ id: t.id, url: t.url }))
  })));
  
  for (const tab of context.tabs) {
    // Skip pinned tabs if configured
    if (options.skipPinned && tab.isPinned && !rule.flags?.includePinned) {
      continue;
    }
    
    // Find the window for this tab
    const window = context.windows?.find(w => w.id === tab.windowId) || {};
    
    // Build evaluation context for this tab
    const isDupe = checkIsDupe(tab, context);

    // Map Chrome tab properties to expected names
    const mappedTab = {
      ...tab,
      isDupe,
      // Map Chrome properties to expected names
      isPinned: tab.pinned,
      isMuted: tab.mutedInfo ? tab.mutedInfo.muted : false,
      isAudible: tab.audible,
      isActive: tab.active
    };

    const evalContext = {
      tab: mappedTab,
      window,
      idx: context.idx
    };
    
    // Log tabs for debugging
    if (tab.url && tab.url.includes('cnn.com')) {
      console.log('CNN Tab:', tab.url, 'isDupe:', isDupe, 'dupeKey:', tab.dupeKey, 'id:', tab.id);
    }
    
    // Evaluate predicate
    try {
      const result = predicate(evalContext);

      // Debug logging for test mode
      if (tab.url && (tab.url.includes('test-tab') || tab.url.includes('youtube.com') || tab.url.includes('docs.google.com'))) {
        console.log('Evaluating test tab:', {
          url: tab.url,
          age: evalContext.tab.age,
          isPinned: evalContext.tab.isPinned,
          isMuted: evalContext.tab.isMuted,
          isDupe: evalContext.tab.isDupe,
          result
        });
      }

      if (result) {
        console.log('Tab matches:', tab.url, 'isDupe:', evalContext.tab.isDupe);
        matches.push(tab);
      }
    } catch (error) {
      console.error('Error evaluating tab:', tab.url, error);
    }
  }
  
  return matches;
}

/**
 * Execute actions on matched tabs
 * @param {Array} actions - Array of action definitions
 * @param {Array} tabs - Array of tabs to act on
 * @param {object} context - Execution context
 * @param {boolean} dryRun - Whether to simulate without executing
 * @returns {Array} Array of execution results
 */
export async function executeActions(actions, tabs, context, dryRun = false) {
  console.log('executeActions called with:', { actions, tabCount: tabs.length, dryRun });
  
  // Ensure actions is an array
  const actionArray = Array.isArray(actions) ? actions : [actions];
  
  // Validate action compatibility
  const validation = validateActionList(actionArray);
  if (!validation.valid && !dryRun) {
    console.warn('Invalid action combination:', validation.errors);
    // In production, we might want to throw an error or handle this differently
  }
  
  // Sort actions by priority for optimal execution order
  const sortedActions = sortActionsByPriority(actionArray);
  console.log('Sorted actions:', sortedActions);
  
  const results = [];
  const processedTabs = new Set();
  
  for (const action of sortedActions) {
    const actionResults = [];
    
    for (const tab of tabs) {
      // Skip if already processed (e.g., closed)
      if (processedTabs.has(tab.id)) {
        continue;
      }
      
      try {
        const result = await executeAction(action, tab, context, dryRun);
        
        if (result.success) {
          actionResults.push({
            tabId: tab.id,
            action: action.action,
            details: result.details,
            success: true
          });
          
          // Mark as processed if it was closed
          if (action.action === 'close' && !dryRun) {
            processedTabs.add(tab.id);
          }
        } else {
          actionResults.push({
            tabId: tab.id,
            action: action.action,
            error: result.error,
            success: false
          });
        }
      } catch (error) {
        actionResults.push({
          tabId: tab.id,
          action: action.action,
          error: error.message,
          success: false
        });
      }
    }
    
    results.push(...actionResults);
  }
  
  return results;
}

/**
 * Execute a single action on a tab
 * @param {object} action - Action definition
 * @param {object} tab - Tab to act on
 * @param {object} context - Execution context
 * @param {boolean} dryRun - Whether to simulate
 * @returns {object} Execution result
 */
async function executeAction(action, tab, context, dryRun) {
  console.log('executeAction called with action:', action);
  
  // Handle both 'action' and 'type' field names for backwards compatibility
  const actionType = action.action || action.type;
  console.log('Action type resolved to:', actionType);
  
  switch (actionType) {
    case 'close':
      console.log(`Executing close action for tab ${tab.id}: ${tab.url}`);
      if (!dryRun && context.chrome?.tabs) {
        try {
          await context.chrome.tabs.remove(tab.id);
          console.log(`Successfully closed tab ${tab.id}`);
        } catch (error) {
          console.error(`Failed to close tab ${tab.id}:`, error);
          return { success: false, error: error.message };
        }
      }
      return { success: true, details: { closed: tab.id } };
      
    case 'group':
      if (!dryRun && context.chrome?.tabs) {
        let groupId;
        
        if (action.name) {
          // Create or find named group
          const existingGroups = await context.chrome.tabGroups.query({ 
            windowId: tab.windowId 
          });
          const existingGroup = existingGroups.find(g => g.title === action.name);
          
          if (existingGroup) {
            groupId = existingGroup.id;
          } else if (action.createIfMissing !== false) {
            groupId = await context.chrome.tabs.group({ tabIds: [tab.id] });
            await context.chrome.tabGroups.update(groupId, { title: action.name });
            return { success: true, details: { groupId, created: true } };
          }
        } else if (action.by) {
          // Group by attribute (origin, domain, etc)
          const groupKey = getGroupKey(tab, action.by);
          groupId = context.groupMap?.[groupKey];
          
          if (!groupId) {
            groupId = await context.chrome.tabs.group({ tabIds: [tab.id] });
            if (context.groupMap) {
              context.groupMap[groupKey] = groupId;
            }
            await context.chrome.tabGroups.update(groupId, { title: groupKey });
            return { success: true, details: { groupId, key: groupKey, created: true } };
          }
        }
        
        if (groupId && tab.groupId !== groupId) {
          await context.chrome.tabs.group({ groupId, tabIds: [tab.id] });
        }
      }
      return { success: true, details: { grouped: tab.id } };
      
    case 'snooze':
      const duration = parseDuration(action.for || '1h');
      const wakeTime = Date.now() + duration;
      
      if (!dryRun && context.chrome?.storage) {
        const snoozedData = await context.chrome.storage.local.get('snoozedTabs') || {};
        const snoozedTabs = snoozedData.snoozedTabs || [];
        
        snoozedTabs.push({
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          wakeTime,
          wakeInto: action.wakeInto || 'same_window'
        });
        
        await context.chrome.storage.local.set({ snoozedTabs });
        await context.chrome.tabs.remove(tab.id);
      }
      
      return { 
        success: true, 
        details: { snoozed: tab.id, until: new Date(wakeTime).toISOString() } 
      };
      
    case 'bookmark':
      if (!dryRun && context.chrome?.bookmarks) {
        const folder = action.to || 'Other bookmarks';
        // Find or create folder
        const bookmarkTree = await context.chrome.bookmarks.getTree();
        let folderId = findBookmarkFolder(bookmarkTree[0], folder);
        
        if (!folderId) {
          // Create in Other Bookmarks
          const created = await context.chrome.bookmarks.create({
            parentId: '2', // Other Bookmarks
            title: folder
          });
          folderId = created.id;
        }
        
        await context.chrome.bookmarks.create({
          parentId: folderId,
          title: tab.title,
          url: tab.url
        });
      }
      
      return { success: true, details: { bookmarked: tab.id, folder: action.to } };
      
    default:
      return { success: false, error: `Unknown action: ${actionType}` };
  }
}

/**
 * Run all enabled rules against the current context
 * @param {Array} rules - Array of rule definitions
 * @param {object} context - Execution context with tabs, windows, chrome API
 * @param {object} options - Run options (dryRun, skipPinned, etc)
 * @returns {object} Execution results and statistics
 */
export async function runRules(rules, context, options = {}) {
  const startTime = Date.now();
  const results = {
    rules: [],
    totalMatches: 0,
    totalActions: 0,
    errors: [],
    duration: 0
  };
  
  // Build indices
  context.idx = buildIndices(context.tabs);
  
  // Group map for group-by actions
  context.groupMap = {};
  
  for (const rule of rules) {
    if (!rule.enabled) continue;
    
    try {
      // Evaluate rule
      const matches = evaluateRule(rule, context, options);
      
      if (matches.length > 0) {
        // Get actions from rule (handle both old and new formats)
        const ruleActions = rule.then || rule.actions;
        console.log(`Rule ${rule.name} has ${matches.length} matches and actions:`, ruleActions);
        
        if (!ruleActions || (Array.isArray(ruleActions) && ruleActions.length === 0)) {
          console.warn(`Rule ${rule.name} has no actions defined`);
          continue;
        }
        
        // Execute actions
        const actions = await executeActions(
          ruleActions, 
          matches, 
          context, 
          options.dryRun
        );
        
        results.rules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matches: matches.map(t => ({ id: t.id, url: t.url, title: t.title })),
          actions,
          matchCount: matches.length
        });
        
        results.totalMatches += matches.length;
        results.totalActions += actions.length;
      }
    } catch (error) {
      results.errors.push({
        ruleId: rule.id,
        ruleName: rule.name,
        error: error.message
      });
    }
  }
  
  results.duration = Date.now() - startTime;
  return results;
}

/**
 * Helper to parse duration strings
 * @param {string} duration - Duration like '1h', '30m', '7d'
 * @returns {number} Duration in milliseconds
 */
function parseDuration(duration) {
  if (typeof duration === 'number') return duration;
  
  const units = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };
  
  const match = duration.match(/^(\d+)([mhd])$/);
  if (!match) return 60 * 60 * 1000; // Default 1 hour
  
  const [, num, unit] = match;
  return parseInt(num) * units[unit];
}

/**
 * Get grouping key for a tab based on grouping type
 * @param {object} tab - Tab object
 * @param {string} by - Grouping type (domain, origin, date)
 * @returns {string} Group key
 */
function getGroupKey(tab, by) {
  switch (by) {
    case 'domain':
      return tab.domain || 'unknown';
    case 'origin':
      return tab.origin || 'unknown';
    case 'date':
      const date = new Date(tab.createdAt || Date.now());
      return date.toLocaleDateString();
    default:
      return 'unknown';
  }
}

/**
 * Find bookmark folder by name
 * @param {object} node - Bookmark tree node
 * @param {string} folderName - Name to find
 * @returns {string|null} Folder ID if found
 */
function findBookmarkFolder(node, folderName) {
  if (node.title === folderName && !node.url) {
    return node.id;
  }
  
  if (node.children) {
    for (const child of node.children) {
      const found = findBookmarkFolder(child, folderName);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Preview what a rule would do without executing
 * @param {object} rule - Rule to preview
 * @param {object} context - Execution context
 * @param {object} options - Preview options
 * @returns {object} Preview results
 */
export function previewRule(rule, context, options = {}) {
  // Ensure indices are built
  if (!context.idx) {
    context.idx = buildIndices(context.tabs);
  }
  
  const matches = evaluateRule(rule, context, options);
  
  return {
    rule: {
      id: rule.id,
      name: rule.name,
      conditions: rule.when,
      actions: rule.then
    },
    matches: matches.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title,
      domain: tab.domain,
      category: tab.category,
      age: tab.age ? formatDuration(tab.age) : 'unknown',
      wouldExecute: rule.then.map(a => a.action)
    })),
    totalMatches: matches.length,
    skipPinnedApplied: options.skipPinned && matches.some(t => !t.isPinned)
  };
}

/**
 * Format duration in milliseconds to human-readable
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration
 */
function formatDuration(ms) {
  const minutes = Math.floor(ms / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}