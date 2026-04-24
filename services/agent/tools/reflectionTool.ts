
import { ToolDefinition } from '../types';

export const reflectionTool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'reflection',
    description: `[内部反思工具] 在关键节点暂停并深度反思。可以多次调用形成思维链，每次反思必须有具体发现。

**什么时候必须调用：**
1. 执行完复杂操作/大型工具后 — 检查结果是否符合预期，有无遗漏或副作用
2. 收到用户反馈后（尤其是纠正、不满、推翻之前设定时）— 分析用户的真实意图和情绪
3. 最终回复前 — 检查回复是否完整、准确、符合用户期望
4. 发现前后矛盾时 — 回溯检查哪里出了问题
5. 方向不确定时 — 判断当前路径是否正确，是否需要调整

**什么时候可以跳过：**
- 简单的一轮一问一答，没有复杂操作
- 用户只是闲聊或简单确认

**调用要求：**
- 不要流于形式，每次反思必须有具体发现（哪怕"没问题"也要说明为什么）
- 可以链式调用：发现问题 → 深入反思根源 → 反思解决方案
- 低置信度时（<0.7）应该再次反思或考虑向用户澄清
- 反思内容静默记录，不生成UI消息`,
    parameters: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['operation_result', 'user_feedback', 'final_check', 'contradiction', 'direction'],
          description: '反思焦点：operation_result=操作结果检查 | user_feedback=用户反馈分析 | final_check=最终回复前检查 | contradiction=矛盾回溯 | direction=方向判断'
        },
        observation: {
          type: 'string',
          description: '观察：你看到了什么具体事实/结果/反馈？不要加入解释，只陈述事实。'
        },
        analysis: {
          type: 'string',
          description: '分析：这意味着什么？用户的真实意图是什么？操作结果是否符合预期？发现了什么矛盾？深入挖掘，不要停留在表面。'
        },
        conclusion: {
          type: 'string',
          description: '结论：接下来应该怎么做？需要调整方向吗？需要补充什么？还是继续原方案？给出明确的行动建议。'
        },
        confidence: {
          type: 'number',
          description: '你对这个结论的置信度 0-1。低置信度（<0.7）说明需要再次反思或向用户澄清。'
        }
      },
      required: ['focus', 'observation', 'analysis', 'conclusion']
    }
  }
};
