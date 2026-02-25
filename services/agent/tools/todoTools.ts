import { TodoItem } from "../../../types";
import { TodoOperationResult, ToolDefinition } from "../types";

export const manageTodosTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'manageTodos',
    description: 'Manage the session-based TODO list using BATCH operations. You MUST use this tool to plan and track your work. Single-item operations are forbidden; use arrays for everything. [MEMORY TOOL]',
    parameters: {
      type: 'object',
      properties: {
        thinking: { type: 'string', description: '思考过程(用中文):说明待办事项的更新策略。' },
        action: {
          type: 'string',
          enum: ['add', 'complete', 'remove', 'update', 'list'],
          description: 'Action: "add" new tasks, "complete" tasks by index, "remove" tasks by index, "update" task details, or "list" all.'
        },
        tasks: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of task content strings. Required for action="add".'
        },
        indices: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of 0-based task indices. Required for action="complete" or "remove". Use indices from list output.'
        },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              index: { type: 'number', description: '0-based task index' },
              task: { type: 'string', description: 'New task content' },
              status: { type: 'string', enum: ['pending', 'done'] }
            },
            required: ['index']
          },
          description: 'Array of update objects. Required for action="update".'
        }
      },
      required: ['thinking', 'action']
    }
  }
};

/**
 * Pure logic for handling todo updates.
 * Returns the description string and optionally the new array state.
 */
export const processManageTodos = (
    currentTodos: TodoItem[],
    action: string,
    tasks?: string[],
    indices?: number[],
    updates?: Array<{ index: number; task?: string; status?: string }>
): TodoOperationResult => {
    let result = '';
    let newTodos = [...currentTodos];
    let hasChanges = false;

    switch (action) {
        case 'add':
            if (!tasks || tasks.length === 0) return { result: 'Error: "tasks" array is required for add action.' };
            const newItems: TodoItem[] = tasks.map(t => ({
                id: Math.random().toString(36).substr(2, 5),
                task: t,
                status: 'pending'
            }));
            newTodos = [...newTodos, ...newItems];
            hasChanges = true;
            result = `Batch Added ${newItems.length} tasks:\n${newItems.map((t, i) => `- [${currentTodos.length + i}] ${t.task}`).join('\n')}`;
            break;

        case 'complete':
            if (!indices || indices.length === 0) return { result: 'Error: "indices" array is required for complete action.' };
            let completeCount = 0;
            newTodos = newTodos.map((t, i) => {
                if (indices.includes(i)) {
                    completeCount++;
                    return { ...t, status: 'done' };
                }
                return t;
            });
            if (completeCount > 0) hasChanges = true;
            result = `Batch Completed ${completeCount} tasks (indices: ${indices.join(', ')}).`;
            break;

        case 'remove':
            if (!indices || indices.length === 0) return { result: 'Error: "indices" array is required for remove action.' };
            const validIndices = indices.filter(i => i >= 0 && i < newTodos.length);
            if (validIndices.length === 0) return { result: 'Error: No valid indices provided.' };
            newTodos = newTodos.filter((_, i) => !validIndices.includes(i));
            hasChanges = true;
            result = `Batch Removed ${validIndices.length} tasks (indices: ${validIndices.join(', ')}).`;
            break;

        case 'update':
            if (!updates || updates.length === 0) return { result: 'Error: "updates" array is required for update action.' };
            let updateCount = 0;
            newTodos = newTodos.map((t, i) => {
                const update = updates.find(u => u.index === i);
                if (update) {
                    updateCount++;
                    return { ...t, ...(update.task && { task: update.task }), ...(update.status && { status: update.status }) };
                }
                return t;
            });
            if (updateCount > 0) hasChanges = true;
            result = `Batch Updated ${updateCount} tasks.`;
            break;

        case 'list':
            const listStr = currentTodos.map((t, i) => `- [${t.status === 'done' ? 'x' : ' '}] [${i}] ${t.task}`).join('\n');
            result = listStr || '(Empty Todo List)';
            break;

        default:
            result = `Error: Unknown action ${action}`;
    }

    return { result, newTodos: hasChanges ? newTodos : undefined };
};