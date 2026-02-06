
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

    let totalClues = 0;
    let solvedClues = 0;
    const clueFile = files.find(f => f.name.includes('伏笔记录') && f.type === FileType.FILE);
    
    if (clueFile && clueFile.content) {
      const lines = clueFile.content.split('\n');
      lines.forEach(line => {
        if (line.includes('- [ ]')) totalClues++;
        if (line.includes('- [x]')) {
          totalClues++;
          solvedClues++;
        }
      });
    }
    const clueRate = totalClues === 0 ? 0 : Math.round((solvedClues / totalClues) * 100);

    const targetWords = (project.targetChapters || 100) * (project.wordsPerChapter || 3000);
    const progressRate = targetWords > 0 ? Math.min(100, Math.round((wordCount / targetWords) * 100)) : 0;

    return {
      wordCount,
      chapterCount,
      charCount,
      totalClues,
      solvedClues,
      clueRate,
      progressRate
    };
  }, [files, project]);
};
