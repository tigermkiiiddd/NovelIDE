
import { Type, FunctionDeclaration } from "@google/genai";

export const updateProjectMetaTool: FunctionDeclaration = {
  name: 'updateProjectMeta',
  description: 'Update project metadata/settings. Use this when user wants to change book title, genre, target word count, or description. [WRITE TOOL]',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'New project name (Book Title).' },
      description: { type: Type.STRING, description: 'Project description or core hook.' },
      genre: { type: Type.STRING, description: 'Genre (e.g. Fantasy, Sci-Fi).' },
      wordsPerChapter: { type: Type.INTEGER, description: 'Target words per chapter.' },
      targetChapters: { type: Type.INTEGER, description: 'Target total chapters.' }
    },
  }
};
