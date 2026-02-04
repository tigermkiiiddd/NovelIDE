
import { FunctionDeclaration } from "@google/genai";

// 纯逻辑处理的结果，不包含React状态更新
export interface TodoOperationResult {
    result: string;
    newTodos?: any[]; // 如果状态有变更，返回新的数组
}
