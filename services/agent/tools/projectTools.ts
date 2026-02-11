import { ToolDefinition } from '../types';

export const updateProjectMetaTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'updateProjectMeta',
    description: 'Update project metadata/settings. Use this when user wants to change book title, genre, target word count, or description. [WRITE TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: 'Internal thought process: Summary of changes being applied.' },
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