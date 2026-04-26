
import React, { useState } from 'react';
import { AIConfig, AIProvider, OpenAIBackend, ModelRouteId, ModelRoute, ModelRoutes } from '../types';
import { Cpu, Key, Globe, Box, Save, Hash, Shield, Plus, Trash2, Edit2, Check, AlertTriangle, Brain, Languages } from 'lucide-react';
import { generateId } from '../services/fileSystem';
import { useUiStore } from '../stores/uiStore';
import { useTranslation } from 'react-i18next';

interface AISettingsFormProps {
  config: AIConfig;
  onSave: (config: AIConfig) => void;
}

const AISettingsForm: React.FC<AISettingsFormProps> = ({ config, onSave }) => {
  const language = useUiStore(state => state.language);
  const setLanguage = useUiStore(state => state.setLanguage);
  const { t } = useTranslation();
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
          finalConfig.maxOutputTokens = activeBackend.maxOutputTokens;
          finalConfig.thinkingEnabled = activeBackend.thinkingEnabled;
          finalConfig.thinkingBudgetTokens = activeBackend.thinkingBudgetTokens;
      }

      // Migration: lightweightModelName → extraction route
      if (!finalConfig.modelRoutes?.extraction && finalConfig.lightweightModelName) {
          finalConfig.modelRoutes = {
              ...finalConfig.modelRoutes,
              extraction: { modelName: finalConfig.lightweightModelName }
          };
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
          alert(t('aiSettings.mustKeepOneConfig'));
          return;
      }
      if (!confirm(t('aiSettings.confirmDeleteProvider'))) return;

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

  const updateModelRoute = (routeId: ModelRouteId, updates: Partial<ModelRoute>) => {
      setTempConfig(prev => {
          const current = prev.modelRoutes?.[routeId] || {};
          const merged = { ...current, ...updates };

          // Clean up undefined values
          const cleaned: Record<string, string> = {};
          if (merged.backendId) cleaned.backendId = merged.backendId;
          if (merged.modelName) cleaned.modelName = merged.modelName;

          const newRoutes = { ...prev.modelRoutes };
          if (Object.keys(cleaned).length > 0) {
              (newRoutes as any)[routeId] = cleaned;
          } else {
              delete (newRoutes as any)[routeId];
          }

          return { ...prev, modelRoutes: newRoutes };
      });
  };

  // Check if current model is Gemini (for safety settings hint)
  const isGeminiModel = activeBackend?.modelName?.toLowerCase().includes('gemini') ||
                        activeBackend?.baseUrl?.includes('generativelanguage.googleapis.com');

  return (
     <div className="space-y-4 sm:space-y-6 animate-in slide-in-from-right-4 duration-200">
        <div className="bg-blue-900/20 border border-blue-800/50 rounded-lg p-4 mb-6">
            <h3 className="text-blue-300 font-bold flex items-center gap-2 mb-2">
                <Cpu size={18}/> {t('aiSettings.modelConfig')}
            </h3>
            <p className="text-xs text-blue-200/70">
                {t('aiSettings.modelConfigDesc')}
            </p>
        </div>

        <div className="space-y-6">
            {/* Provider Config Section */}
            {activeBackend && (
                 <div className="space-y-4 animate-in fade-in bg-gray-800/30 p-4 rounded-xl border border-gray-700">

                    {/* Provider Selector / Manager */}
                    <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-2">
                        <div className="flex-1">
                            <label className="block text-xs font-medium text-blue-400 mb-1 uppercase tracking-wide">{t('aiSettings.selectProvider')}</label>
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
                            className="p-2.5 bg-gray-800 border border-gray-600 hover:bg-gray-700 active:bg-gray-600 text-blue-400 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title={t('aiSettings.addProvider')}
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
                                    <button onClick={() => setIsEditingName(true)} className="text-gray-500 hover:text-white active:text-white p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"><Edit2 size={12}/></button>
                                </h4>
                            )}

                            <button
                                onClick={handleDeleteBackend}
                                className="text-gray-500 hover:text-red-400 text-xs flex items-center gap-1 px-3 py-2 rounded hover:bg-red-900/20 active:bg-red-900/30 min-h-[44px]"
                            >
                                <Trash2 size={14} /> {t('aiSettings.deleteConfig')}
                            </button>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Globe size={16}/> {t('aiSettings.baseUrl')}
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
                                <Key size={16}/> {t('aiSettings.apiKey')}
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
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white active:text-white px-2 py-1 min-h-[44px] flex items-center justify-center"
                                >
                                    {showKey ? t('aiSettings.hide') : t('aiSettings.show')}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Box size={16}/> {t('aiSettings.modelName')}
                            </label>
                            <input
                                type="text"
                                value={activeBackend.modelName}
                                onChange={e => updateActiveBackend({ modelName: e.target.value })}
                                placeholder="gpt-4o"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                            />
                        </div>

                        {/* Max Output Tokens */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Hash size={16}/> {t('aiSettings.maxOutputTokens')}
                            </label>
                            <input
                                type="number"
                                value={activeBackend.maxOutputTokens || ''}
                                onChange={e => updateActiveBackend({ maxOutputTokens: parseInt(e.target.value) || undefined })}
                                placeholder="8192"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                {t('aiSettings.maxOutputTokensHint')}
                            </p>
                        </div>

                        {/* Context Window */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                                <Hash size={16}/> Context Window Messages
                            </label>
                            <input
                                type="number"
                                min={8}
                                max={120}
                                value={tempConfig.contextWindowMessages ?? 30}
                                onChange={e => setTempConfig(prev => ({
                                    ...prev,
                                    contextWindowMessages: Math.min(120, Math.max(8, parseInt(e.target.value, 10) || 30))
                                }))}
                                placeholder="30"
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none font-mono text-sm"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                固定滑动窗口保留的最近消息数。小说连续性依赖项目资产召回，不建议调得过大。
                            </p>
                        </div>

                        {/* Thinking Mode Toggle */}
                        <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-sm font-medium text-gray-300 flex items-center gap-2">
                                    <Brain size={16} className="text-amber-400" />
                                    {t('aiSettings.thinkingMode')}
                                </label>
                                <button
                                    onClick={() => updateActiveBackend({ thinkingEnabled: !activeBackend.thinkingEnabled })}
                                    className={`
                                        w-10 h-5 rounded-full relative transition-colors duration-200
                                        ${activeBackend.thinkingEnabled ? 'bg-amber-600' : 'bg-gray-600'}
                                    `}
                                >
                                    <div className={`
                                        absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow
                                        ${activeBackend.thinkingEnabled ? 'translate-x-5' : 'translate-x-0.5'}
                                    `} />
                                </button>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                                {t('aiSettings.thinkingModeDesc')}
                            </p>
                            {activeBackend.thinkingEnabled && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <label className="block text-xs font-medium text-amber-400/80 mb-1.5">
                                        {t('aiSettings.thinkingBudgetLabel')}
                                    </label>
                                    <input
                                        type="number"
                                        value={activeBackend.thinkingBudgetTokens || ''}
                                        onChange={e => updateActiveBackend({ thinkingBudgetTokens: parseInt(e.target.value) || undefined })}
                                        placeholder={t('aiSettings.thinkingBudgetPlaceholder')}
                                        className="w-full bg-gray-950 border border-gray-700 rounded-lg p-2.5 text-white focus:border-amber-500 focus:outline-none font-mono text-sm"
                                    />
                                    <p className="text-xs text-gray-600 mt-1.5">
                                        {t('aiSettings.thinkingBudgetHint')}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Safety Settings (Gemini only) */}
            <div className="animate-in fade-in">
                <label className="block text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                    <Shield size={16}/>
                    {t('aiSettings.safetySettingLabel')}
                    {!isGeminiModel && (
                        <span className="text-[10px] text-yellow-500 bg-yellow-900/30 px-2 py-0.5 rounded border border-yellow-800 ml-auto flex items-center gap-1">
                            <AlertTriangle size={10} /> {t('aiSettings.geminiOnly')}
                        </span>
                    )}
                </label>
                <div className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
                    <select
                        value={tempConfig.safetySetting || 'BLOCK_NONE'}
                        onChange={e => setTempConfig({...tempConfig, safetySetting: e.target.value})}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none text-sm appearance-none"
                    >
                        <option value="BLOCK_NONE">{t('aiSettings.safetyCreative')}</option>
                        <option value="BLOCK_ONLY_HIGH">{t('aiSettings.safetyStandard')}</option>
                        <option value="BLOCK_MEDIUM_AND_ABOVE">{t('aiSettings.safetyStrict')}</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-2">
                        {isGeminiModel
                            ? t('aiSettings.safetyHintGemini')
                            : t('aiSettings.safetyHintOther')}
                    </p>
                </div>
            </div>

            {/* Language Setting */}
            <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                    <Languages size={16} className="text-cyan-400" />
                    {t('aiSettings.language')}
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                    {t('aiSettings.languageDesc')}
                </p>
                <div className="relative">
                    <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value as 'zh' | 'en')}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none appearance-none"
                    >
                        <option value="zh">{t('aiSettings.langZh')}</option>
                        <option value="en">{t('aiSettings.langEn')}</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">▼</div>
                </div>
            </div>

            {/* Auto Extraction Toggles */}
            <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
                    <Brain size={16} className="text-purple-400" />
                    {t('aiSettings.autoExtraction')}
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                    {t('aiSettings.autoExtractionDesc')}
                </p>
                <div className="space-y-3">
                    {([
                        { key: 'conversation' as const, label: t('aiSettings.conversationExtract'), desc: t('aiSettings.conversationExtractDesc') },
                        { key: 'document' as const, label: t('aiSettings.documentExtract'), desc: t('aiSettings.documentExtractDesc') },
                        { key: 'chapterAnalysis' as const, label: t('aiSettings.chapterAnalysis'), desc: t('aiSettings.chapterAnalysisDesc') },
                    ]).map(item => {
                        const enabled = tempConfig.autoExtraction?.[item.key] !== false;
                        return (
                            <label key={item.key} className="flex items-start gap-3 cursor-pointer group">
                                <div className={`
                                    mt-0.5 w-12 h-6 sm:w-10 sm:h-5 rounded-full relative transition-colors duration-200 flex-shrink-0
                                    ${enabled ? 'bg-blue-600' : 'bg-gray-600'}
                                `}
                                    onClick={() => setTempConfig(prev => ({
                                        ...prev,
                                        autoExtraction: {
                                            conversation: prev.autoExtraction?.conversation !== false,
                                            document: prev.autoExtraction?.document !== false,
                                            chapterAnalysis: prev.autoExtraction?.chapterAnalysis !== false,
                                            [item.key]: !enabled,
                                        }
                                    }))}
                                >
                                    <div className={`
                                        absolute top-0.5 w-[18px] h-[18px] sm:w-4 sm:h-4 bg-white rounded-full transition-transform duration-200 shadow
                                        ${enabled ? 'translate-x-6 sm:translate-x-5' : 'translate-x-0.5'}
                                    `} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-300 group-hover:text-white transition-colors">{item.label}</div>
                                    <div className="text-xs text-gray-500">{item.desc}</div>
                                </div>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* Model Routes */}
            <div className="bg-gray-800/30 p-4 rounded-xl border border-gray-700">
                <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-1">
                    <Cpu size={16} className="text-amber-400" />
                    {t('aiSettings.modelRoutes')}
                </h4>
                <p className="text-xs text-gray-500 mb-4">
                    {t('aiSettings.modelRoutesDesc')}
                </p>
                <div className="space-y-3">
                    {([
                        { id: 'main' as ModelRouteId, label: t('aiSettings.routeMain'), desc: t('aiSettings.routeMainDesc') },
                        { id: 'polish' as ModelRouteId, label: t('aiSettings.routePolish'), desc: t('aiSettings.routePolishDesc') },
                        { id: 'outline' as ModelRouteId, label: t('aiSettings.routeOutline'), desc: t('aiSettings.routeOutlineDesc') },
                        { id: 'extraction' as ModelRouteId, label: t('aiSettings.routeExtraction'), desc: t('aiSettings.routeExtractionDesc') },
                        { id: 'subAgent' as ModelRouteId, label: t('aiSettings.routeSubAgent'), desc: t('aiSettings.routeSubAgentDesc') },
                    ]).map(route => {
                        const current = tempConfig.modelRoutes?.[route.id];
                        return (
                            <div key={route.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 bg-gray-900/50 rounded-lg">
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-300">{route.label}</div>
                                    <div className="text-[10px] text-gray-600">{route.desc}</div>
                                </div>
                                <div className="flex gap-2 flex-1">
                                    <select
                                        value={current?.backendId || ''}
                                        onChange={e => updateModelRoute(route.id, { backendId: e.target.value || undefined })}
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none appearance-none"
                                    >
                                        <option value="">{t('aiSettings.activeProvider')}</option>
                                        {tempConfig.openAIBackends?.map(b => (
                                            <option key={b.id} value={b.id}>{b.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        value={current?.modelName || ''}
                                        onChange={e => updateModelRoute(route.id, { modelName: e.target.value || undefined })}
                                        placeholder={t('aiSettings.defaultModel')}
                                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white focus:border-blue-500 focus:outline-none font-mono"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>

        <div className="pt-4 sm:pt-6 border-t border-gray-800 flex justify-center sm:justify-end">
            <button
                onClick={handleSave}
                className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 shadow-lg shadow-blue-900/30 min-h-[44px] w-full sm:w-auto justify-center"
            >
                <Save size={18} />
                {t('aiSettings.saveAndApply')}
            </button>
        </div>
     </div>
  );
};

export default AISettingsForm;
