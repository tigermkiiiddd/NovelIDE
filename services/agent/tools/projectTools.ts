import { ToolDefinition } from '../types';

export const updateProjectMetaTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'updateProjectMeta',
    description: '⚠️【专用工具】更新系统存储的项目元数据（书名、类型、字数目标、核心梗、标签等）。' +
      '触发词（必须使用此工具）："更新项目档案"、"更新项目设定"、"更新项目信息"、"更新项目元数据"、"修改项目设置"、"修改书名"、"改书名"、"修改类型"、"改类型"、"调整字数目标"、"设置章节数"、"修改项目简介"等。' +
      '⚠️ 注意：这是修改系统内部配置，不是编辑 99_创作规范/模板_项目档案.md 文件。当用户说"项目设定"、"项目档案"、"项目元数据"时指的就是用这个工具。[WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):正在应用的更改摘要。' },
        name: { type: 'string', description: 'New project name (Book Title).' },
        description: { type: 'string', description: 'Project description or core hook.' },
        genre: { type: 'string', description: 'Genre (e.g. Fantasy, Sci-Fi).' },
        wordsPerChapter: { type: 'integer', description: 'Target words per chapter.' },
        targetChapters: { type: 'integer', description: 'Target total chapters.' },
        coreGameplay: {
          type: 'array',
          items: { type: 'string' },
          description: '核心玩法标签（可多选）。例如：["升级打怪", "系统流", "权谋博弈"]。支持自定义标签。'
        },
        narrativeElements: {
          type: 'array',
          items: { type: 'string' },
          description: '叙事元素标签（可多选）。例如：["复仇", "成长", "背叛与信任"]。支持自定义标签。'
        },
        styleTone: {
          type: 'array',
          items: { type: 'string' },
          description: '风格基调标签（可多选）。例如：["热血燃", "悬疑烧脑", "爽文快节奏"]。支持自定义标签。'
        },
        romanceLine: {
          type: 'array',
          items: { type: 'string' },
          description: '感情线标签（可多选）。例如：["单女主", "甜宠无虐", "先婚后爱"]。支持自定义标签。'
        }
      },
      required: ['thinking']
    }
  }
};