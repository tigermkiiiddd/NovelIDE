/**
 * planTools.ts
 * Plan 笔记本工具定义和处理逻辑
 */

import { PlanNote, PlanNoteLine } from '../../../types';
import { ToolDefinition } from '../types';

export const managePlanNoteTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'managePlanNote',
    description: `[PLAN MODE ONLY] 记录和更新 Plan 笔记。仅在 Plan 模式下可用。用于记录中途思考、计划分解、方案讨论等。这是一个交互式工具，让用户可以查看和批注你的思考过程。`,
    parameters: {
      type: 'object',
      properties: {
        thinking: {
          type: 'string',
          description: '【必须使用中文】思考过程：说明你对任务的理解、分析思路和方案选择。'
        },
        action: {
          type: 'string',
          enum: ['create', 'append', 'update', 'replace', 'list'],
          description: 'create: 创建新笔记本; append: 追加新行; update: 更新指定行内容; replace: 替换全部内容; list: 列出当前内容'
        },
        title: {
          type: 'string',
          description: '笔记本标题（仅用于 create 操作）'
        },
        lines: {
          type: 'array',
          items: { type: 'string' },
          description: '要添加或替换的内容行数组。每个元素代表一行。'
        },
        lineIds: {
          type: 'array',
          items: { type: 'string' },
          description: '要更新的行ID数组（仅用于 update 操作）'
        },
        newContent: {
          type: 'array',
          items: { type: 'string' },
          description: '更新后的内容数组（仅用于 update 操作，与 lineIds 一一对应）'
        }
      },
      required: ['thinking', 'action']
    }
  }
};

/**
 * Plan 笔记本操作结果
 */
export interface PlanNoteOperationResult {
  result: string;
  planNote?: PlanNote;
  needsUserAction?: boolean; // 是否需要用户审批
}

/**
 * 处理 managePlanNote 工具调用
 */
export const processManagePlanNote = (
  currentPlanNote: PlanNote | null,
  action: string,
  thinking: string,
  createPlanNote: (sessionId: string, projectId: string, title?: string) => PlanNote,
  updatePlanNote: (planId: string, updates: Partial<PlanNote>) => void,
  addLine: (planId: string, text: string) => PlanNoteLine | null,
  updateLine: (planId: string, lineId: string, text: string) => void,
  replaceAllLines: (planId: string, lines: string[]) => void,
  sessionId: string,
  projectId: string,
  title?: string,
  lines?: string[],
  lineIds?: string[],
  newContent?: string[]
): PlanNoteOperationResult => {

  let result = '';
  let planNote: PlanNote | null = currentPlanNote;

  switch (action) {
    case 'create':
      // 创建新的 Plan 笔记本
      const noteTitle = title || `计划 - ${new Date().toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
      planNote = createPlanNote(sessionId, projectId, noteTitle);

      // 如果提供了初始内容，添加到笔记本
      if (lines && lines.length > 0) {
        replaceAllLines(planNote.id, lines);
      }

      result = `✅ 已创建 Plan 笔记本「${noteTitle}」\n\n💡 用户现在可以查看和批注你的计划。请在用户审批后继续执行。`;
      return { result, planNote, needsUserAction: true };

    case 'append':
      if (!currentPlanNote) {
        return { result: '错误：没有活跃的 Plan 笔记本，请先使用 create 创建。' };
      }

      if (!lines || lines.length === 0) {
        return { result: '错误：append 操作需要提供 lines 参数。' };
      }

      // 逐行添加
      for (const line of lines) {
        addLine(currentPlanNote.id, line);
      }

      result = `✅ 已追加 ${lines.length} 行内容到 Plan 笔记本\n\n💡 当前笔记本共 ${currentPlanNote.lines.length + lines.length} 行。`;
      return { result, needsUserAction: false };

    case 'update':
      if (!currentPlanNote) {
        return { result: '错误：没有活跃的 Plan 笔记本。' };
      }

      if (!lineIds || !newContent || lineIds.length !== newContent.length) {
        return { result: '错误：update 操作需要提供 lineIds 和 newContent 参数，且长度必须一致。' };
      }

      // 更新指定行
      for (let i = 0; i < lineIds.length; i++) {
        updateLine(currentPlanNote.id, lineIds[i], newContent[i]);
      }

      result = `✅ 已更新 ${lineIds.length} 行内容`;
      return { result, needsUserAction: false };

    case 'replace':
      if (!currentPlanNote) {
        return { result: '错误：没有活跃的 Plan 笔记本，请先使用 create 创建。' };
      }

      if (!lines) {
        return { result: '错误：replace 操作需要提供 lines 参数。' };
      }

      replaceAllLines(currentPlanNote.id, lines);
      result = `✅ 已替换 Plan 笔记本内容，共 ${lines.length} 行\n\n💡 用户现在可以查看新的计划内容。`;
      return { result, needsUserAction: true };

    case 'list':
      if (!currentPlanNote) {
        return { result: '(无活跃的 Plan 笔记本)' };
      }

      const linesList = currentPlanNote.lines
        .sort((a, b) => a.order - b.order)
        .map(l => `- [ID:${l.id}] ${l.text}`)
        .join('\n');

      const annotationsList = currentPlanNote.annotations.length > 0
        ? `\n\n📝 用户批注:\n${currentPlanNote.annotations.map(a => {
            const line = currentPlanNote!.lines.find(l => l.id === a.lineId);
            return `  - 行"${line?.text?.substring(0, 20)}...": ${a.content}`;
          }).join('\n')}`
        : '';

      result = `📋 Plan 笔记本「${currentPlanNote.title}」\n状态: ${currentPlanNote.status}\n\n${linesList || '(空)'}${annotationsList}`;
      return { result, needsUserAction: false };

    default:
      return { result: `错误：未知操作 ${action}` };
  }
};
