/**
 * Tests for ScheduledExportService
 * Phase 8.4: Automatic Backup System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as ScheduledExportService from '../../services/execution/ScheduledExportService.js';

// Mock chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn()
    }
  },
  alarms: {
    create: vi.fn(),
    clear: vi.fn(),
    onAlarm: {
      addListener: vi.fn()
    }
  },
  downloads: {
    download: vi.fn(),
    search: vi.fn(),
    removeFile: vi.fn(),
    erase: vi.fn(),
    show: vi.fn(),
    showDefaultFolder: vi.fn()
  },
  runtime: {
    sendMessage: vi.fn(),
    getManifest: vi.fn(() => ({ version: '1.0.0' }))
  }
};

describe('ScheduledExportService', () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Default storage responses
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
  });

  describe('getScheduledExportConfig', () => {
    it('should return default config when no config exists', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const config = await ScheduledExportService.getScheduledExportConfig();

      expect(config).toEqual({
        enabled: false,
        frequency: 'daily',
        retention: 7,
        lastRun: null
      });
    });

    it('should return stored config when it exists', async () => {
      const storedConfig = {
        enabled: true,
        frequency: 'hourly',
        retention: 10,
        lastRun: Date.now()
      };

      chrome.storage.local.get.mockResolvedValue({
        scheduled_export_config: storedConfig
      });

      const config = await ScheduledExportService.getScheduledExportConfig();

      expect(config).toEqual(storedConfig);
    });
  });

  describe('enableScheduledExports', () => {
    it('should store config and setup alarms', async () => {
      const config = {
        enabled: true,
        frequency: 'daily',
        retention: 7
      };

      await ScheduledExportService.enableScheduledExports(config);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        scheduled_export_config: expect.objectContaining({
          enabled: true,
          frequency: 'daily',
          retention: 7
        })
      });

      // Should clear old alarms
      expect(chrome.alarms.clear).toHaveBeenCalledWith('scheduled_backup');
      expect(chrome.alarms.clear).toHaveBeenCalledWith('scheduled_backup_cleanup');

      // Should create new alarms
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'scheduled_backup',
        expect.objectContaining({
          periodInMinutes: 60 * 24 // daily
        })
      );
    });

    it('should setup hourly alarms correctly', async () => {
      await ScheduledExportService.enableScheduledExports({
        frequency: 'hourly'
      });

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'scheduled_backup',
        expect.objectContaining({
          periodInMinutes: 60
        })
      );
    });

    it('should setup weekly alarms correctly', async () => {
      await ScheduledExportService.enableScheduledExports({
        frequency: 'weekly'
      });

      expect(chrome.alarms.create).toHaveBeenCalledWith(
        'scheduled_backup',
        expect.objectContaining({
          periodInMinutes: 60 * 24 * 7
        })
      );
    });
  });

  describe('disableScheduledExports', () => {
    it('should disable config and clear alarms', async () => {
      chrome.storage.local.get.mockResolvedValue({
        scheduled_export_config: {
          enabled: true,
          frequency: 'daily',
          retention: 7
        }
      });

      await ScheduledExportService.disableScheduledExports();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        scheduled_export_config: expect.objectContaining({
          enabled: false
        })
      });

      expect(chrome.alarms.clear).toHaveBeenCalledWith('scheduled_backup');
      expect(chrome.alarms.clear).toHaveBeenCalledWith('scheduled_backup_cleanup');
    });
  });

  describe('getBackupHistory', () => {
    it('should return empty array when no history exists', async () => {
      chrome.storage.local.get.mockResolvedValue({});

      const history = await ScheduledExportService.getBackupHistory();

      expect(history).toEqual([]);
    });

    it('should return stored backup history', async () => {
      const backups = [
        {
          downloadId: 1,
          timestamp: Date.now(),
          filename: 'backup1.json',
          size: 1024,
          tabCount: 10,
          windowCount: 1,
          automatic: true
        }
      ];

      chrome.storage.local.get.mockResolvedValue({
        backup_history: backups
      });

      const history = await ScheduledExportService.getBackupHistory();

      expect(history).toEqual(backups);
    });
  });

  describe('deleteBackup', () => {
    it('should remove backup from tracking without deleting file', async () => {
      const backups = [
        { downloadId: 1, filename: 'backup1.json' },
        { downloadId: 2, filename: 'backup2.json' }
      ];

      chrome.storage.local.get.mockResolvedValue({
        backup_history: backups
      });

      await ScheduledExportService.deleteBackup(1, false);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        backup_history: [{ downloadId: 2, filename: 'backup2.json' }]
      });

      expect(chrome.downloads.removeFile).not.toHaveBeenCalled();
    });

    it('should remove backup and delete file when deleteFile is true', async () => {
      const backups = [
        { downloadId: 1, filename: 'backup1.json' }
      ];

      chrome.storage.local.get.mockResolvedValue({
        backup_history: backups
      });

      await ScheduledExportService.deleteBackup(1, true);

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        backup_history: []
      });

      expect(chrome.downloads.removeFile).toHaveBeenCalledWith(1);
      expect(chrome.downloads.erase).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('validateBackup', () => {
    it('should return exists: false when download not found', async () => {
      chrome.downloads.search.mockResolvedValue([]);

      const result = await ScheduledExportService.validateBackup({
        downloadId: 1
      });

      expect(result).toEqual({
        exists: false,
        inHistory: false
      });
    });

    it('should return exists: true when download found and file exists', async () => {
      chrome.downloads.search.mockResolvedValue([
        {
          id: 1,
          filename: '/path/to/backup.json',
          fileSize: 1024,
          state: 'complete',
          exists: true
        }
      ]);

      const result = await ScheduledExportService.validateBackup({
        downloadId: 1
      });

      expect(result).toEqual({
        exists: true,
        inHistory: true,
        path: '/path/to/backup.json',
        fileSize: 1024,
        state: 'complete'
      });
    });
  });

  describe('handleAlarm', () => {
    beforeEach(() => {
      // Mock full state for export
      chrome.runtime.sendMessage.mockResolvedValue({
        state: {
          rules: [],
          snoozedTabs: [],
          settings: {},
          statistics: {}
        },
        tabTimeData: new Map()
      });

      // Mock chrome APIs for snapshot creation
      chrome.downloads.download.mockResolvedValue(123);
    });

    it('should trigger backup on scheduled_backup alarm when enabled', async () => {
      chrome.storage.local.get.mockResolvedValue({
        scheduled_export_config: {
          enabled: true,
          frequency: 'daily',
          retention: 7
        },
        backup_history: []
      });

      const alarm = { name: 'scheduled_backup' };
      await ScheduledExportService.handleAlarm(alarm);

      // Should send message to get export state
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'getExportState'
      });

      // Should create download
      expect(chrome.downloads.download).toHaveBeenCalled();
    });

    it('should not trigger backup when disabled', async () => {
      chrome.storage.local.get.mockResolvedValue({
        scheduled_export_config: {
          enabled: false,
          frequency: 'daily',
          retention: 7
        }
      });

      const alarm = { name: 'scheduled_backup' };
      await ScheduledExportService.handleAlarm(alarm);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(chrome.downloads.download).not.toHaveBeenCalled();
    });

    it('should ignore unrelated alarms', async () => {
      const alarm = { name: 'some_other_alarm' };
      await ScheduledExportService.handleAlarm(alarm);

      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    });
  });
});
