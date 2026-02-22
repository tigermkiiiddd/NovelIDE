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
          description: 'Action: "add" new tasks, "complete" tasks by ID, "remove" tasks by ID, "update" task details, or "list" all.' 
        },
        tasks: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Array of task content strings. Required for action="add".' 
        },
        todoIds: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Array of todo IDs. Required for action="complete" or "remove".'
        },
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              task: { type: 'string', description: 'New task content' },
              status: { type: 'string', enum: ['pending', 'done'] }
            },
            required: ['id']
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
    todoIds?: string[], 
    updates?: any[]
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
            result = `Batch Added ${newItems.length} tasks:\n${newItems.map(t => `- [ID:${t.id}] ${t.task}`).join('\n')}`;
            break;

        case 'complete':
            if (!todoIds || todoIds.length === 0) return { result: 'Error: "todoIds" array is required for complete action.' };
            let completeCount = 0;
            newTodos = newTodos.map(t => {
                if (todoIds.includes(t.id)) {
                    completeCount++;
                    return { ...t, status: 'done' };
                }
                return t;
            });
            if (completeCount > 0) hasChanges = true;
            result = `Batch Completed ${completeCount} tasks (IDs: ${todoIds.join(', ')}).`;
            break;

        case 'remove':
            if (!todoIds || todoIds.length === 0) return { result: 'Error: "todoIds" array is required for remove action.' };
            let removeCount = 0;
            newTodos = newTodos.filter(t => {
                if (todoIds.includes(t.id)) {
                    removeCount++;
                    return false; 
                }
                return true;
            });
            if (removeCount > 0) hasChanges = true;
            result = `Batch Removed ${removeCount} tasks (IDs: ${todoIds.join(', ')}).`;
            break;

        case 'update':
            if (!updates || updates.length === 0) return { result: 'Error: "updates" array is required for update action.' };
            let updateCount = 0;
            newTodos = newTodos.map(t => {
                const update = updates.find(u => u.id === t.id);
                if (update) {
                    updateCount++;
                    return { ...t, ...update };
                }
                return t;
            });
            if (updateCount > 0) hasChanges = true;
            result = `Batch Updated ${updateCount} tasks.`;
            break;

        case 'list':
            const listStr = currentTodos.map(t => `- [${t.status === 'done' ? 'x' : ' '}] ID:${t.id} ${t.task}`).join('\n');
            result = listStr || '(Empty Todo List)';
            break;

        default:
            result = `Error: Unknown action ${action}`;
    }

    return { result, newTodos: hasChanges ? newTodos : undefined };
};