import { ToolDefinition } from '../types';

export const updateProjectMetaTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'updateProjectMeta',
    description: '更新系统存储的项目元数据（书名、类型、字数目标、核心梗等）。当用户要求"更新项目信息"、"修改项目设置"、"更新项目档案"时使用此工具。注意：这不是创建markdown文件，而是修改系统内部的项目配置。[WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):正在应用的更改摘要。' },
        name: { type: 'string', description: 'New project name (Book Title).' },
        description: { type: 'string', description: 'Project description or core hook.' },
        genre: { type: 'string', description: 'Genre (e.g. Fantasy, Sci-Fi).' },
        wordsPerChapter: { type: 'integer', description: 'Target words per chapter.' },
        targetChapters: { type: 'integer', description: 'Target total chapters.' }
      },
      required: ['thinking']
    }
  }
};