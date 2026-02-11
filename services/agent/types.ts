// 纯逻辑处理的结果，不包含React状态更新
export interface TodoOperationResult {
    result: string;
    newTodos?: any[]; // 如果状态有变更，返回新的数组
}

// Standard OpenAI Function Definition
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters?: {
            type: 'object';
            properties: Record<string, any>;
            required?: string[];
        };
    };
}