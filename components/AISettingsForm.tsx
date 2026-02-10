
import React, { useState } from 'react';
import { AIConfig, AIProvider } from '../types';
import { Cpu, Key, Globe, Box, Save, Hash } from 'lucide-react';

interface AISettingsFormProps {
  config: AIConfig;
  onSave: (config: AIConfig) => void;
}

const AISettingsForm: React.FC<AISettingsFormProps> = ({ config, onSave }) => {
  const [tempConfig, setTempConfig] = useState<AIConfig>(config);
  const [showKey, setShowKey] = useState(false);

  return (
     <div className="space-y-6 animate-in slide-in-from-right-4 duration-200">
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-6">
            <h3 className="text-blue-300 font-bold flex items-center gap-2 mb-2">
                <Cpu size={18}/> 模型配置
            </h3>
            <p className="text-xs text-blue-200/70">
                您可以切换到任何兼容 OpenAI 格式的 API 供应商（如 DeepSeek, Moonshot, 或本地 Ollama）。
            </p>
        </div>

        <div className="space-y-4">
            {/* Provider Select */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">AI 供应商</label>
                <div className="grid grid-cols-2 gap-4">
                    <button
                        onClick={() => setTempConfig({...tempConfig, provider: AIProvider.GOOGLE})}
                        className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                            tempConfig.provider === AIProvider.GOOGLE
                            ? 'bg-blue-600/20 border-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                        }`}
                    >
                        <span className="font-bold">Google Gemini</span>
                        <span className="text-xs opacity-70">原生支持，工具调用稳定</span>
                    </button>
                    <button
                        onClick={() => setTempConfig({...tempConfig, provider: AIProvider.OPENAI})}
                        className={`p-4 rounded-xl border flex flex-col items-center gap-2 transition-all ${
                            tempConfig.provider === AIProvider.OPENAI
                            ? 'bg-green-600/20 border-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-750'
                        }`}
                    >
                        <span className="font-bold">OpenAI Compatible</span>
                        <span className="text-xs opacity-70">DeepSeek / GPT-4 / Local</span>
                    </button>
                </div>
            </div>

            {/* API Key */}
            <div>
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Key size={16}/> API Key
                </label>
                <div className="relative">
                    <input 
                        type={showKey ? "text" : "password"}
                        value={tempConfig.apiKey}
                        onChange={e => setTempConfig({...tempConfig, apiKey: e.target.value})}
                        placeholder={tempConfig.provider === AIProvider.GOOGLE ? "Enter Google API Key..." : "sk-..."}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 pr-10 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                    />
                    <button 
                        onClick={() => setShowKey(!showKey)}
                        className="absolute right-3 top-3 text-gray-500 hover:text-white"
                    >
                        {showKey ? "Hide" : "Show"}
                    </button>
                </div>
                <p className="text-xs text-gray-600 mt-1">Key 仅存储在本地浏览器中，不会上传到任何服务器。</p>
            </div>

            {/* Base URL (Only for OpenAI) */}
            {tempConfig.provider === AIProvider.OPENAI && (
                 <div className="animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <Globe size={16}/> Base URL
                    </label>
                    <input 
                        type="text"
                        value={tempConfig.baseUrl || ''}
                        onChange={e => setTempConfig({...tempConfig, baseUrl: e.target.value})}
                        placeholder="https://api.openai.com/v1"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                    />
                    <div className="flex gap-2 mt-2">
                        <button 
                            onClick={() => setTempConfig({...tempConfig, baseUrl: 'https://api.deepseek.com', modelName: 'deepseek-chat'})}
                            className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 text-gray-400"
                        >
                            DeepSeek
                        </button>
                        <button 
                            onClick={() => setTempConfig({...tempConfig, baseUrl: 'https://api.moonshot.cn/v1', modelName: 'moonshot-v1-8k'})}
                            className="text-[10px] bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700 text-gray-400"
                        >
                            Moonshot
                        </button>
                    </div>
                </div>
            )}

            {/* Model Name & Max Tokens Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <Box size={16}/> Model Name
                    </label>
                    <input 
                        type="text"
                        value={tempConfig.modelName}
                        onChange={e => setTempConfig({...tempConfig, modelName: e.target.value})}
                        placeholder="e.g. gemini-2.0-flash"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                        <Hash size={16}/> Max Output Tokens
                    </label>
                    <input 
                        type="number"
                        value={tempConfig.maxOutputTokens || ''}
                        onChange={e => setTempConfig({...tempConfig, maxOutputTokens: parseInt(e.target.value) || undefined})}
                        placeholder="Default (Model Limit)"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                    />
                </div>
            </div>
            <p className="text-xs text-gray-600 -mt-2">
                Tip: 较小的 Max Tokens 会截断回答，较大的值允许更长的创作内容。推荐值: 8192。
            </p>
        </div>

        <div className="pt-6 border-t border-gray-800 flex justify-end">
            <button 
                onClick={() => onSave(tempConfig)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-transform hover:scale-105"
            >
                <Save size={18} />
                保存配置
            </button>
        </div>
     </div>
  );
};

export default AISettingsForm;