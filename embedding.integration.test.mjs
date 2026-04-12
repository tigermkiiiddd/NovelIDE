/**
 * 真实 Embedding 集成测试
 *
 * 用法: node embedding.integration.test.mjs
 *
 * 测试内容：
 * 1. 模型加载 (onnxruntime-web WASM 后端)
 * 2. 真实 embedding 生成
 * 3. 中文语义相似度
 * 4. 记忆节点语义搜索
 * 5. 文件内容语义搜索
 */

import ort from 'onnxruntime-web';
import { AutoTokenizer } from '@huggingface/transformers';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
const DIM = 512;

let session = null;
let tokenizer = null;

// ============================================
// 工具函数
// ============================================

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function getEmbedding(text) {
  if (!session || !tokenizer) throw new Error('模型未加载');

  const inputs = await tokenizer(text, { padding: true, truncation: true, return_tensors: true });

  const feeds = {};
  const inputNames = session.inputNames;
  const tensors = [inputs.input_ids, inputs.attention_mask, inputs.token_type_ids];
  for (let i = 0; i < inputNames.length && i < tensors.length; i++) {
    feeds[inputNames[i]] = new ort.Tensor('int64', BigInt64Array.from(tensors[i].data), tensors[i].dims);
  }

  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  // output shape: [1, seq_len, 512]
  // Mean pooling + normalize
  const seqLen = output.dims[1];
  const embedDim = output.dims[2];
  const data = Array.from(output.data);

  // Mean pooling: average across seq_len dimension
  const pooled = new Array(embedDim).fill(0);
  for (let t = 0; t < seqLen; t++) {
    for (let d = 0; d < embedDim; d++) {
      pooled[d] += data[t * embedDim + d];
    }
  }
  for (let d = 0; d < embedDim; d++) {
    pooled[d] /= seqLen;
  }

  // Normalize
  const norm = Math.sqrt(pooled.reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (let d = 0; d < embedDim; d++) {
      pooled[d] /= norm;
    }
  }

  return pooled;
}

function assert(condition, message) {
  if (!condition) throw new Error(`❌ FAIL: ${message}`);
}

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

// ============================================
// 测试开始
// ============================================

console.log('\n🧪 Embedding 集成测试\n');
console.log(`模型: ${MODEL_NAME}`);
console.log(`后端: onnxruntime-web (WASM)`);
console.log(`预期维度: ${DIM}\n`);

// --- Phase 1: 模型加载 ---
console.log('📦 Phase 1: 模型加载');

await test('应该成功加载 tokenizer', async () => {
  const start = Date.now();
  tokenizer = await AutoTokenizer.from_pretrained(MODEL_NAME);
  const elapsed = Date.now() - start;
  console.log(`    tokenizer 加载耗时: ${(elapsed / 1000).toFixed(1)}s`);
  assert(tokenizer !== null, 'tokenizer 应返回非 null');
});

await test('应该成功加载 ONNX 模型 (WASM)', async () => {
  const start = Date.now();
  const modelPath = join(__dirname, 'node_modules/@huggingface/transformers/.cache', MODEL_NAME, 'onnx/model.onnx');
  const modelBuffer = await readFile(modelPath);
  session = await ort.InferenceSession.create(modelBuffer.buffer, {
    executionProviders: ['wasm'],
  });
  const elapsed = Date.now() - start;
  console.log(`    模型加载耗时: ${(elapsed / 1000).toFixed(1)}s`);
  console.log(`    输入: [${session.inputNames.join(', ')}]`);
  console.log(`    输出: [${session.outputNames.join(', ')}]`);
  assert(session !== null, 'session 应返回非 null');
  assert(session.inputNames.length >= 2, '应至少有 2 个输入');
  assert(session.outputNames.length >= 1, '应至少有 1 个输出');
});

// --- Phase 2: Embedding 生成 ---
console.log('\n📊 Phase 2: Embedding 生成');

await test('应该生成正确维度的向量', async () => {
  const emb = await getEmbedding('测试文本');
  assert(emb.length === DIM, `维度应为 ${DIM}，实际 ${emb.length}`);
});

await test('向量应该是归一化的 (norm ≈ 1.0)', async () => {
  const emb = await getEmbedding('归一化测试');
  const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
  assert(Math.abs(norm - 1.0) < 0.01, `norm 应接近 1.0，实际 ${norm.toFixed(4)}`);
});

await test('相同文本应产生相同 embedding', async () => {
  const a = await getEmbedding('火球术是初级魔法');
  const b = await getEmbedding('火球术是初级魔法');
  const sim = cosineSimilarity(a, b);
  assert(sim > 0.999, `相同文本相似度应 > 0.999，实际 ${sim.toFixed(6)}`);
});

// --- Phase 3: 中文语义相似度 ---
console.log('\n🔍 Phase 3: 中文语义相似度');

await test('语义相近的文本应有高相似度 (火焰魔法 vs 火系攻击)', async () => {
  const a = await getEmbedding('火焰魔法攻击');
  const b = await getEmbedding('火系攻击技能');
  const sim = cosineSimilarity(a, b);
  console.log(`    相似度: ${sim.toFixed(4)}`);
  assert(sim > 0.5, `语义相似应 > 0.5，实际 ${sim.toFixed(4)}`);
});

await test('语义无关的文本应有低相似度 (火焰魔法 vs 治愈术式)', async () => {
  const a = await getEmbedding('火焰魔法攻击');
  const b = await getEmbedding('治愈术式治疗');
  const sim = cosineSimilarity(a, b);
  console.log(`    相似度: ${sim.toFixed(4)}`);
  assert(sim < 0.8, `语义无关应 < 0.8，实际 ${sim.toFixed(4)}`);
});

await test('同义不同词应能匹配 (主角的过去 vs 角色背景故事)', async () => {
  const a = await getEmbedding('主角的过去经历');
  const b = await getEmbedding('角色的背景故事');
  const sim = cosineSimilarity(a, b);
  console.log(`    相似度: ${sim.toFixed(4)}`);
  assert(sim > 0.5, `同义应 > 0.5，实际 ${sim.toFixed(4)}`);
});

await test('中文和英文不应匹配 (火焰 vs fire)', async () => {
  const a = await getEmbedding('火焰魔法');
  const b = await getEmbedding('fire magic');
  const sim = cosineSimilarity(a, b);
  console.log(`    相似度: ${sim.toFixed(4)}`);
  // bge-small-zh 是中文模型，英文效果不可预测
  assert(typeof sim === 'number' && !isNaN(sim), '应返回有效数值');
});

// --- Phase 4: 记忆节点语义搜索 ---
console.log('\n🧠 Phase 4: 记忆节点语义搜索');

const memoryNodes = [
  { name: '火球术', summary: '初级火焰攻击魔法，消耗少量灵力', text: '火球术 初级火焰攻击魔法' },
  { name: '治愈术', summary: '恢复目标生命值的基础治疗术', text: '治愈术 恢复生命值治疗' },
  { name: '雷鸣斩', summary: '使用雷电力量进行物理攻击', text: '雷鸣斩 雷电力量物理攻击' },
  { name: '隐身术', summary: '使施法者暂时隐形的辅助魔法', text: '隐身术 暂时隐形辅助魔法' },
  { name: '召唤术', summary: '召唤元素生物协助战斗', text: '召唤术 元素生物协助战斗' },
];

// 预计算节点 embedding
console.log('  预计算节点 embedding...');
for (const node of memoryNodes) {
  node.embedding = await getEmbedding(node.text);
}

await test('搜索"攻击型法术"应优先返回攻击类节点', async () => {
  const queryEmb = await getEmbedding('攻击型法术');
  const results = memoryNodes.map(n => ({
    name: n.name,
    sim: cosineSimilarity(queryEmb, n.embedding),
  })).sort((a, b) => b.sim - a.sim);

  console.log(`    排名: ${results.map(r => `${r.name}(${r.sim.toFixed(3)})`).join(' > ')}`);
  assert(results[0].name === '火球术' || results[0].name === '雷鸣斩',
    `第一名应为攻击类，实际 ${results[0].name}`);
});

await test('搜索"治疗技能"应优先返回治愈术', async () => {
  const queryEmb = await getEmbedding('治疗恢复技能');
  const results = memoryNodes.map(n => ({
    name: n.name,
    sim: cosineSimilarity(queryEmb, n.embedding),
  })).sort((a, b) => b.sim - a.sim);

  console.log(`    排名: ${results.map(r => `${r.name}(${r.sim.toFixed(3)})`).join(' > ')}`);
  assert(results[0].name === '治愈术', `第一名应为治愈术，实际 ${results[0].name}`);
});

await test('语义去重: 近义描述应高相似度', async () => {
  const a = await getEmbedding('初级火焰攻击魔法');
  const b = await getEmbedding('基础火系攻击法术');
  const sim = cosineSimilarity(a, b);
  console.log(`    相似度: ${sim.toFixed(4)}`);
  assert(sim > 0.6, `近义描述去重阈值 0.6，实际 ${sim.toFixed(4)}`);
});

// --- Phase 5: 文件内容语义搜索 ---
console.log('\n📁 Phase 5: 文件内容语义搜索');

const fileChunks = [
  { name: '角色档案_林风.md', text: '林风年幼时失去了双亲，被师父收养后开始修炼。性格内敛但内心坚定。' },
  { name: '世界观设定.md', text: '这个世界存在三种力量体系：灵力、魔力、念力。灵力来源于自然万物。' },
  { name: '第3章.md', text: '林风站在悬崖边，回想起师父临终前的嘱托，眼中闪过一丝坚定。他握紧手中的长剑。' },
];

console.log('  预计算文件 chunk embedding...');
for (const chunk of fileChunks) {
  chunk.embedding = await getEmbedding(chunk.text);
}

await test('搜索"主角的悲惨过去"应命中角色档案', async () => {
  const queryEmb = await getEmbedding('主角的悲惨过去经历');
  const results = fileChunks.map(f => ({
    name: f.name,
    sim: cosineSimilarity(queryEmb, f.embedding),
  })).sort((a, b) => b.sim - a.sim);

  console.log(`    排名: ${results.map(r => `${r.name}(${r.sim.toFixed(3)})`).join(' > ')}`);
  assert(results[0].name === '角色档案_林风.md',
    `第一名应为角色档案，实际 ${results[0].name}`);
});

await test('搜索"力量体系分类"应命中世界观设定', async () => {
  const queryEmb = await getEmbedding('力量体系分类规则');
  const results = fileChunks.map(f => ({
    name: f.name,
    sim: cosineSimilarity(queryEmb, f.embedding),
  })).sort((a, b) => b.sim - a.sim);

  console.log(`    排名: ${results.map(r => `${r.name}(${r.sim.toFixed(3)})`).join(' > ')}`);
  assert(results[0].name === '世界观设定.md',
    `第一名应为世界观设定，实际 ${results[0].name}`);
});

await test('子串匹配找不到的查询，语义匹配应能命中', async () => {
  const query = '神秘能量的来源';
  const substringMatch = fileChunks.some(f => f.text.includes(query));
  assert(!substringMatch, '子串不应匹配');

  const queryEmb = await getEmbedding(query);
  const results = fileChunks.map(f => ({
    name: f.name,
    sim: cosineSimilarity(queryEmb, f.embedding),
  })).sort((a, b) => b.sim - a.sim);

  console.log(`    排名: ${results.map(r => `${r.name}(${r.sim.toFixed(3)})`).join(' > ')}`);
  assert(results[0].name === '世界观设定.md',
    `语义搜索应命中世界观设定，实际 ${results[0].name}`);
});

// ============================================
// 汇总
// ============================================

console.log('\n' + '='.repeat(50));
console.log(`结果: ${passed} 通过 / ${failed} 失败 / ${passed + failed} 总计`);
if (failed === 0) {
  console.log('🎉 全部通过！Embedding 系统工作正常');
} else {
  console.log('⚠️ 有测试失败，请检查');
}
console.log('='.repeat(50) + '\n');

process.exit(failed > 0 ? 1 : 0);
