const fs = require('fs');
let c = fs.readFileSync('services/agent/toolDefinitions/timeline.ts', 'utf8');

// 更新 foreshadowing 参数说明
c = c.replace(
  /`伏笔操作：\n- 创建新伏笔：提供 content, type='planted', duration, tags, hookType\(可选\), strength\(可选\)\n- 推进已有伏笔：提供 existingForeshadowingId, content（描述如何推进）, type='developed'\n- 收尾已有伏笔：提供 existingForeshadowingId, content（描述如何收尾）, type='resolved'\n\n钩子类型：crisis=危机\(⚡\), mystery=悬疑\(❓\), emotion=情感\(💗\), choice=选择\(⚖\), desire=欲望\(🔥\)\n钩子强度：strong=强\(30分\), medium=中\(20分\), weak=弱\(10分\)`/g,
  '`伏笔操作：\n- 创建新伏笔：提供 content, type="planted", plantedChapter, plannedChapter, tags, hookType(可选), strength(可选)\n- 推进已有伏笔：提供 existingForeshadowingId, content（描述如何推进）, type="developed"\n- 收尾已有伏笔：提供 existingForeshadowingId, content（描述如何收尾）, type="resolved"\n\n钩子类型：crisis=危机(⚡), mystery=悬疑(❓), emotion=情感(💗), choice=选择(⚖), desire=欲望(🔥)\n钩子强度：strong=强(30分), medium=中(20分), weak=弱(10分)\n\n**必须提供 plantedChapter 和 plannedChapter（章节数字）**`'
);

// 替换 duration 字段为 plantedChapter/plannedChapter
c = c.replace(
  /duration: {\n                type: string,\n                enum: \['short_term', 'mid_term', 'long_term'\],\n                description: '伏笔时长（仅新伏笔需要）：short_term=1-5章，mid_term=10-20章，long_term=100章以上'\n              },\n                    hookType:/,
  'plantedChapter: {\n                type: number,\n                description: "埋下伏笔的章节序号（必填）"\n              },\n                    plannedChapter: {\n                type: number,\n                description: "计划回收伏笔的章节序号（必填，如跨度5章 = plannedChapter - plantedChapter = 5）"\n              },\n                    hookType:'
);

// 删除 window 字段
c = c.replace(
  /window: {\n                      type: number,\n                      description: '回收窗口（章数，可选），不填则使用默认值'\n                    },\n                    tags:/,
  'tags:'
);

// 更新 required
c = c.replace(
  /required: \['type', 'content'\]\n                \}\n              \}\n            \}\n          \}\n        \},\n            required: \['timestamp', 'title', 'content'\]/,
  'required: [\'type\', \'content\']\n                }\n              }\n            }\n          }\n        },\n            required: [\'timestamp\', \'title\', \'content\']'
);

// 替换 insert 中的 duration 字段
c = c.replace(
  /plantedChapter: {\n                type: number,\n                description: "埋下伏笔的章节序号（必填）"\n              },\n                    plannedChapter: {\n                type: number,\n                description: "计划回收伏笔的章节序号（必填，如跨度5章 = plannedChapter - plantedChapter = 5）"\n              },\n                    hookType: {\n                      type: string,\n                      enum: \['crisis', 'mystery', 'emotion', 'choice', 'desire'\],\n                      description: '钩子类型（可选）：crisis=危机, mystery=悬疑, emotion=情感, choice=选择, desire=欲望'\n                    },\n                        strength: {\n                          type: string,\n                          enum: \['strong', 'medium', 'weak'\],\n                          description: '钩子强度（可选，不填则从 duration 推断）：strong=强\(30分\), medium=中\(20分\), weak=弱\(10分\)'\n                        },\n                        window: {\n                          type: number,\n                          description: '回收窗口（章数，可选），不填则使用默认值'\n                        },\n                        tags: {\n                          type: 'array',\n                          items: { type: 'string' },\n                          description: '伏笔标签（如 \["身世"\]、\["物品\/宝物"\]\)'/,
  'plantedChapter: {\n                type: number,\n                description: "埋下伏笔的章节序号（必填）"\n              },\n                    plannedChapter: {\n                type: number,\n                description: "计划回收伏笔的章节序号（必填，如跨度5章 = plannedChapter - plantedChapter = 5）"\n              },\n                    hookType: {\n                      type: string,\n                      enum: [\'crisis\', \'mystery\', \'emotion\', \'choice\', \'desire\'],\n                      description: \'钩子类型（可选）：crisis=危机, mystery=悬疑, emotion=情感, choice=选择, desire=欲望\'\n                    },\n                        strength: {\n                          type: string,\n                          enum: [\'strong\', \'medium\', \'weak\'],\n                          description: \'钩子强度（可选）：strong=强(30分), medium=中(20分), weak=弱(10分)\'\n                        },\n                        tags: {\n                          type: \'array\',\n                          items: { type: \'string\' },\n                          description: \'伏笔标签（如 ["身世"]、["物品/宝物"])\''
);

// 更新 insert 中的 required
c = c.replace(
  /required: \['type', 'content'\]\n                \}\n              \}\n            \}\n          \}\n        \}\n      \},\n          required: \['afterEventIndex', 'events'\]\n        \},/,
  'required: [\'type\', \'content\']\n                }\n              }\n            }\n          }\n        }\n      },\n          required: [\'afterEventIndex\', \'events\']\n        },'
);

fs.writeFileSync('services/agent/toolDefinitions/timeline.ts', c);
console.log('Done updating timeline.ts');
