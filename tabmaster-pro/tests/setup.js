// Mock Chrome APIs for testing
global.chrome = {
  tabs: {
    query: jest.fn(),
    group: jest.fn(),
    remove: jest.fn(),
    update: jest.fn(),
    get: jest.fn(),
    onCreated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn()
    }
  },
  tabGroups: {
    update: jest.fn(),
    get: jest.fn()
  },
  storage: {
    local: {
      get: jest.fn(),
      set: jest.fn()
    },
    session: {
      get: jest.fn(),
      set: jest.fn()
    }
  },
  runtime: {
    onInstalled: {
      addListener: jest.fn()
    },
    onMessage: {
      addListener: jest.fn()
    },
    sendMessage: jest.fn()
  },
  alarms: {
    create: jest.fn(),
    clear: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  },
  windows: {
    getCurrent: jest.fn(),
    getAll: jest.fn()
  }
};

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
});