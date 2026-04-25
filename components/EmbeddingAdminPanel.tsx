/**
 * @file EmbeddingAdminPanel.tsx
 * @description Embedding 管理面板
 * - 语义召回测试
 * - 缓存状态查看
 * - 诊断工具
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEmbeddingAdminStore } from '../stores/embeddingAdminStore';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { useProjectStore } from '../stores/projectStore';
import { repairKnowledgeNodeEmbeddings, checkKnowledgeNodeEmbeddings } from '../domains/memory/embeddingRepairService';
import { runEmbeddingHealthCheck } from '../domains/memory/embeddingHealthCheck';
import {
  Search, Database, Activity, Trash2, RefreshCw, AlertTriangle,
  CheckCircle, XCircle, Loader2, BarChart3
} from 'lucide-react';

type TabId = 'recall' | 'cache' | 'diagnostics';

export function EmbeddingAdminPanel() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('recall');
  const projectId = useProjectStore((s) => s.currentProjectId);
  const nodes = useKnowledgeGraphStore((s) => s.nodes);

  const {
    isTesting, lastResult, testError,
    cacheStats, isLoadingStats,
    runTest, refreshStats, clearModelCacheAction,
  } = useEmbeddingAdminStore();

  useEffect(() => {
    if (projectId) {
      refreshStats(projectId, nodes);
    }
  }, [projectId, nodes.length]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'recall', label: t('embeddingAdmin.semanticTest'), icon: <Search size={16} /> },
    { id: 'cache', label: t('embeddingAdmin.cacheStatus'), icon: <Database size={16} /> },
    { id: 'diagnostics', label: t('embeddingAdmin.diagnostics'), icon: <Activity size={16} /> },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Database size={22} className="text-purple-400" />
          {t('embeddingAdmin.title')}
        </h2>
      </div>

      {/* 标签页 */}
      <div className="flex gap-1 bg-gray-800/50 border border-gray-700 rounded-lg p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-md transition-colors flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {activeTab === 'recall' && <RecallTestTab />}
      {activeTab === 'cache' && <CacheStatusTab />}
      {activeTab === 'diagnostics' && <DiagnosticsTab />}
    </div>
  );
}

// ==================== Tab 1: 语义召回测试 ====================

function RecallTestTab() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [topK, setTopK] = useState(10);
  const [minSim, setMinSim] = useState(0.3);
  const nodes = useKnowledgeGraphStore((s) => s.nodes);
  const { isTesting, lastResult, testError, runTest } = useEmbeddingAdminStore();

  const handleTest = () => {
    if (!query.trim()) return;
    runTest(query.trim(), nodes, topK, minSim);
  };

  return (
    <div className="space-y-4">
      {/* 查询输入 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
            placeholder={t('embeddingAdmin.queryPlaceholder')}
            className="flex-1 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:border-purple-500 focus:outline-none"
          />
          <button
            onClick={handleTest}
            disabled={isTesting || !query.trim()}
            className="bg-purple-600 hover:bg-purple-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors"
          >
            {isTesting ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {t('embeddingAdmin.testBtn')}
          </button>
        </div>

        {/* 参数 */}
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">TopK</label>
            <input
              type="range" min={1} max={50} value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              className="w-24"
            />
            <span className="text-xs text-gray-300 w-6">{topK}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-400">{t('embeddingAdmin.minSimilarity')}</label>
            <input
              type="range" min={0} max={100} value={Math.round(minSim * 100)}
              onChange={(e) => setMinSim(Number(e.target.value) / 100)}
              className="w-24"
            />
            <span className="text-xs text-gray-300 w-8">{minSim.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* 错误 */}
      {testError && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-3 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle size={14} />
          {testError}
        </div>
      )}

      {/* 结果 */}
      {lastResult && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
            <div className="text-sm font-bold text-gray-300">
              {t('embeddingAdmin.query')}: <span className="text-white">{lastResult.query}</span>
            </div>
            <div className="text-xs text-gray-500">
              {t('embeddingAdmin.elapsed')} {lastResult.durationMs}ms · {t('embeddingAdmin.returned')} {t('embeddingAdmin.resultCount', { count: lastResult.results.length })}
            </div>
          </div>

          {lastResult.results.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">{t('embeddingAdmin.noMatch')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-700">
                    <th className="px-4 py-2 text-left">{t('embeddingAdmin.node')}</th>
                    <th className="px-4 py-2 text-right">{t('embeddingAdmin.semanticScore')}</th>
                    <th className="px-4 py-2 text-right">{t('embeddingAdmin.fuzzyScore')}</th>
                    <th className="px-4 py-2 text-right">{t('embeddingAdmin.importanceScore')}</th>
                    <th className="px-4 py-2 text-right">{t('embeddingAdmin.compositeScore')}</th>
                    <th className="px-4 py-2 text-center">Embedding</th>
                  </tr>
                </thead>
                <tbody>
                  {lastResult.results.map((r) => (
                    <tr key={r.nodeId} className={`border-b border-gray-700/50 hover:bg-gray-700/20 ${!r.hasEmbedding ? 'bg-red-900/10' : ''}`}>
                      <td className="px-4 py-2">
                        <div className="text-gray-200 font-medium">{r.nodeName}</div>
                        <div className="text-xs text-gray-500 truncate max-w-xs">{r.nodeSummary}</div>
                      </td>
                      <td className="px-4 py-2 text-right text-gray-300">{r.semanticScore.toFixed(3)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{r.fuzzyScore.toFixed(3)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{r.importanceScore.toFixed(3)}</td>
                      <td className="px-4 py-2 text-right font-bold text-white">{r.totalScore.toFixed(3)}</td>
                      <td className="px-4 py-2 text-center">
                        {r.hasEmbedding ? (
                          <CheckCircle size={14} className="text-green-400 inline" />
                        ) : (
                          <XCircle size={14} className="text-red-400 inline" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Tab 2: 缓存状态 ====================

function CacheStatusTab() {
  const { t } = useTranslation();
  const { cacheStats, isLoadingStats, refreshStats, clearModelCacheAction } = useEmbeddingAdminStore();
  const projectId = useProjectStore((s) => s.currentProjectId);
  const nodes = useKnowledgeGraphStore((s) => s.nodes);

  if (isLoadingStats) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        <Loader2 size={18} className="animate-spin mr-2" />
        {t('common.loading')}
      </div>
    );
  }

  if (!cacheStats) {
    return (
      <div className="text-center py-12 text-gray-500">
        {t('embeddingAdmin.noCacheData')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 模型缓存 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
            <Database size={14} className="text-blue-400" />
            {t('embeddingAdmin.modelCache')}
          </h3>
          <button
            onClick={() => clearModelCacheAction()}
            className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded border border-red-800/50 hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={10} />
            {t('embeddingAdmin.clearCache')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.status')}:</span>{' '}
            <CacheStatusBadge status={cacheStats.modelCache.status} />
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.cacheEntries')}:</span>{' '}
            <span className="text-white">{cacheStats.modelCache.estimatedEntries}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.database')}:</span>{' '}
            <span className="text-gray-300">{cacheStats.modelCache.dbName}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.storage')}:</span>{' '}
            <span className="text-gray-300">{cacheStats.modelCache.storeName}</span>
          </div>
        </div>
      </div>

      {/* 文件 Chunk 缓存 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-green-400" />
          {t('embeddingAdmin.fileChunkEmbeddings')}
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.chunkCount')}:</span>{' '}
            <span className="text-white font-bold">{cacheStats.fileEmbeddings.chunkCount}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.coveredFiles')}:</span>{' '}
            <span className="text-white">{cacheStats.fileEmbeddings.fileCount}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.project')}:</span>{' '}
            <span className="text-gray-300">{cacheStats.fileEmbeddings.projectId || t('embeddingAdmin.statusNotLoaded')}</span>
          </div>
          <div>
            <span className="text-gray-500">{t('embeddingAdmin.schemaVersion')}:</span>{' '}
            <span className="text-gray-300">v{cacheStats.fileEmbeddings.schemaVersion}</span>
          </div>
        </div>
      </div>

      {/* 知识节点 Embedding */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-3">
          <CheckCircle size={14} className="text-purple-400" />
          {t('embeddingAdmin.nodeEmbeddings')}
        </h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatBox label={t('embeddingAdmin.total')} value={cacheStats.knowledgeNodes.total} />
          <StatBox label={t('embeddingAdmin.valid')} value={cacheStats.knowledgeNodes.withEmbedding} color="text-green-400" />
          <StatBox label={t('embeddingAdmin.missing')} value={cacheStats.knowledgeNodes.withoutEmbedding} color="text-red-400" />
        </div>

        {/* 按 Wing 分布 */}
        {Object.keys(cacheStats.knowledgeNodes.byWing).length > 0 && (
          <div className="space-y-1">
            <div className="text-xs text-gray-500 mb-1">{t('embeddingAdmin.byWing')}</div>
            {Object.entries(cacheStats.knowledgeNodes.byWing).map(([wing, counts]) => (
              <div key={wing} className="flex items-center gap-2 text-sm">
                <span className="w-20 text-gray-400 truncate">{wing}</span>
                <div className="flex-1 h-4 bg-gray-700/50 rounded-full overflow-hidden flex">
                  {counts.with > 0 && (
                    <div
                      className="h-full bg-green-500/60"
                      style={{ width: `${(counts.with / Math.max(1, counts.with + counts.without)) * 100}%` }}
                    />
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {counts.with}/{counts.with + counts.without}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => projectId && refreshStats(projectId, nodes)}
        className="w-full py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:bg-gray-700/30 rounded-lg flex items-center justify-center gap-1.5 transition-colors"
      >
        <RefreshCw size={14} />
        {t('embeddingAdmin.refreshStats')}
      </button>
    </div>
  );
}

// ==================== Tab 3: 诊断工具 ====================

function DiagnosticsTab() {
  const { t } = useTranslation();
  const projectId = useProjectStore((s) => s.currentProjectId);
  const nodes = useKnowledgeGraphStore((s) => s.nodes);
  const [healthReport, setHealthReport] = useState<Awaited<ReturnType<typeof runEmbeddingHealthCheck>> | null>(null);
  const [repairResult, setRepairResult] = useState<{ repaired: number; failed: number; alreadyValid: number } | null>(null);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const runHealthCheck = async () => {
    if (!projectId) return;
    setIsChecking(true);
    try {
      const report = await runEmbeddingHealthCheck(projectId, nodes);
      setHealthReport(report);
    } catch (e) {
      console.error('[Diagnostics] 健康检查失败:', e);
    } finally {
      setIsChecking(false);
    }
  };

  const runRepair = async () => {
    setIsRepairing(true);
    try {
      const result = await repairKnowledgeNodeEmbeddings(nodes, (current, total) => {
        console.log(`[Repair] ${current}/${total}`);
      });
      setRepairResult(result);
      // 触发保存
      const store = useKnowledgeGraphStore.getState();
      // 使用已有的 updateNode 逻辑，不需要额外操作，因为 repair 直接修改了 nodes
    } catch (e) {
      console.error('[Diagnostics] 修复失败:', e);
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 健康检查 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2">
            <Activity size={14} className="text-blue-400" />
            {t('embeddingAdmin.healthCheck')}
          </h3>
          <button
            onClick={runHealthCheck}
            disabled={isChecking}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
          >
            {isChecking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('embeddingAdmin.runCheck')}
          </button>
        </div>

        {healthReport && (
          <div className="space-y-2 text-sm">
            <HealthRow
              label={t('embeddingAdmin.fileEmbeddings')}
              status={healthReport.fileEmbeddings.status}
              detail={t("embeddingAdmin.invalidCount", { count: healthReport.fileEmbeddings.invalidChunks })}
            />
            <HealthRow
              label={t('embeddingAdmin.knowledgeNodes')}
              status={healthReport.knowledgeNodes.status}
              detail={t("embeddingAdmin.validCount", { valid: healthReport.knowledgeNodes.withEmbedding, total: healthReport.knowledgeNodes.total })}
            />
            <HealthRow
              label={t('embeddingAdmin.modelCacheLabel')}
              status={healthReport.modelCache.status === 'ready' ? 'healthy' : 'degraded'}
              detail={healthReport.modelCache.status}
            />
          </div>
        )}
      </div>

      {/* 修复工具 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
        <h3 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-3">
          <RefreshCw size={14} className="text-amber-400" />
          {t('embeddingAdmin.fixMissing')}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          {t('embeddingAdmin.repairDesc')}
        </p>
        <button
          onClick={runRepair}
          disabled={isRepairing}
          className="text-xs bg-amber-600 hover:bg-amber-500 disabled:bg-gray-700 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
        >
          {isRepairing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {isRepairing ? t('embeddingAdmin.fixing') : t('embeddingAdmin.startFix')}
        </button>

        {repairResult && (
          <div className="mt-3 text-sm space-y-1">
            <div className="text-green-400">{t('embeddingAdmin.fixSuccess')}: {repairResult.repaired}</div>
            <div className="text-red-400">{t('embeddingAdmin.fixFailed')}: {repairResult.failed}</div>
            <div className="text-gray-400">{t('embeddingAdmin.originallyValid')}: {repairResult.alreadyValid}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 辅助组件 ====================

function CacheStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const map: Record<string, { text: string; color: string }> = {
    ready: { text: t('embeddingAdmin.statusReady'), color: 'text-green-400' },
    loading: { text: t('embeddingAdmin.statusLoading'), color: 'text-blue-400' },
    error: { text: t('embeddingAdmin.statusError'), color: 'text-red-400' },
    not_loaded: { text: t('embeddingAdmin.statusNotLoaded'), color: 'text-gray-400' },
    unknown: { text: t('embeddingAdmin.statusUnknown'), color: 'text-gray-400' },
  };
  const s = map[status] || map.unknown;
  return <span className={s.color}>{s.text}</span>;
}

function StatBox({ label, value, color = 'text-white' }: { label: string; value: number; color?: string }) {
  return (
    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function HealthRow({ label, status, detail }: { label: string; status: string; detail: string }) {
  const color = status === 'healthy' ? 'text-green-400' : status === 'degraded' ? 'text-yellow-400' : 'text-red-400';
  const icon = status === 'healthy' ? <CheckCircle size={14} className={color} /> : <AlertTriangle size={14} className={color} />;

  return (
    <div className="flex items-center gap-2 bg-gray-900/30 rounded px-3 py-2">
      {icon}
      <span className="text-gray-300 flex-1">{label}</span>
      <span className={`text-xs font-medium ${color} uppercase`}>{status}</span>
      <span className="text-xs text-gray-500">{detail}</span>
    </div>
  );
}
