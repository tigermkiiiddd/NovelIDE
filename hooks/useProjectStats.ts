
import { useMemo } from 'react';
import { ProjectMeta, FileNode, FileType } from '../types';

export const useProjectStats = (project: ProjectMeta, files: FileNode[]) => {
  return useMemo(() => {
    const draftFolder = files.find(f => f.name.includes('正文草稿') && f.type === FileType.FOLDER);
    const charFolder = files.find(f => f.name.includes('角色档案') && f.type === FileType.FOLDER);
    
    let wordCount = 0;
    let chapterCount = 0;
    if (draftFolder) {
      const drafts = files.filter(f => f.parentId === draftFolder.id);
      chapterCount = drafts.length;
      // 修正：去除所有空白字符（空格、换行）后再统计长度，符合中文正文字数统计习惯
      wordCount = drafts.reduce((acc, f) => {
          const content = f.content || '';
          const cleanContent = content.replace(/\s/g, '');
          return acc + cleanContent.length;
      }, 0);
    }

    let charCount = 0;
    if (charFolder) {
      charCount = files.filter(f => f.parentId === charFolder.id).length;
    }


    const targetWords = (project.targetChapters || 100) * (project.wordsPerChapter || 3000);
    const progressRate = targetWords > 0 ? Math.min(100, Math.round((wordCount / targetWords) * 100)) : 0;

    return {
      wordCount,
      chapterCount,
      charCount,
      progressRate,
      clueRate: 0,
      solvedClues: 0,
      totalClues: 0,
    };
  }, [files, project]);
};
