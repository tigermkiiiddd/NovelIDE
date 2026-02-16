
import React, { useState } from 'react';
import { AIConfig, AIProvider, OpenAIBackend } from '../types';
import { Cpu, Key, Globe, Box, Save, Hash, Shield, Plus, Trash2, Edit2, Check, AlertTriangle } from 'lucide-react';
import { generateId } from '../services/fileSystem';

interface AISettingsFormProps {
  config: AIConfig;
  onSave: (config: AIConfig) => void;
}

const AISettingsForm: React.FC<AISettingsFormProps> = ({ config, onSave }) => {
  const [tempConfig, setTempConfig] = useState<AIConfig>(JSON.parse(JSON.stringify(config)));
  const [showKey, setShowKey] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);

  // Ensure openAIBackends exists
  if (!tempConfig.openAIBackends) {
      tempConfig.openAIBackends = [];
  }

  const activeBackend = tempConfig.openAIBackends?.find(b => b.id === tempConfig.activeOpenAIBackendId);

  const handleSave = () => {
      // Sync the active backend's data to the root config
      const finalConfig = { ...tempConfig };

      if (activeBackend) {
          finalConfig.baseUrl = activeBackend.baseUrl;
          finalConfig.apiKey = activeBackend.apiKey;
          finalConfig.modelName = activeBackend.modelName;
      }

      onSave(finalConfig);
  };

  const handleAddBackend = () => {
      const newId = generateId();
      const newBackend: OpenAIBackend = {
          id: newId,
          name: 'New Provider',
          baseUrl: 'https://api.openai.com/v1',
          apiKey: '',
          modelName: 'gpt-3.5-turbo'
      };
      setTempConfig(prev => ({
          ...prev,
          openAIBackends: [...(prev.openAIBackends || []), newBackend],
          activeOpenAIBackendId: newId
      }));
  };

  const handleDeleteBackend = () => {
      if (!tempConfig.openAIBackends || tempConfig.openAIBackends.length <= 1) {
          alert("必须保留至少一个配置。");
          return;
      }
      if (!confirm("确定删除此配置吗？")) return;

      const newBackends = tempConfig.openAIBackends.filter(b => b.id !== tempConfig.activeOpenAIBackendId);
      setTempConfig(prev => ({
          ...prev,
          openAIBackends: newBackends,
          activeOpenAIBackendId: newBackends[0].id
      }));
  };

  const updateActiveBackend = (updates: Partial<OpenAIBackend>) => {
      setTempConfig(prev => ({
          ...prev,
          openAIBackends: prev.openAIBackends?.map(b =>
              b.id === prev.activeOpenAIBackendId ? { ...b, ...updates } : b
          )
      }));
  };

  // Check if current model is Gemini (for safety settings hint)
  const isGeminiModel = activeBackend?.modelName?.toLowerCase().includes('gemini') ||
                        activeBackend?.baseUrl?.includes('generativelanguage.googleapis.com');

  return (
     <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-6">
            <h3 className="text-blue-300 font-bold flex items-center gap-2 mb-2">
                <Cpu size={18}/> 模型配置
            </h3>
            <p className="text-xs text-blue-200/70">
                支持 OpenAI 兼容格式，可连接 Google Gemini、DeepSeek、Moonshot、Ollama 等供应商。
            </p>
        </div>

        <div className="space-y-6">
            {/* Provider Config Section */}
            {activeBackend && (
                 <div className="space-y-4 animate-in fade-in bg-gray-800/30 p-4 rounded-xl border border-gray-700">

                    {/* Provider Selector / Manager */}
                    <div className="flex items-end gap-3 mb-2">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-blue-400 mb-1 uppercase tracking-wide">选择供应商</label>
                            <div className="relative">
                                <select
                                    value={activeBackend.id}
                                    onChange={(e) => setTempConfig(prev => ({ ...prev, activeOpenAIBackendId: e.target.value }))}
                                    className="w-full bg-gray-900 border border-gray-600 rounded-lg p-2.5 text-white focus:border-blue-500 focus:outline-none appearance-none"
                                >
                                    {tempConfig.openAIBackends?.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-3 top-3 pointer-events-none text-gray-400">▼</div>
                            </div>
                        </div>
                        <button
                            onClick={handleAddBackend}
                            className="p-2.5 bg-gray-800 border border-gray-600 hover:bg-gray-700 text-blue-400 rounded-lg"
                            title="添加新供应商"
                        >
                            <Plus size={18} />
                        </button>
                    </div>

                    <div className="h-px bg-gray-700 my-4" />

                    {/* Active Provider Editor */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            {isEditingName ? (
                                <div className="flex-1 flex gap-2">
                                    <input
                                        type="text"
                                        value={activeBackend.name}
                                        onChange={e => updateActiveBackend({ name: e.target.value })}
                                        className="flex-1 bg-gray-900 border border-blue-500 rounded px-2 py-1 text-sm text-white focus:outline-none"
                                        autoFocus
                                    />
                                    <button onClick={() => setIsEditingName(false)} className="text-green-400"><Check size={16}/></button>
                                </div>
                            ) : (
                                <h4 className="text-sm font-bold text-white flex-1 flex items-center gap-2">
                                    {activeBackend.name}
                                    <button onClick={() => setIsEditingName(true)} className="text-gray-500 hover:text-white"><Edit2 size={12}/></button>
                                </h4>
                            )}

                            <button
                                onClick={handleDeleteBackend}
                                className="text-gray-500 hover:text-red-400 text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-900/20"
                            >
                                <Trash2 size={14} /> 删除配置
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Globe size={16}/> Base URL
                            </label>
                            <input
                                type="text"
                                value={activeBackend.baseUrl}
                                onChange={e => updateActiveBackend({ baseUrl: e.target.value })}
                                placeholder="https://api.openai.com/v1"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Key size={16}/> API Key
                            </label>
                            <div className="relative">
                                <input
                                    type={showKey ? "text" : "password"}
                                    value={activeBackend.apiKey}
                                    onChange={e => updateActiveBackend({ apiKey: e.target.value })}
                                    placeholder="sk-..."
                                    className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 pr-10 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                                />
                                <button
                                    onClick={() => setShowKey(!showKey)}
                                    className="absolute right-3 top-3 text-gray-500 hover:text-white"
                                >
                                    {showKey ? "隐藏" : "显示"}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Box size={16}/> Model Name
                            </label>
                            <input
                                type="text"
                                value={activeBackend.modelName}
                                onChange={e => updateActiveBackend({ modelName: e.target.value })}
                                placeholder="gpt-4o"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Safety Settings (Gemini only) */}
            <div className="animate-in fade-in">
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Shield size={16}/>
                    Safety Setting
                    {!isGeminiModel && (
                        <span className="text-[10px] text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-800 ml-auto flex items-center gap-1">
                            <AlertTriangle size={10} /> 仅 Gemini 有效
                        </span>
                    )}
                </label>
                <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <select
                        value={tempConfig.safetySetting || 'BLOCK_NONE'}
                        onChange={e => setTempConfig({...tempConfig, safetySetting: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none text-sm appearance-none"
                    >
                        <option value="BLOCK_NONE">创意模式 / 无过滤 (BLOCK_NONE)</option>
                        <option value="BLOCK_ONLY_HIGH">标准模式 (BLOCK_ONLY_HIGH)</option>
                        <option value="BLOCK_MEDIUM_AND_ABOVE">严格模式 (BLOCK_MEDIUM_AND_ABOVE)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                        {isGeminiModel
                            ? "控制 Gemini 模型对敏感内容的过滤阈值。"
                            : "仅当使用 Gemini 模型时生效。其他模型（如 GPT-4、DeepSeek）会自动忽略此参数。"}
                    </p>
                </div>
            </div>

            {/* Max Output Tokens */}
            <div>
                 <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Hash size={16}/> Max Output Tokens
                 </label>
                 <input
                    type="number"
                    value={tempConfig.maxOutputTokens || ''}
                    onChange={e => setTempConfig({...tempConfig, maxOutputTokens: parseInt(e.target.value) || undefined})}
                    placeholder="8192"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                 />
                 <p className="text-xs text-gray-600 mt-1">
                    控制单次回复的最大长度。推荐: 8192。
                 </p>
            </div>
        </div>

        <div className="pt-6 border-t border-gray-800 flex justify-end">
            <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-transform hover:scale-105 shadow-lg shadow-blue-900/30"
            >
                <Save size={18} />
                保存并应用配置
            </button>
        </div>
     </div>
  );
};

export default AISettingsForm;
