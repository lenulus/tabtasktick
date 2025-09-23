describe('Time Tracking Logic', () => {
  let tabTimeData;
  
  beforeEach(() => {
    tabTimeData = new Map();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.useRealTimers();
  });
  
  describe('checkTimeCriteria', () => {
    test('should return false when no time data exists', () => {
      const tab = { id: 1, active: false, pinned: false };
      const criteria = { inactive: 10 };
      
      const result = checkTimeCriteria(tab, criteria, tabTimeData);
      expect(result).toBe(false);
    });
    
    test('should check inactive time correctly', () => {
      const now = Date.now();
      const tab = { id: 1, active: false, pinned: false };
      
      tabTimeData.set(1, {
        created: now - 60 * 60000, // 60 minutes ago
        lastActive: now - 15 * 60000, // 15 minutes ago
        lastAccessed: now - 10 * 60000 // 10 minutes ago
      });
      
      // Should match - inactive for 15 minutes
      expect(checkTimeCriteria(tab, { inactive: 10 }, tabTimeData)).toBe(true);
      
      // Should not match - requires 20 minutes inactive
      expect(checkTimeCriteria(tab, { inactive: 20 }, tabTimeData)).toBe(false);
    });
    
    test('should not match active tabs for inactive criteria', () => {
      const now = Date.now();
      const tab = { id: 1, active: true, pinned: false };
      
      tabTimeData.set(1, {
        created: now - 60 * 60000,
        lastActive: now - 30 * 60000, // 30 minutes ago
        lastAccessed: now
      });
      
      expect(checkTimeCriteria(tab, { inactive: 10 }, tabTimeData)).toBe(false);
    });
    
    test('should not match pinned tabs for inactive criteria', () => {
      const now = Date.now();
      const tab = { id: 1, active: false, pinned: true };
      
      tabTimeData.set(1, {
        created: now - 60 * 60000,
        lastActive: now - 30 * 60000,
        lastAccessed: now - 20 * 60000
      });
      
      expect(checkTimeCriteria(tab, { inactive: 10 }, tabTimeData)).toBe(false);
    });
    
    test('should check tab age correctly', () => {
      const now = Date.now();
      const tab = { id: 1, active: false, pinned: false };
      
      tabTimeData.set(1, {
        created: now - 120 * 60000, // 2 hours ago
        lastActive: now,
        lastAccessed: now
      });
      
      // Should match - tab is 2 hours old
      expect(checkTimeCriteria(tab, { age: 60 }, tabTimeData)).toBe(true);
      
      // Should not match - requires 3 hours
      expect(checkTimeCriteria(tab, { age: 180 }, tabTimeData)).toBe(false);
    });
    
    test('should check not accessed time correctly', () => {
      const now = Date.now();
      const tab = { id: 1, active: false, pinned: false };
      
      tabTimeData.set(1, {
        created: now - 120 * 60000,
        lastActive: now - 5 * 60000,
        lastAccessed: now - 45 * 60000 // 45 minutes ago
      });
      
      // Should match - not accessed for 45 minutes
      expect(checkTimeCriteria(tab, { notAccessed: 30 }, tabTimeData)).toBe(true);
      
      // Should not match - requires 60 minutes
      expect(checkTimeCriteria(tab, { notAccessed: 60 }, tabTimeData)).toBe(false);
    });
    
    test('should check multiple criteria with AND logic', () => {
      const now = Date.now();
      const tab = { id: 1, active: false, pinned: false };
      
      tabTimeData.set(1, {
        created: now - 120 * 60000, // 2 hours old
        lastActive: now - 30 * 60000, // 30 minutes inactive
        lastAccessed: now - 45 * 60000 // 45 minutes not accessed
      });
      
      // All criteria must match
      const criteria = {
        age: 60, // Must be 1 hour old - PASS
        inactive: 20, // Must be 20 minutes inactive - PASS
        notAccessed: 30 // Must be 30 minutes not accessed - PASS
      };
      
      expect(checkTimeCriteria(tab, criteria, tabTimeData)).toBe(true);
      
      // One criteria fails
      criteria.age = 180; // Must be 3 hours old - FAIL
      expect(checkTimeCriteria(tab, criteria, tabTimeData)).toBe(false);
    });
  });
});

// Helper function for testing
function checkTimeCriteria(tab, timeCriteria, tabTimeData) {
  const timeData = tabTimeData.get(tab.id);
  if (!timeData) return false;
  
  const now = Date.now();
  
  // Check inactive time (not active or pinned)
  if (timeCriteria.inactive !== undefined) {
    const inactiveMinutes = (now - timeData.lastActive) / 60000;
    if (inactiveMinutes < timeCriteria.inactive || tab.active || tab.pinned) {
      return false;
    }
  }
  
  // Check tab age
  if (timeCriteria.age !== undefined) {
    const ageMinutes = (now - timeData.created) / 60000;
    if (ageMinutes < timeCriteria.age) {
      return false;
    }
  }
  
  // Check not accessed time
  if (timeCriteria.notAccessed !== undefined) {
    const notAccessedMinutes = (now - timeData.lastAccessed) / 60000;
    if (notAccessedMinutes < timeCriteria.notAccessed) {
      return false;
    }
  }
  
  return true;
}