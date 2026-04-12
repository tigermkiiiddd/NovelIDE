/**
 * @file memoryStackService.ts
 * @description 4层记忆栈加载策略（对齐 MemPalace）
 *
 * L0 身份 (~100 tokens): Agent 身份 + 项目元信息 → 始终加载
 * L1 关键事实 (~500 tokens): critical 知识节点 + 角色设定索引 → 始终加载
 * L2 项目上下文 (~800 tokens): 按需加载 — 检测用户话题匹配 Wing/Room 后才注入
 * L3 深度检索: 所有 normal 知识 + 情景记忆 → 仅工具查询
 */

import { KnowledgeNode, KnowledgeWing, WING_LABELS, WING_ROOMS } from '../../types';
import { useMemoryStackStore, MemoryLayer, MemoryStackContent } from '../../stores/memoryStackStore';
import { generateEmbedding, cosineSimilarity } from './embeddingService';

// Token 估算：中文约 1.5 token/字
const estimateTokens = (text: string): number => Math.ceil(text.length * 1.5);

// ============================================
// L0: Agent 身份
// ============================================

export function buildL0Identity(
  agentInstruction: string,
  projectInfo: string,
  fileTree: string,
  todos: string,
  userInputHistory: string,
  wordsPerChapter: string,
  templateList: string,
  skillList: string,
): MemoryStackContent {
  const content = agentInstruction
    .replace(/\{\{PROJECT_INFO\}\}/g, projectInfo)
    .replace(/\{\{PENDING_TODOS\}\}/g, todos)
    .replace(/\{\{USER_INPUT_HISTORY\}\}/g, userInputHistory)
    .replace(/\{\{FILE_TREE\}\}/g, fileTree)
    .replace(/\{\{WORDS_PER_CHAPTER\}\}/g, wordsPerChapter)
    .replace(/\{\{TEMPLATE_LIST\}\}/g, templateList)
    .replace(/\{\{SKILL_LIST\}\}/g, skillList);

  return {
    layer: 'L0',
    content,
    tokenEstimate: estimateTokens(content),
    sources: ['agent_instruction', 'project_meta'],
  };
}

// ============================================
// L1: 关键事实
// ============================================

export function buildL1KeyFacts(
  knowledgeNodes: KnowledgeNode[],
  characterProfiles: string,
): MemoryStackContent {
  const parts: string[] = [];

  // Critical 节点 — 全量注入
  const critical = knowledgeNodes.filter(n => n.importance === 'critical');
  if (critical.length > 0) {
    let section = `## 📚 关键知识（必须遵守）\n> 共 ${critical.length} 条关键知识\n\n`;
    section += critical.map(n => {
      let entry = `### ${n.name}\n- 分类: ${n.category}/${n.subCategory}`;
      if (n.wing) {
        const wingLabel = WING_LABELS[n.wing];
        entry += ` | Wing: ${wingLabel}${n.room ? `/${n.room}` : ''}`;
      }
      entry += `\n- 标签: ${n.tags?.join(', ') || '无'}\n- 摘要: ${n.summary}`;
      if (n.detail) entry += `\n- 详情: ${n.detail}`;
      return entry;
    }).join('\n\n');
    parts.push(section);
  }

  // 角色档案索引
  if (characterProfiles) {
    parts.push(characterProfiles);
  }

  const content = parts.join('\n\n');
  return {
    layer: 'L1',
    content,
    tokenEstimate: estimateTokens(content),
    sources: critical.map(n => n.id),
  };
}

// ============================================
// L2: 按需加载（话题检测 → Wing/Room 匹配）
// ============================================

// Wing 话题关键词映射（对齐 MemPalace 的 topic detection）
const WING_KEYWORDS: Record<KnowledgeWing, string[]> = {
  world: ['世界', '设定', '魔法', '力量', '体系', '地理', '环境', '势力', '物品', '道具', '种族', '历史', '背景', '大陆'],
  writing_rules: ['规则', '风格', '叙事', '描写', '对话', '禁止', '忌讳', '格式', '规范', '技巧', '文风', '用语', '写法'],
  characters: ['角色', '人物', '性格', '关系', '状态', '外貌', '背景', '口吻', '语气'],
  plot: ['剧情', '大纲', '伏笔', '主线', '支线', '章节', '事件', '时间线', '冲突', '转折'],
  project: ['项目', '模板', '计划', '目标', '设置', '大纲', '结构'],
};

/**
 * 从用户消息中检测相关的 Wing（对齐 MemPalace L2 topic detection）
 */
function detectRelevantWings(userMessage: string, nodes: KnowledgeNode[]): Set<KnowledgeWing> {
  const msg = userMessage.toLowerCase();
  const matched = new Set<KnowledgeWing>();

  // 1. Wing 关键词匹配
  for (const [wing, keywords] of Object.entries(WING_KEYWORDS)) {
    if (keywords.some(kw => msg.includes(kw))) {
      matched.add(wing as KnowledgeWing);
    }
  }

  // 2. 节点标签匹配（important 节点的标签出现在用户消息中 → 该节点所在 Wing 相关）
  const important = nodes.filter(n => n.importance === 'important');
  for (const node of important) {
    if (node.wing && (node.tags || []).some(tag => msg.includes(tag.toLowerCase()))) {
      matched.add(node.wing);
    }
  }

  // 3. 节点名称/摘要匹配（important 节点的关键词出现在用户消息中）
  for (const node of important) {
    if (node.wing) {
      const nameLower = node.name.toLowerCase();
      const summaryWords = node.summary.toLowerCase().split(/[\s,，。；;、]+/).filter(w => w.length >= 2);
      if (msg.includes(nameLower) || summaryWords.some(w => msg.includes(w))) {
        matched.add(node.wing);
      }
    }
  }

  return matched;
}

/**
 * 语义检测相关 Wings — 用 embedding 相似度替代关键词匹配
 * 当关键词检测无结果时作为 fallback
 */
async function detectRelevantWingsSemantic(
  userMessage: string,
  nodes: KnowledgeNode[],
): Promise<Set<KnowledgeWing>> {
  const important = nodes.filter(n => n.importance === 'important' && n.embedding && n.embedding.length > 0);
  if (important.length === 0) return new Set();

  try {
    const queryEmb = await generateEmbedding(userMessage);
    const matched = new Set<KnowledgeWing>();

    // 对每个 Wing 找最高相似度的节点
    const wingScores = new Map<KnowledgeWing, number>();
    for (const node of important) {
      if (!node.wing) continue;
      const sim = cosineSimilarity(queryEmb, node.embedding!);
      const current = wingScores.get(node.wing) || 0;
      wingScores.set(node.wing, Math.max(current, sim));
    }

    // 相似度 > 0.4 的 Wing 视为相关
    for (const [wing, score] of wingScores) {
      if (score > 0.4) {
        matched.add(wing);
      }
    }

    return matched;
  } catch {
    return new Set();
  }
}

/**
 * 异步版 loadL2OnDemand — 关键词检测 + 语义 fallback
 */
export async function loadL2OnDemandSemantic(
  knowledgeNodes: KnowledgeNode[],
  userMessage: string | null,
  tokenBudget: number = 800,
): Promise<MemoryStackContent> {
  const important = knowledgeNodes.filter(n => n.importance === 'important');

  if (important.length === 0 || !userMessage) {
    return { layer: 'L2', content: '', tokenEstimate: 0, sources: [] };
  }

  // 先尝试关键词检测（快速、零成本）
  let relevantWings = detectRelevantWings(userMessage, knowledgeNodes);

  // 关键词无匹配 → 语义 fallback
  if (relevantWings.size === 0) {
    relevantWings = await detectRelevantWingsSemantic(userMessage, knowledgeNodes);
  }

  if (relevantWings.size === 0) {
    return { layer: 'L2', content: '', tokenEstimate: 0, sources: [] };
  }

  // 按匹配的 Wing 过滤节点（复用同步版逻辑）
  const matched = important.filter(n => n.wing && relevantWings.has(n.wing));
  const unmatched = important.filter(n => !n.wing || !relevantWings.has(n.wing));

  const selected: KnowledgeNode[] = [];
  let usedTokens = 0;

  for (const node of matched) {
    if (usedTokens >= tokenBudget) break;
    selected.push(node);
    usedTokens += estimateTokens(`${node.name}: ${node.summary}`);
  }

  for (const node of unmatched.slice(0, 2)) {
    if (usedTokens >= tokenBudget) break;
    selected.push(node);
    usedTokens += estimateTokens(`${node.name}: ${node.summary}`);
  }

  if (selected.length === 0) {
    return { layer: 'L2', content: '', tokenEstimate: 0, sources: [] };
  }

  const wingNames = [...relevantWings].map(w => WING_LABELS[w]).join('、');
  let section = `## 🔖 相关重要知识（话题: ${wingNames}）\n> 共 ${selected.length} 条相关记忆\n\n`;
  section += selected.map(n => {
    const tags = n.tags?.length > 0 ? ` [${n.tags.join(', ')}]` : '';
    const wingInfo = n.wing ? ` (${WING_LABELS[n.wing]}${n.room ? `/${n.room}` : ''})` : '';
    return `- **${n.name}**${wingInfo}: ${n.summary}${tags}`;
  }).join('\n');

  return {
    layer: 'L2',
    content: section,
    tokenEstimate: estimateTokens(section),
    sources: selected.map(n => n.id),
  };
}

/**
 * L2 按需加载：根据用户消息加载相关 important 节点（对齐 MemPalace on-demand L2）
 *
 * 如果检测到相关话题 → 加载匹配 Wing 的 important 节点
 * 如果未检测到话题 → L2 为空（节省 ~800 tokens）
 */
export function loadL2OnDemand(
  knowledgeNodes: KnowledgeNode[],
  userMessage: string | null,
  tokenBudget: number = 800,
): MemoryStackContent {
  const important = knowledgeNodes.filter(n => n.importance === 'important');

  // 无 important 节点或无用户消息 → 空 L2
  if (important.length === 0 || !userMessage) {
    return {
      layer: 'L2',
      content: '',
      tokenEstimate: 0,
      sources: [],
    };
  }

  // 检测相关 Wings
  const relevantWings = detectRelevantWings(userMessage, knowledgeNodes);

  // 无匹配话题 → 空 L2（节省 token）
  if (relevantWings.size === 0) {
    return {
      layer: 'L2',
      content: '',
      tokenEstimate: 0,
      sources: [],
    };
  }

  // 按匹配的 Wing 过滤节点
  const matched = important.filter(n => n.wing && relevantWings.has(n.wing));
  const unmatched = important.filter(n => !n.wing || !relevantWings.has(n.wing));

  // 在 token 预算内选取节点（优先匹配的 Wing，再填充无 Wing 的）
  const selected: KnowledgeNode[] = [];
  let usedTokens = 0;

  for (const node of matched) {
    if (usedTokens >= tokenBudget) break;
    selected.push(node);
    usedTokens += estimateTokens(`${node.name}: ${node.summary}`);
  }

  for (const node of unmatched.slice(0, 2)) {
    if (usedTokens >= tokenBudget) break;
    selected.push(node);
    usedTokens += estimateTokens(`${node.name}: ${node.summary}`);
  }

  if (selected.length === 0) {
    return {
      layer: 'L2',
      content: '',
      tokenEstimate: 0,
      sources: [],
    };
  }

  const wingNames = [...relevantWings].map(w => WING_LABELS[w]).join('、');
  let section = `## 🔖 相关重要知识（话题: ${wingNames}）\n> 共 ${selected.length} 条相关记忆\n\n`;
  section += selected.map(n => {
    const tags = n.tags?.length > 0 ? ` [${n.tags.join(', ')}]` : '';
    const wingInfo = n.wing ? ` (${WING_LABELS[n.wing]}${n.room ? `/${n.room}` : ''})` : '';
    return `- **${n.name}**${wingInfo}: ${n.summary}${tags}`;
  }).join('\n');

  return {
    layer: 'L2',
    content: section,
    tokenEstimate: estimateTokens(section),
    sources: selected.map(n => n.id),
  };
}

// ============================================
// 记忆栈构建入口
// ============================================

export function buildMemoryStack(params: {
  agentInstruction: string;
  projectInfo: string;
  fileTree: string;
  todos: string;
  userInputHistory: string;
  wordsPerChapter: string;
  templateList: string;
  skillList: string;
  knowledgeNodes: KnowledgeNode[];
  characterProfiles: string;
  userMessage?: string | null;
  l2TokenBudget?: number;
}): string {
  const store = useMemoryStackStore.getState();

  // Build L0
  const l0 = buildL0Identity(
    params.agentInstruction,
    params.projectInfo,
    params.fileTree,
    params.todos,
    params.userInputHistory,
    params.wordsPerChapter,
    params.templateList,
    params.skillList,
  );
  store.setLayer('L0', l0);

  // Build L1
  const l1 = buildL1KeyFacts(params.knowledgeNodes, params.characterProfiles);
  store.setLayer('L1', l1);

  // Build L2 — 按需加载：根据用户消息检测话题，只加载匹配的 Wing（对齐 MemPalace）
  const l2 = loadL2OnDemand(
    params.knowledgeNodes,
    params.userMessage || null,
    params.l2TokenBudget,
  );
  store.setLayer('L2', l2);

  // Compile prompt (L0 + L1 + L2)
  return store.getCompiledPrompt();
}

// ============================================
// L2 语义增强（异步，可选调用）
// ============================================

/**
 * 用语义搜索替换 L2 内容（如果 embedding 可用）。
 * 在 useAgentEngine 的 async 上下文中调用，增强下一轮 system prompt。
 * 使用关键词+语义双重检测，比同步版更精准。
 */
export async function enhanceL2WithSemantics(
  knowledgeNodes: KnowledgeNode[],
  currentContext: string,
  tokenBudget: number = 800,
): Promise<MemoryStackContent | null> {
  const important = knowledgeNodes.filter(n => n.importance === 'important');
  if (important.length === 0 || !currentContext) return null;

  const hasEmbeddings = important.some(n => n.embedding && n.embedding.length > 0);
  if (!hasEmbeddings) return null;

  try {
    // 使用关键词+语义双重检测
    const l2 = await loadL2OnDemandSemantic(knowledgeNodes, currentContext, tokenBudget);

    if (!l2.content) return null;

    const store = useMemoryStackStore.getState();
    store.setLayer('L2', l2);
    return l2;
  } catch (e) {
    console.warn('[MemoryStack] L2 语义增强失败:', e);
    return null;
  }
}
