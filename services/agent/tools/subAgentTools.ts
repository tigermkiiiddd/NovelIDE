import { ToolDefinition } from '../types';

export const callSearchAgentTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'call_search_agent',
    description: '【全能搜索入口】。这是你查找项目信息的唯一途径。无论是查找特定的关键词、寻找某个文件、还是调研复杂的剧情伏笔，都必须调用此工具。它会启动一个能够自主思考的 Sub-Agent，最终为你提供一份【详细的 Markdown 格式调查报告】。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '【必须使用中文】思考过程：为什么需要启动子 Agent？核心问题是什么？' },
        request_description: { 
          type: 'string', 
          description: '用自然语言清楚描述你要找什么。例如：“找到所有提到‘黑色戒指’的地方” 或 “帮我梳理李逍遥在第二章的心理变化”。' 
        }
      },
      required: ['thinking', 'request_description']
    }
  }
};