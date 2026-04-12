/**
 * @file dataService.ts
 * @description 统一的数据管理服务 - 封装业务逻辑：级联删除、一致性检查
 */

import { dbAPI } from './persistence';
import { FileNode, FileType } from '../types';

/**
 * 规范化角色名称（与 characterMemoryStore 保持一致）
 */
const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, '-');

/**
 * 生成角色档案 ID（与 characterMemoryStore 保持一致）
 */
const makeProfileId = (characterName: string): string =>
  `char-${normalizeName(characterName).replace(/[^\w\u4e00-\u9fa5]+/g, '-')}`;

/**
 * DataService - 统一的数据管理服务
 * 职责：
 * - 级联删除：删除文件时自动删除关联的专用表数据
 * - 一致性检查：启动时检测并清理孤儿数据
 * - 数据关系管理：知道文件和专用表之间的对应关系
 */
class DataService {
  // ============================================
  // 文件删除（级联删除）
  // ============================================

  /**
   * 删除文件时级联删除关联数据
   * @param filePath 文件路径（由 getNodePath 生成，格式如 "02_角色档案/角色状态与记忆/景田.json"）
   * @param projectId 项目 ID
   */
  async deleteFileCascade(filePath: string, projectId: string): Promise<void> {
    // 角色档案：删除 characterProfiles 记录
    // 路径格式: "02_角色档案/角色状态与记忆/景田.json" 或 "角色状态与记忆/景田.json"
    if (filePath.endsWith('.json')) {
      const pathParts = filePath.split('/');
      const parentFolder = pathParts.length > 1 ? pathParts[pathParts.length - 2] : '';

      // 检查是否是角色状态与记忆文件夹下的文件
      if (parentFolder === '角色状态与记忆') {
        const fileName = pathParts[pathParts.length - 1];
        const characterName = fileName.replace('.json', '');
        const characterId = makeProfileId(characterName);

        try {
          await dbAPI.deleteCharacterProfile(characterId);
          console.log(`[DataService] 级联删除角色档案: ${characterName} (ID: ${characterId})`);
        } catch (error) {
          console.error(`[DataService] 级联删除角色档案失败: ${characterName}`, error);
        }
      }
    }
  }

  // ============================================
  // 项目删除（级联删除）
  // ============================================

  /**
   * 删除项目及其所有关联数据
   * @param projectId 项目 ID
   */
  async deleteProjectCascade(projectId: string): Promise<void> {
    console.log(`[DataService] 开始删除项目: ${projectId}`);
    await dbAPI.deleteProjectCascade(projectId);
    console.log(`[DataService] 项目删除完成: ${projectId}`);
  }

  // ============================================
  // 一致性检查
  // ============================================

  /**
   * 检查并修复数据一致性
   * 在项目加载时调用
   * @param projectId 项目 ID
   * @param files 当前文件树（避免重复读取）
   * @returns 清理结果
   */
  async checkAndRepairConsistency(
    projectId: string,
    files?: FileNode[]
  ): Promise<{
    orphanProfiles: string[];
    orphanMemories: string[];
    repaired: boolean;
  }> {
    const result = {
      orphanProfiles: [] as string[],
      orphanMemories: [] as string[],
      repaired: false,
    };

    try {
      // 1. 获取文件树（如果没有传入）
      const fileTree = files || (await dbAPI.getFiles(projectId));
      if (!fileTree || fileTree.length === 0) {
        return result;
      }

      // 2. 查找角色状态与记忆文件夹
      const profileFolder = this.findFolderByName(fileTree, '角色状态与记忆');
      if (!profileFolder) {
        // 文件夹不存在，检查是否有残留的档案需要清理
        const profiles = await dbAPI.getCharacterProfiles(projectId);
        for (const profile of profiles) {
          result.orphanProfiles.push(profile.characterId);
          try {
            await dbAPI.deleteCharacterProfile(profile.characterId);
            console.log(`[DataService] 一致性检查 - 清理孤儿档案（文件夹不存在）: ${profile.characterId}`);
          } catch (error) {
            console.error(`[DataService] 清理孤儿档案失败: ${profile.characterId}`, error);
          }
        }
        result.repaired = result.orphanProfiles.length > 0;
        return result;
      }

      // 3. 获取文件夹下的所有 JSON 文件
      const existingFileNames = new Set<string>();
      const collectFiles = (folderId: string, nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.parentId === folderId && node.type === FileType.FILE && node.name.endsWith('.json')) {
            // 文件名是 "角色名.json"，需要生成 characterId
            const characterName = node.name.replace('.json', '');
            const characterId = makeProfileId(characterName);
            existingFileNames.add(characterId);
          }
        }
      };
      collectFiles(profileFolder.id, fileTree);

      // 4. 检查 IndexedDB 中的档案是否都有对应的文件
      const profiles = await dbAPI.getCharacterProfiles(projectId);
      for (const profile of profiles) {
        if (!existingFileNames.has(profile.characterId)) {
          result.orphanProfiles.push(profile.characterId);
          try {
            await dbAPI.deleteCharacterProfile(profile.characterId);
            console.log(`[DataService] 一致性检查 - 清理孤儿档案: ${profile.characterId}`);
          } catch (error) {
            console.error(`[DataService] 清理孤儿档案失败: ${profile.characterId}`, error);
          }
        }
      }

      // 5. 检查记忆宫殿一致性（如果需要）
      // 记忆宫殿目前是项目级的，暂不需要检查

      result.repaired = result.orphanProfiles.length > 0 || result.orphanMemories.length > 0;

      if (result.repaired) {
        console.log(`[DataService] 一致性检查完成，清理了 ${result.orphanProfiles.length} 个孤儿档案`);
      }
    } catch (error) {
      console.error('[DataService] 一致性检查失败:', error);
    }

    return result;
  }

  /**
   * 在文件树中按名称查找文件夹
   */
  private findFolderByName(files: FileNode[], name: string): FileNode | undefined {
    for (const file of files) {
      if (file.type === FileType.FOLDER && file.name === name) {
        return file;
      }
    }
    return undefined;
  }

  // ============================================
  // 数据迁移
  // ============================================

  /**
   * 从 JSON 文件迁移到专用表
   * @param projectId 项目 ID
   */
  async migrateFromFiles(projectId: string): Promise<{
    profiles: number;
    memories: number;
  }> {
    return dbAPI.migrateMemoriesFromFiles(projectId);
  }
}

// 单例导出
export const dataService = new DataService();
