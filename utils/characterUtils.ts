/**
 * @file characterUtils.ts
 * @description 角色相关的公共工具方法
 */

import { useFileStore } from '../stores/fileStore';
import { FileType } from '../types';

/**
 * 获取项目中的正式角色列表
 *
 * 正式角色定义：在 02_角色档案 目录下，文件名格式为 "前缀_姓名.md" 的角色
 *
 * @returns 角色名称列表（不含前缀）
 *
 * @example
 * // 假设目录下有：主角_苏清月.md、配角_林逸.md
 * getOfficialCharacterList() // 返回 ['苏清月', '林逸']
 */
export function getOfficialCharacterList(): string[] {
  const fileStore = useFileStore.getState();

  // 查找角色档案目录
  const characterFolder = fileStore.files.find(
    f => f.name === '02_角色档案' && f.parentId === 'root'
  );

  if (!characterFolder) {
    return [];
  }

  // 筛选符合 "前缀_姓名.md" 格式的角色文件
  const characterFiles = fileStore.files.filter(
    f => f.parentId === characterFolder.id &&
         f.type === FileType.FILE &&
         f.name.endsWith('.md') &&
         f.name.includes('_')
  );

  // 提取角色名称（从 "前缀_姓名.md" 中提取 "姓名"）
  const characterList: string[] = [];
  for (const cf of characterFiles) {
    const fileName = cf.name.replace('.md', '');
    const parts = fileName.split('_');
    if (parts.length >= 2) {
      // 处理名字中可能包含下划线的情况（如 "配角_欧阳_小美.md"）
      const characterName = parts.slice(1).join('_');
      characterList.push(characterName);
    }
  }

  return characterList;
}

/**
 * 检查角色名是否为正式角色
 *
 * @param characterName 角色名称
 * @returns 是否为正式角色
 */
export function isOfficialCharacter(characterName: string): boolean {
  const officialList = getOfficialCharacterList();
  return officialList.includes(characterName);
}

/**
 * 格式化角色列表为 prompt 友好的格式
 *
 * @param characterList 角色列表（可选，不传则自动获取）
 * @returns 格式化后的字符串
 */
export function formatCharacterListForPrompt(characterList?: string[]): string {
  const list = characterList || getOfficialCharacterList();
  if (list.length === 0) {
    return '（暂无正式角色）';
  }
  return list.map((name, idx) => `${idx + 1}. ${name}`).join('\n');
}

/**
 * 判断角色名是否为无效的泛指/群体角色
 *
 * @param name 角色名称
 * @returns 是否为无效角色名
 */
export function isInvalidCharacterName(name: string): boolean {
  // 泛指群体关键词
  const groupKeywords = ['们', '群', '众', '所有', '全部'];

  // 描述性称呼关键词
  const descriptiveKeywords = [
    '年轻', '年老', '神秘', '未知', '某', '那个', '这个',
    '路人', '行人', '村民', '士兵', '侍女', '仆人', '守卫',
    '女孩', '男孩', '男人', '女人', '老者', '青年', '少年',
    '黑衣', '白衣', '红衣', '蓝衣'
  ];

  const lowerName = name.toLowerCase();

  // 检查是否包含群体关键词
  if (groupKeywords.some(kw => name.includes(kw))) {
    return true;
  }

  // 检查是否为纯描述性称呼
  if (descriptiveKeywords.some(kw => lowerName.includes(kw))) {
    // 除非是正式的角色代号（如 "神秘人" 作为正式名称）
    // 这里可以添加白名单逻辑
    return true;
  }

  return false;
}
