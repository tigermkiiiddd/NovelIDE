/**
 * Mock implementations for external dependencies
 */

import { MockIndexedDB } from '../utils/testHelpers';

// Global mock IndexedDB instance
let mockDBInstance: MockIndexedDB | null = null;

export const getMockDB = () => {
  if (!mockDBInstance) {
    mockDBInstance = new MockIndexedDB();
  }
  return mockDBInstance;
};

export const clearMockDB = () => {
  if (mockDBInstance) {
    mockDBInstance.clear();
  }
  mockDBInstance = null;
};

/**
 * Mock dbAPI for testing
 */
export const mockDbAPI = {
  getAllProjects: jest.fn(),
  saveProject: jest.fn(),
  deleteProject: jest.fn(),
  getFiles: jest.fn(),
  saveFiles: jest.fn(),
  getSessions: jest.fn(),
  saveSessions: jest.fn(),
  getAIConfig: jest.fn(),
  saveAIConfig: jest.fn(),
  getCurrentProjectId: jest.fn(),
  saveCurrentProjectId: jest.fn(),
  getCurrentSessionId: jest.fn(),
  saveCurrentSessionId: jest.fn(),
  getDiffSession: jest.fn(),
  saveDiffSession: jest.fn(),
  deleteFileDiffSessions: jest.fn(),
  getUiSettings: jest.fn(),
  saveUiSettings: jest.fn(),
  deleteUiSettings: jest.fn()
};

/**
 * Reset all mocks
 */
export const resetAllMocks = () => {
  Object.values(mockDbAPI).forEach(fn => {
    if (jest.isMockFunction(fn)) {
      fn.mockReset();
    }
  });
};

/**
 * Setup default mock implementations
 */
export const setupDefaultMocks = () => {
  const mockDB = getMockDB();

  mockDbAPI.getDiffSession.mockImplementation(async (fileId: string) => {
    return mockDB.get('diffSessions', `current_${fileId}`);
  });

  mockDbAPI.saveDiffSession.mockImplementation(async (fileId: string, session: any) => {
    if (session) {
      await mockDB.put('diffSessions', session, `current_${fileId}`);
    } else {
      await mockDB.delete('diffSessions', `current_${fileId}`);
    }
  });

  mockDbAPI.getFiles.mockResolvedValue([]);
  mockDbAPI.saveFiles.mockResolvedValue(undefined);
  mockDbAPI.getAllProjects.mockResolvedValue([]);
  mockDbAPI.saveProject.mockResolvedValue(undefined);
  mockDbAPI.deleteProject.mockResolvedValue(undefined);
};
