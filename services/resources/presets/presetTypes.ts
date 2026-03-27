/**
 * 预设类型定义
 */

export interface GenrePreset {
  id: string;
  name: string;              // 预设名称（如"玄幻修仙"）
  description: string;       // 预设描述
  genre: string;             // 题材类型
  styleGuide: string;        // 文风规范内容
  skills: string[];          // 预制技能文件名列表
  pleasureRhythm: {          // 推荐爽点节奏
    small: number;           // 小爽点间隔（章数）
    medium: number;          // 中爽点间隔（章数）
    large: number;           // 大爽点间隔（章数）
    description: string;     // 节奏说明
  };
  templates: {               // 预制模板文件（文件名 -> 内容）
    [fileName: string]: string;
  };
  customSkills?: {           // 题材定制技能内容
    [skillFileName: string]: string;  // 文件名 -> 定制内容
  };
  defaultSettings: {         // 默认设置
    wordsPerChapter: number;
    targetChapters: number;
    chaptersPerVolume: number; // 每卷章节数
  };
}
