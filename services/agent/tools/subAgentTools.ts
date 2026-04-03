import { ToolDefinition } from '../types';

export const callPolishAgentTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'call_polish_agent',
    description: '【去AI文风润色】启动专门的润色子代理，对正文草稿进行去AI化改造。它会读取文件、按 SKILL_TEXT_POLOLISH 规范逐段扫描，使用 patchFile 工具批量修改（每批最多20处），最终生成优化报告。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么要对这个文件进行润色？' },
        target_file: { type: 'string', description: '目标文件路径，如 "05_正文草稿/第一章.md"' }
      },
      required: ['thinking', 'target_file']
    }
  }
};

export const callSearchAgentTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'call_search_agent',
    description: '【全能搜索入口】。这是你查找项目信息的唯一途径。无论是查找特定的关键词、寻找某个文件、还是调研复杂的剧情伏笔，都必须调用此工具。它会启动一个能够自主思考的 Sub-Agent，最终为你提供一份【详细的 Markdown 格式调查报告】。',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):为什么需要启动子 Agent？核心问题是什么？' },
        request_description: { 
          type: 'string', 
          description: '用自然语言清楚描述你要找什么。例如：“找到所有提到‘黑色戒指’的地方” 或 “帮我梳理李逍遥在第二章的心理变化”。' 
        }
      },
      required: ['thinking', 'request_description']
    }
  }
};