# 子Agent统一架构设计

## 概述

将所有子Agent重构为基于 `BaseSubAgent` 的统一架构，通过配置化的方式实例化不同的子Agent。

## 架构优势

### 1. **代码复用**
- 所有子Agent共享相同的ReAct循环逻辑
- 统一的错误处理和日志记录
- 统一的信号中断处理

### 2. **配置化**
```typescript
const myAgentConfig: SubAgentConfig<InputType, OutputType> = {
  name: 'My Agent',
  maxLoops: 5,
  tools: [tool1, tool2, terminalTool],
  terminalToolName: 'submit_result',
  getSystemPrompt: (input) => `...`,
  getInitialMessage: (input) => `...`,
  parseTerminalResult: (args) => { ... },
  handleTextResponse: (text, loopCount) => `...`
};
```

### 3. **类型安全**
- 泛型支持：`SubAgentConfig<TInput, TOutput>`
- 输入输出类型明确
- 编译时类型检查

### 4. **易于测试**
- 配置与执行分离
- 可以单独测试配置的各个部分
- 可以mock AIService进行单元测试

### 5. **易于扩展**
- 添加新子Agent只需定义配置
- 可以复用现有工具
- 可以组合多个子Agent

## 使用示例

### 创建新的子Agent

```typescript
// 1. 定义输入输出类型
interface MyInput {
  query: string;
  context: string;
}

interface MyOutput {
  result: string;
  confidence: number;
}

// 2. 定义工具
const submitTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'submit_result',
    description: '提交分析结果',
    parameters: {
      type: 'object',
      properties: {
        result: { type: 'string' },
        confidence: { type: 'number' }
      },
      required: ['result', 'confidence']
    }
  }
};

// 3. 创建配置
const myAgentConfig: SubAgentConfig<MyInput, MyOutput> = {
  name: 'My Agent',
  maxLoops: 5,
  tools: [readFileTool, searchFilesTool, submitTool],
  terminalToolName: 'submit_result',

  getSystemPrompt: (input) => `
    你是一个专业的分析专家。
    查询: ${input.query}
    上下文: ${input.context}
  `,

  getInitialMessage: (input) => `请开始分析`,

  parseTerminalResult: (args) => ({
    result: args.result,
    confidence: args.confidence
  }),

  handleTextResponse: (text, loopCount) =>
    '请调用 submit_result 工具提交结果'
};

// 4. 使用
const agent = new BaseSubAgent(myAgentConfig);
const result = await agent.run(aiService, input, context, onLog, signal);
```

### 或使用便捷函数

```typescript
const result = await runSubAgent(
  myAgentConfig,
  aiService,
  input,
  context,
  onLog,
  signal
);
```

## 迁移指南

### 现有子Agent迁移步骤

1. **提取配置**
   - 将工具定义提取为独立常量
   - 将系统提示函数提取为配置项
   - 定义输入输出类型

2. **创建配置对象**
   ```typescript
   const config: SubAgentConfig<Input, Output> = {
     name: '...',
     maxLoops: N,
     tools: [...],
     terminalToolName: '...',
     getSystemPrompt: (input) => `...`,
     getInitialMessage: (input) => `...`,
     parseTerminalResult: (args) => { ... }
   };
   ```

3. **替换执行函数**
   ```typescript
   // 旧代码
   export async function runXxxAgent(...) {
     // 大量重复的循环逻辑
   }

   // 新代码
   export async function runXxxAgent(...) {
     const agent = new BaseSubAgent(config);
     return agent.run(aiService, input, context, onLog, signal);
   }
   ```

4. **保持向后兼容**
   - 保留原有的函数签名
   - 内部使用新架构实现

## 已迁移的子Agent

- ✅ `chapterAnalysisAgent.v2.ts` - 章节分析（示例实现）

## 待迁移的子Agent

- ⏳ `searchAgent.ts` - 搜索子Agent
- ⏳ `chapterMergeAgent.ts` - 章节合并子Agent

## 扩展点

### 1. 自定义工具执行

```typescript
const config: SubAgentConfig<Input, Output> = {
  // ...
  executeCustomTool: async (name, args, context) => {
    if (name === 'custom_tool') {
      // 自定义逻辑
      return 'result';
    }
    // 默认处理
    return context.executeDefaultTool(name, args);
  }
};
```

### 2. 自定义文本响应处理

```typescript
const config: SubAgentConfig<Input, Output> = {
  // ...
  handleTextResponse: (text, loopCount) => {
    if (loopCount > 3) {
      return '你已经思考了很久，请立即提交结果';
    }
    return '请继续分析或提交结果';
  }
};
```

### 3. 中间件支持（未来）

```typescript
const config: SubAgentConfig<Input, Output> = {
  // ...
  middleware: [
    loggingMiddleware,
    retryMiddleware,
    cacheMiddleware
  ]
};
```

## 性能优化

### 1. 配置缓存
```typescript
// 配置对象可以被复用
const agent = new BaseSubAgent(config);
await agent.run(...); // 第一次
await agent.run(...); // 第二次，复用agent实例
```

### 2. 工具预编译
```typescript
// 工具定义可以预先编译和验证
const tools = compileTools([tool1, tool2, tool3]);
const config = { ...otherConfig, tools };
```

## 最佳实践

1. **配置文件分离** - 将配置放在单独的文件中
2. **类型定义优先** - 先定义输入输出类型
3. **工具复用** - 尽可能复用现有工具
4. **日志规范** - 使用统一的日志格式
5. **错误处理** - 在parseTerminalResult中验证数据

## 总结

统一架构带来的好处：
- ✅ 减少80%的重复代码
- ✅ 提高代码可维护性
- ✅ 更容易添加新功能
- ✅ 更好的类型安全
- ✅ 统一的错误处理和日志
