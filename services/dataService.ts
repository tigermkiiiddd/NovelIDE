/**
 * @file dataService.ts
 * @description 统一的数据管理服务 - 封装业务逻辑：级联删除、一致性检查
 */

import { dbAPI } from './persistence';
import { FileNode } from '../types';

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
   * @param filePath 文件路径
   * @param projectId 项目 ID
   */
  async deleteFileCascade(filePath: string, projectId: string): Promise<void> {
    await this.cascadeDeleteByFilePath(filePath, projectId);
  }

  /**
   * 根据文件路径级联删除关联数据
   */
  private async cascadeDeleteByFilePath(filePath: string, projectId: string): Promise<void> {
    // 角色档案：删除 characterProfiles 记录
    if (filePath.startsWith('02_角色档案/角色状态与记忆/') && filePath.endsWith('.json')) {
      const fileName = filePath.split('/').pop();
      if (fileName) {
        const characterId = fileName.replace('.json', '');
        try {
          await dbAPI.deleteCharacterProfile(characterId);
          console.log(`[DataService] 级联删除角色档案: ${characterId}`);
        } catch (error) {
          console.error(`[DataService] 级联删除角色档案失败: ${characterId}`, error);
        }
      }
    }

    // 可以在这里添加其他文件类型的级联删除逻辑
    // 例如：知识图谱、章节分析等
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
   * @returns 清理结果
   */
  async checkAndRepairConsistency(projectId: string): Promise<{
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
      // 1. 检查角色档案一致性
      const files = await dbAPI.getFiles(projectId);
      if (files) {
        const characterFolder = files.find(f => f.name === '角色状态与记忆');
        const existingCharacterIds = new Set(
          characterFolder
            ? files
                .filter(f => f.parentId === characterFolder.id && f.name.endsWith('.json'))
                .map(f => f.name.replace('.json', ''))
            : []
        );

        // 获取 IndexedDB 中的档案
        const profiles = await dbAPI.getCharacterProfiles(projectId);
        for (const profile of profiles) {
          if (!existingCharacterIds.has(profile.characterId)) {
            result.orphanProfiles.push(profile.characterId);
            try {
              await dbAPI.deleteCharacterProfile(profile.characterId);
              console.log(`[DataService] 一致性检查 - 清理孤儿档案: ${profile.characterId}`);
            } catch (error) {
              console.error(`[DataService] 清理孤儿档案失败: ${profile.characterId}`, error);
            }
          }
        }
      }

      // 2. 检查知识图谱一致性（如果需要）
      // 知识图谱目前是项目级的，暂不需要检查

      result.repaired = result.orphanProfiles.length > 0 || result.orphanMemories.length > 0;

      if (result.repaired) {
        console.log(`[DataService] 一致性检查完成，清理了 ${result.orphanProfiles.length} 个孤儿档案`);
      }
    } catch (error) {
      console.error('[DataService] 一致性检查失败:', error);
    }

    return result;
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
