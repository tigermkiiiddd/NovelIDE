/**
 * TDD Phase 2.1: 🔴 RED - Tests for fileStore current behavior
 *
 * These tests capture the CURRENT behavior before refactoring.
 * They document the coupling between fileStore and projectStore.
 *
 * Goal: Ensure refactoring doesn't break existing functionality.
 */

import { useFileStore } from '../../../stores/fileStore';
import { mockFileSystem } from '../../../src/test/utils/testHelpers';
import { dbAPI } from '../../../services/persistence';

// Mock the persistence layer
jest.mock('../../../services/persistence');
const mockDbAPI = dbAPI as jest.Mocked<typeof dbAPI>;

describe('fileStore - Decoupled Behavior (Post-Refactoring)', () => {
  beforeEach(() => {
    // Reset fileStore before each test
    useFileStore.setState({
      files: [],
      activeFileId: null,
      currentProjectId: null,
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('Store Independence', () => {
    it('should track currentProjectId independently', async () => {
      // Setup: Mock database response
      const projectId = 'project-test-1';
      const mockFiles = mockFileSystem();
      mockDbAPI.getFiles.mockResolvedValue(mockFiles);

      // Execute: Load files with explicit projectId
      const { loadFiles } = useFileStore.getState();
      await loadFiles(projectId);

      // Verify: fileStore now tracks its own currentProjectId
      expect(useFileStore.getState().currentProjectId).toBe(projectId);
    });

    it('should save files using its own currentProjectId state', async () => {
      // Setup: Load files to set currentProjectId
      const projectId = 'project-autonomous-test';
      const mockFiles = mockFileSystem();
      mockDbAPI.getFiles.mockResolvedValue(mockFiles);

      const { loadFiles, _saveToDB } = useFileStore.getState();
      await loadFiles(projectId);

      // Clear previous calls
      mockDbAPI.saveFiles.mockClear();

      // Execute: Call _saveToDB which uses fileStore's own currentProjectId
      _saveToDB();

      // Verify: dbAPI.saveFiles was called with the tracked project ID
      expect(mockDbAPI.saveFiles).toHaveBeenCalledWith(projectId, expect.any(Array));
    });

    it('should handle null currentProjectId gracefully', async () => {
      // Setup: fileStore with no project loaded
      useFileStore.setState({
        files: mockFileSystem(),
        currentProjectId: null,
      });

      // Execute: Try to save
      const { _saveToDB } = useFileStore.getState();
      _saveToDB();

      // Verify: dbAPI.saveFiles should NOT be called when currentProjectId is null
      expect(mockDbAPI.saveFiles).not.toHaveBeenCalled();
    });
  });

  describe('File Operations (Independent of Coupling)', () => {
    beforeEach(() => {
      useFileStore.setState({
        currentProjectId: 'test-project',
      });
    });

    it('should create a file by path', () => {
      const { createFile } = useFileStore.getState();
      const result = createFile('/test.txt', 'Hello World');

      expect(result).toContain('Created file at: "/test.txt"');
      expect(useFileStore.getState().files.length).toBeGreaterThan(0);
    });

    it('should return error when creating duplicate file', () => {
      const { createFile } = useFileStore.getState();

      // Create first file
      createFile('/test.txt', 'Content 1');

      // Try to create duplicate
      const result = createFile('/test.txt', 'Content 2');

      expect(result).toContain('Error: File at "/test.txt" already exists.');
    });

    it('should create file by ID', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { createFileById } = useFileStore.getState();
      createFileById('file-1', 'newFile.txt');

      const { files } = useFileStore.getState();
      const newFile = files.find(f => f.name === 'newFile.txt' && f.parentId === 'file-1');
      expect(newFile).toBeDefined();
      expect(newFile?.type).toBe('FILE');
    });

    it('should create folder by ID', () => {
      const { createFolderById } = useFileStore.getState();
      createFolderById('root', 'newFolder');

      const { files } = useFileStore.getState();
      const newFolder = files.find(f => f.name === 'newFolder' && f.parentId === 'root');
      expect(newFolder).toBeDefined();
      expect(newFolder?.type).toBe('FOLDER');
    });

    it('should update file content', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { updateFile } = useFileStore.getState();
      const result = updateFile('/file1.ts', 'Updated content');

      expect(result).toContain('Updated content of "/file1.ts"');

      const file = useFileStore.getState().files.find(f => f.name === 'file1.ts');
      expect(file?.content).toBe('Updated content');
    });

    it('should save file content by ID', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles, activeFileId: 'file-1' });

      const { saveFileContent } = useFileStore.getState();
      saveFileContent('file-1', 'New saved content');

      const file = useFileStore.getState().files.find(f => f.id === 'file-1');
      expect(file?.content).toBe('New saved content');
    });

    it('should patch file with batch edits', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { patchFile } = useFileStore.getState();
      const edits = [
        { startLine: 1, endLine: 1, newContent: 'console.log("Patched");' }
      ];

      const result = patchFile('/file1.ts', edits);
      expect(result).toContain('Successfully applied 1 patches');

      const file = useFileStore.getState().files.find(f => f.name === 'file1.ts');
      expect(file?.content).toContain('Patched');
    });

    it('should read file content with line numbers', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { readFile } = useFileStore.getState();
      const result = readFile('/file1.ts');

      expect(result).toContain('File: /file1.ts');
      expect(result).toContain('Total Lines:');
      expect(result).toContain('1    |'); // Line numbers are padded to 4 characters
    });

    it('should search files by query', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { searchFiles } = useFileStore.getState();
      const result = searchFiles('file1');

      expect(result).toContain('[FILE]');
      expect(result).toContain('file1.ts');
    });

    it('should delete file by path', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { deleteFile } = useFileStore.getState();
      const result = deleteFile('/file1.ts');

      expect(result).toContain('Deleted "file1.ts"');

      const file = useFileStore.getState().files.find(f => f.name === 'file1.ts');
      expect(file).toBeUndefined();
    });

    it('should delete file by ID', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { deleteFile } = useFileStore.getState();
      const result = deleteFile('file-1');

      expect(result).toContain('Deleted');

      const file = useFileStore.getState().files.find(f => f.id === 'file-1');
      expect(file).toBeUndefined();
    });

    it('should rename file', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { renameFile } = useFileStore.getState();
      const result = renameFile('/file1.ts', 'renamed.ts');

      expect(result).toContain('Renamed "/file1.ts" to "renamed.ts"');

      const file = useFileStore.getState().files.find(f => f.name === 'renamed.ts');
      expect(file).toBeDefined();
      expect(file?.type).toBe('FILE');
    });

    it('should list files in tree structure', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles });

      const { listFiles } = useFileStore.getState();
      const result = listFiles();

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should set active file ID', () => {
      const { setActiveFileId } = useFileStore.getState();
      setActiveFileId('file-1');

      expect(useFileStore.getState().activeFileId).toBe('file-1');
    });

    it('should clear active file ID when deleting active file', () => {
      const mockFiles = mockFileSystem();
      useFileStore.setState({ files: mockFiles, activeFileId: 'file-1' });

      const { deleteFile } = useFileStore.getState();
      deleteFile('/file1.ts');

      expect(useFileStore.getState().activeFileId).toBeNull();
    });
  });

  describe('Load Files Behavior', () => {
    it('should load files from database', async () => {
      const projectId = 'project-load-test';

      const mockFiles = mockFileSystem();
      mockDbAPI.getFiles.mockResolvedValue(mockFiles);

      const { loadFiles } = useFileStore.getState();
      await loadFiles(projectId);

      expect(mockDbAPI.getFiles).toHaveBeenCalledWith(projectId);
      // Note: _restoreSystemFiles may add system files, so we check if mock files are included
      const stateFiles = useFileStore.getState().files;
      expect(stateFiles.length).toBeGreaterThan(0);
    });

    it('should initialize default files when database returns empty', async () => {
      const projectId = 'project-empty-test';

      mockDbAPI.getFiles.mockResolvedValue([]);

      const { loadFiles } = useFileStore.getState();
      await loadFiles(projectId);

      // Should create initial file system
      expect(useFileStore.getState().files.length).toBeGreaterThan(0);
      expect(mockDbAPI.saveFiles).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      const projectId = 'project-error-test';

      mockDbAPI.getFiles.mockRejectedValue(new Error('DB Error'));

      const { loadFiles } = useFileStore.getState();
      await loadFiles(projectId);

      // Should fall back to initial file system
      expect(useFileStore.getState().files.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      useFileStore.setState({
        currentProjectId: 'test-project',
      });
    });

    it('should handle reading non-existent file', () => {
      const { readFile } = useFileStore.getState();
      const result = readFile('/nonexistent.ts');

      expect(result).toContain('Error: File at "/nonexistent.ts" not found.');
    });

    it('should handle updating non-existent file', () => {
      const { updateFile } = useFileStore.getState();
      const result = updateFile('/nonexistent.ts', 'content');

      expect(result).toContain('Error: File at "/nonexistent.ts" not found.');
    });

    it('should handle deleting non-existent file', () => {
      const { deleteFile } = useFileStore.getState();
      const result = deleteFile('/nonexistent.ts');

      expect(result).toContain('Error: File not found');
    });

    it('should handle renaming non-existent file', () => {
      const { renameFile } = useFileStore.getState();
      const result = renameFile('/nonexistent.ts', 'new.ts');

      expect(result).toContain('Error: File not found.');
    });

    it('should handle creating file with non-existent parent', () => {
      const { createFile } = useFileStore.getState();
      const result = createFile('/nonexistentFolder/file.txt', 'content');

      expect(result).toContain('Error: Parent folder "/nonexistentFolder" does not exist.');
    });

    it('should return empty search results', () => {
      const { searchFiles } = useFileStore.getState();
      const result = searchFiles('xyznonexistent');

      expect(result).toContain('No files found matching "xyznonexistent"');
    });
  });
});
