/**
 * @file UsageStatsPanel.tsx
 * @description LLM API 调用流量统计面板
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUsageStatsStore } from '../stores/usageStatsStore';
import { BarChart3, Clock, Zap, Trash2, TrendingUp, AlertTriangle } from 'lucide-react';

export function UsageStatsPanel() {
  const { t } = useTranslation();
  const { records, isLoaded, loadRecords, clearRecords, getSummary, getRecentRecords } = useUsageStatsStore();
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  useEffect(() => {
    if (!isLoaded) loadRecords();
  }, [isLoaded, loadRecords]);

  const summary = useMemo(() => getSummary(), [records, getSummary]);
  const recentRecords = useMemo(() => getRecentRecords(20), [records, getRecentRecords]);

  const today = new Date().toISOString().slice(0, 10);
  const todayStats = summary.byDay[today] || { calls: 0, tokens: 0 };

  // 计算本周统计
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekKey = weekStart.toISOString().slice(0, 10);
  let weekCalls = 0;
  let weekTokens = 0;
  for (const [day, stats] of Object.entries(summary.byDay)) {
    if (day >= weekKey) {
      weekCalls += stats.calls;
      weekTokens += stats.tokens;
    }
  }

  const formatNumber = (n: number) => n.toLocaleString();
  const formatTime = (ts: number) => new Date(ts).toLocaleString();
  const formatDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;

  const statusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'aborted': return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'success': return t('usageStats.status.success');
      case 'error': return t('usageStats.status.error');
      case 'aborted': return t('usageStats.status.aborted');
      default: return status;
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart3 size={22} className="text-blue-400" />
          {t('usageStats.title')}
        </h2>
        <button
          onClick={() => setShowConfirmClear(true)}
          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-3 py-1.5 rounded border border-red-800/50 hover:bg-red-900/20 transition-colors"
        >
          <Trash2 size={12} />
          {t('usageStats.clearData')}
        </button>
      </div>

      {/* 确认清空对话框 */}
      {showConfirmClear && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-red-400 shrink-0" />
          <div className="flex-1 text-sm text-red-200">
            {t('usageStats.confirmClearMessage')}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirmClear(false)}
              className="px-3 py-1.5 text-xs text-gray-300 hover:text-white rounded border border-gray-600 hover:bg-gray-700 transition-colors"
            >
              {t('usageStats.buttons.cancel')}
            </button>
            <button
              onClick={() => { clearRecords(); setShowConfirmClear(false); }}
              className="px-3 py-1.5 text-xs text-white bg-red-700 hover:bg-red-600 rounded transition-colors"
            >
              {t('usageStats.buttons.confirmClear')}
            </button>
          </div>
        </div>
      )}

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<Zap size={18} className="text-amber-400" />}
          label={t('usageStats.todayToken')}
          value={formatNumber(todayStats.tokens)}
          sub={t('usageStats.callsCount', { count: todayStats.calls })}
        />
        <StatCard
          icon={<TrendingUp size={18} className="text-blue-400" />}
          label={t('usageStats.weekToken')}
          value={formatNumber(weekTokens)}
          sub={t('usageStats.callsCount', { count: weekCalls })}
        />
        <StatCard
          icon={<BarChart3 size={18} className="text-green-400" />}
          label={t('usageStats.totalToken')}
          value={formatNumber(summary.totalTokens)}
          sub={t('usageStats.callsCount', { count: summary.totalCalls })}
        />
        <StatCard
          icon={<Clock size={18} className="text-purple-400" />}
          label={t('usageStats.avgResponse')}
          value={formatDuration(summary.avgDurationMs)}
          sub={t('usageStats.perCall')}
        />
      </div>

      {/* 模型分布 */}
      {Object.keys(summary.byModel).length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">{t('usageStats.byModel')}</h3>
          <div className="space-y-2">
            {Object.entries(summary.byModel)
              .sort((a, b) => b[1].tokens - a[1].tokens)
              .map(([model, stats]) => (
                <div key={model} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-gray-400 truncate" title={model}>{model}</div>
                  <div className="flex-1 h-5 bg-gray-700/50 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500/60 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (stats.tokens / Math.max(1, summary.totalTokens)) * 100)}%` }}
                    />
                  </div>
                  <div className="w-20 text-right text-xs text-gray-400">
                    {formatNumber(stats.tokens)}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 调用类型分布 */}
      {Object.keys(summary.byType).length > 0 && (
        <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
          <h3 className="text-sm font-bold text-gray-300 mb-3">{t('usageStats.byCallType')}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byType)
              .sort((a, b) => b[1].tokens - a[1].tokens)
              .map(([type, stats]) => (
                <div key={type} className="bg-gray-700/50 border border-gray-600 rounded-lg px-3 py-2">
                  <div className="text-xs text-gray-400 uppercase">{type}</div>
                  <div className="text-sm font-bold text-white">{formatNumber(stats.tokens)} <span className="text-xs font-normal text-gray-500">tokens</span></div>
                  <div className="text-xs text-gray-500">{t('usageStats.times', { count: stats.calls })}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 最近调用列表 */}
      <div className="bg-gray-800/50 border border-gray-700 rounded-lg overflow-hidden">
        <h3 className="text-sm font-bold text-gray-300 px-4 py-3 border-b border-gray-700">{t('usageStats.recentCalls')}</h3>
        {recentRecords.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">{t('usageStats.noRecords')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-700">
                  <th className="px-4 py-2 text-left">{t("usageStats.table.time")}</th>
                  <th className="px-4 py-2 text-left">{t("usageStats.table.model")}</th>
                  <th className="px-4 py-2 text-left">{t("usageStats.table.type")}</th>
                  <th className="px-4 py-2 text-right">{t("usageStats.table.token")}</th>
                  <th className="px-4 py-2 text-right">{t("usageStats.table.duration")}</th>
                  <th className="px-4 py-2 text-center">{t("usageStats.table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map((r) => (
                  <tr key={r.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                    <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{formatTime(r.timestamp)}</td>
                    <td className="px-4 py-2 text-gray-300">{r.model}</td>
                    <td className="px-4 py-2">
                      <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{r.callType}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300">{formatNumber(r.totalTokens)}</td>
                    <td className="px-4 py-2 text-right text-gray-400">{formatDuration(r.durationMs)}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-xs font-medium ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  );
}
