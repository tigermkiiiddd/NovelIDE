import React, { useState, useMemo } from 'react';
import { X, RotateCcw, Play, Pause, Clock, Zap, Layers, Info } from 'lucide-react';
import { ChatMessage, ChatSession } from '../types';
import {
  classifyMessage,
  classifyMessages,
  ContentValue,
  ToolType,
  MessageClassification,
  ToolDecayConfigs,
  DecayDimension
} from '../domains/agentContext/messageClassifier';

interface MemoryDebugPanelProps {
  session: ChatSession | null;
  onClose: () => void;
}

interface DecayStatus {
  dimension: DecayDimension;
  value: ContentValue;
  maxRounds: number;
  currentRound: number;
  isAlive: boolean;
}

interface MessageWithClassification {
  message: ChatMessage;
  classification: MessageClassification;
  decayStatuses: DecayStatus[];
}

// 计算单个维度的衰减状态
// 这里的 currentRound 含义改为：距当前已过的"轮"数（与 buildSimpleHistory 的 computeRoundsElapsed 保持一致）
const calculateDecayStatus = (
  dimension: DecayDimension,
  config: { value: ContentValue; decayRounds: number },
  roundsSinceAdded: number
): DecayStatus => {
  const maxRounds = config.decayRounds;

  // 高价值永久存活
  if (maxRounds === -1) {
    return { dimension, value: config.value, maxRounds, currentRound: roundsSinceAdded, isAlive: true };
  }

  const isAlive = roundsSinceAdded < maxRounds;
  return { dimension, value: config.value, maxRounds, currentRound: roundsSinceAdded, isAlive };
};

// 计算消息的生命周期状态（支持三个维度）
// roundsSinceAdded = 从当前视角看，这条消息之后已经经历了多少"轮"（user/model 消息）
const calculateMessageLifecycles = (
  message: ChatMessage,
  classification: MessageClassification,
  roundsSinceAdded: number
): DecayStatus[] => {
  const statuses: DecayStatus[] = [];

  // 如果有精细化配置，显示三个维度
  if (classification.toolDecayConfigs && classification.toolType) {
    const configs = classification.toolDecayConfigs;

    // call - 工具名称
    statuses.push(calculateDecayStatus('call', configs.call, roundsSinceAdded));

    // content - 参数内容
    statuses.push(calculateDecayStatus('content', configs.content, roundsSinceAdded));

    // response - 返回结果
    if (classification.isToolResult) {
      statuses.push(calculateDecayStatus('response', configs.response, roundsSinceAdded));
    }
  } else {
    // 非工具消息，使用统一的衰减配置
    const config = { value: classification.contentValue, decayRounds: classification.decayRounds };
    const dimension = classification.decayDimension || 'content_text';
    statuses.push(calculateDecayStatus(dimension, config, roundsSinceAdded));
  }

  return statuses;
};

const MemoryDebugPanel: React.FC<MemoryDebugPanelProps> = ({ session, onClose }) => {
  const [currentRound, setCurrentRound] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // 计算每条消息"距当前已过轮次"（和 buildSimpleHistory 的 computeRoundsElapsed 语义对齐）
  const roundsMap = useMemo(() => {
    if (!session) return new Map<string, number>();

    // 从后往前扫，统计每条消息之后经过了多少轮（user/model）
    let roundCounter = 0;
    const map = new Map<string, number>();
    const msgs = session.messages;

    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      map.set(msg.id, roundCounter);
      if (msg.role === 'user' || msg.role === 'model') {
        roundCounter++;
      }
    }

    return map;
  }, [session]);

  // 计算每条消息的生命周期状态
  const messagesWithLifecycle = useMemo(() => {
    if (!session) return [];

    const classifications = classifyMessages(session.messages);

    return session.messages.map((message, idx) => {
      const classification = classifications[idx];
      const baseRounds = roundsMap.get(message.id) ?? 0;
      // 允许在 Debug 面板里用 currentRound 做一个偏移，模拟"再过 N 轮"的效果
      const effectiveRounds = baseRounds + currentRound;
      const decayStatuses = calculateMessageLifecycles(
        message,
        classification,
        effectiveRounds
      );

      return {
        message,
        classification,
        decayStatuses
      };
    });
  }, [session, currentRound, roundsMap]);

  // 统计信息
  const stats = useMemo(() => {
    if (!session) return null;

    const byValue = {
      [ContentValue.HIGH]: 0,
      [ContentValue.MEDIUM]: 0,
      [ContentValue.LOW]: 0
    };

    messagesWithLifecycle.forEach(m => {
      m.decayStatuses.forEach(s => {
        if (s.isAlive) {
          byValue[s.value]++;
        }
      });
    });

    return {
      total: session.messages.length,
      byValue,
      byRole: {
        user: session.messages.filter(m => m.role === 'user').length,
        model: session.messages.filter(m => m.role === 'model').length,
        system: session.messages.filter(m => m.role === 'system').length
      }
    };
  }, [session, messagesWithLifecycle]);

  // 工具使用统计
  const toolStats = useMemo(() => {
    if (!session) return {};

    const classifications = classifyMessages(session.messages);
    const toolCounts: Record<string, number> = {};

    classifications.forEach(c => {
      if (c.toolType && c.toolType !== ToolType.UNKNOWN) {
        toolCounts[c.toolType] = (toolCounts[c.toolType] || 0) + 1;
      }
    });

    return toolCounts;
  }, [session]);

  // 获取价值颜色
  const getValueColor = (value: ContentValue): string => {
    switch (value) {
      case ContentValue.HIGH: return 'text-green-400';
      case ContentValue.MEDIUM: return 'text-blue-400';
      case ContentValue.LOW: return 'text-yellow-400';
      default: return 'text-gray-400';
    }
  };

  // 获取维度标签
  const getDimensionLabel = (dim: DecayDimension): string => {
    switch (dim) {
      case 'call': return 'call';
      case 'content': return 'content';
      case 'response': return 'response';
      case 'content_text': return 'text';
    }
  };

  // 获取工具类型标签
  const getToolTypeLabel = (type: ToolType): string => {
    const labels: Record<ToolType, string> = {
      [ToolType.READ_FILE]: 'readFile',
      [ToolType.CREATE_FILE]: 'createFile',
      [ToolType.WRITE_FILE]: 'writeFile',
      [ToolType.PATCH_FILE]: 'patchFile',
      [ToolType.UPDATE_FILE]: 'updateFile',
      [ToolType.DELETE_FILE]: 'deleteFile',
      [ToolType.LIST_FILES]: 'listFiles',
      [ToolType.MANAGE_TODOS]: 'manageTodos',
      [ToolType.CALL_SEARCH_AGENT]: 'search',
      [ToolType.MANAGE_PLAN_NOTE]: 'planNote',
      [ToolType.UPDATE_PROJECT_META]: 'meta',
      [ToolType.UNKNOWN]: 'unknown'
    };
    return labels[type] || 'unknown';
  };

  // 获取角色标签
  const getRoleLabel = (role: string): string => {
    switch (role) {
      case 'user': return '用户';
      case 'model': return 'AI';
      case 'system': return '系统';
      default: return role;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center gap-3">
            <Layers className="text-orange-400" size={20} />
            <span className="text-white font-medium">记忆衰减管理</span>
            <span className="text-xs text-gray-400">Debug Mode</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`p-2 rounded-lg transition-colors ${
                autoRefresh ? 'bg-green-600/20 text-green-400' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {autoRefresh ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              onClick={() => setCurrentRound(0)}
              className="p-2 rounded-lg bg-gray-700 text-gray-400 hover:text-white"
            >
              <RotateCcw size={16} />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-700 text-gray-400">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center gap-4 px-4 py-2 bg-gray-850 border-b border-gray-700 text-xs">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-blue-400" />
            <span className="text-gray-300">轮次:</span>
            <input
              type="number"
              value={currentRound}
              onChange={(e) => setCurrentRound(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-16 bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-white text-center"
            />
            <button
              onClick={() => setCurrentRound(r => r + 1)}
              className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
            >
              +1
            </button>
            <button
              onClick={() => setCurrentRound(r => r + 5)}
              className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
            >
              +5
            </button>
            <button
              onClick={() => setCurrentRound(r => r + 10)}
              className="px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs"
            >
              +10
            </button>
          </div>

          {stats && (
            <>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-green-400">{stats.byValue[ContentValue.HIGH]}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500"></span>
                <span className="text-blue-400">{stats.byValue[ContentValue.MEDIUM]}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-yellow-500"></span>
                <span className="text-yellow-400">{stats.byValue[ContentValue.LOW]}</span>
              </div>
            </>
          )}

          <div className="flex-1" />

          <div className="flex items-center gap-2 text-gray-400">
            <Info size={14} />
            <span>call=工具名 content=参数 response=结果</span>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-2">
              {messagesWithLifecycle.map((item, idx) => (
                <div
                  key={item.message.id}
                  className="p-3 rounded-lg border bg-gray-800 border-gray-700"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 font-mono">#{idx + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        item.message.role === 'user' ? 'bg-blue-500/20 text-blue-400' :
                        item.message.role === 'model' ? 'bg-purple-500/20 text-purple-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {getRoleLabel(item.message.role)}
                      </span>

                      {item.classification.toolType && item.classification.toolType !== ToolType.UNKNOWN && (
                        <span className="text-xs px-2 py-0.5 rounded bg-orange-500/20 text-orange-400">
                          {getToolTypeLabel(item.classification.toolType)}
                        </span>
                      )}

                      {item.message.isToolOutput && (
                        <span className="text-xs px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                          result
                        </span>
                      )}

                      {item.classification.isThinking && (
                        <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                          thinking
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Three Dimension Decay Status */}
                  <div className="mt-2 space-y-1">
                    {item.decayStatuses.map((status, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="w-16 text-gray-500 font-mono">{status.dimension}:</span>
                        <span className={`w-8 ${getValueColor(status.value)}`}>
                          {status.value === ContentValue.HIGH ? '高' :
                           status.value === ContentValue.MEDIUM ? '中' : '低'}
                        </span>
                        <span className="text-gray-400">
                          {status.maxRounds === -1 ? '永久' : `${status.currentRound}/${status.maxRounds}轮`}
                        </span>
                        <span className={`${status.isAlive ? 'text-green-400' : 'text-gray-600'}`}>
                          {status.isAlive ? '●' : '○'}
                        </span>
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              status.value === ContentValue.HIGH ? 'bg-green-500' :
                              status.value === ContentValue.MEDIUM ? 'bg-blue-500' : 'bg-yellow-500'
                            }`}
                            style={{
                              width: status.maxRounds === -1
                                ? '100%'
                                : status.isAlive
                                  ? `${((status.maxRounds - status.currentRound) / status.maxRounds) * 100}%`
                                  : '0%'
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar Stats */}
          <div className="w-56 border-l border-gray-700 p-4 overflow-y-auto">
            <h4 className="text-sm font-medium text-gray-300 mb-3">统计</h4>

            {stats && (
              <div className="space-y-3">
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-xs text-gray-500 mb-1">消息数</div>
                  <div className="text-xl text-white font-bold">{stats.total}</div>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-xs text-gray-500 mb-2">按角色</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-blue-400">用户</span>
                      <span className="text-white">{stats.byRole.user}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-400">AI</span>
                      <span className="text-white">{stats.byRole.model}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-xs text-gray-500 mb-2">工具调用</div>
                  <div className="space-y-1 text-xs max-h-40 overflow-y-auto">
                    {Object.entries(toolStats).map(([tool, count]) => (
                      <div key={tool} className="flex justify-between">
                        <span className="text-orange-400">{tool}</span>
                        <span className="text-white">{count}</span>
                      </div>
                    ))}
                    {Object.keys(toolStats).length === 0 && (
                      <div className="text-gray-500 text-center py-2">无</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemoryDebugPanel;
