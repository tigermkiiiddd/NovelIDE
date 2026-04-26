import React, { useEffect, useState } from 'react';
import { RotateCcw, Save, UserRound } from 'lucide-react';
import { useGlobalSoulStore } from '../stores/globalSoulStore';

const GlobalSoulSettings: React.FC = () => {
  const soul = useGlobalSoulStore(state => state.soul);
  const isLoaded = useGlobalSoulStore(state => state.isLoaded);
  const load = useGlobalSoulStore(state => state.load);
  const save = useGlobalSoulStore(state => state.save);
  const resetToDefault = useGlobalSoulStore(state => state.resetToDefault);
  const [draft, setDraft] = useState(soul);
  const [saveState, setSaveState] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setDraft(soul);
  }, [soul]);

  const handleSave = async () => {
    await save(draft);
    setSaveState('saved');
    window.setTimeout(() => setSaveState('idle'), 1600);
  };

  const handleReset = async () => {
    if (!confirm('确定要恢复默认全局 Soul 吗？当前全局人格设置会被覆盖。')) return;
    await resetToDefault();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-800 bg-gray-950/70 p-4">
        <div className="flex items-start gap-3">
          <UserRound size={18} className="text-blue-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-100">全局 Soul</h3>
            <p className="mt-1 text-xs leading-5 text-gray-400">
              跨项目共享的 NovelGenie 人格、协作偏好和通用风格倾向。当前项目的
              <span className="text-gray-300"> 98_技能配置/skills/核心/soul.md </span>
              只作为项目覆盖层。
            </p>
          </div>
        </div>
      </div>

      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={!isLoaded}
        spellCheck={false}
        className="min-h-[52vh] w-full resize-y rounded-lg border border-gray-700 bg-gray-950 p-4 font-mono text-sm leading-6 text-gray-200 outline-none transition-colors placeholder:text-gray-600 focus:border-blue-500 disabled:opacity-60"
        placeholder="正在加载全局 Soul..."
      />

      <div className="flex flex-col gap-3 border-t border-gray-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          保存后会影响后续所有项目的 Agent 行为；具体作品设定仍以项目资产和项目 Soul 覆盖为准。
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex min-h-[40px] items-center gap-2 rounded-lg border border-gray-700 px-3 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
          >
            <RotateCcw size={16} />
            恢复默认
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex min-h-[40px] items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-500"
          >
            <Save size={16} />
            {saveState === 'saved' ? '已保存' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalSoulSettings;
