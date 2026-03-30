import React, { useState, useEffect } from 'react';
import { getAllPresets, GenrePreset } from '../services/resources/presets';
import { CORE_GAMEPLAY_TAGS, NARRATIVE_ELEMENT_TAGS, STYLE_TONE_TAGS, ROMANCE_LINE_TAGS } from '../constants/projectTags';

export interface PleasureRhythm {
  small: number;
  medium: number;
  large: number;
}

interface ProjectMetaFormProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  genre: string;
  setGenre: (v: string) => void;
  wordsPerChapter: number;
  setWordsPerChapter: (v: number) => void;
  targetChapters: number;
  setTargetChapters: (v: number) => void;
  chaptersPerVolume: number;
  setChaptersPerVolume: (v: number) => void;
  pleasureRhythm: PleasureRhythm;
  setPleasureRhythm: (v: PleasureRhythm) => void;
  selectedPresetId: string;
  setSelectedPresetId: (v: string) => void;
  // 新增：扩展标签
  coreGameplay: string[];
  setCoreGameplay: (v: string[]) => void;
  narrativeElements: string[];
  setNarrativeElements: (v: string[]) => void;
  styleTone: string[];
  setStyleTone: (v: string[]) => void;
  romanceLine: string[];
  setRomanceLine: (v: string[]) => void;
  mode: 'create' | 'edit';
}

const ProjectMetaForm: React.FC<ProjectMetaFormProps> = ({
  name, setName,
  description, setDescription,
  genre, setGenre,
  wordsPerChapter, setWordsPerChapter,
  targetChapters, setTargetChapters,
  chaptersPerVolume, setChaptersPerVolume,
  pleasureRhythm, setPleasureRhythm,
  selectedPresetId, setSelectedPresetId,
  coreGameplay, setCoreGameplay,
  narrativeElements, setNarrativeElements,
  styleTone, setStyleTone,
  romanceLine, setRomanceLine,
  mode,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<GenrePreset | null>(null);

  // 自定义标签输入状态
  const [customGameplayInput, setCustomGameplayInput] = useState('');
  const [customNarrativeInput, setCustomNarrativeInput] = useState('');
  const [customStyleInput, setCustomStyleInput] = useState('');
  const [customRomanceInput, setCustomRomanceInput] = useState('');

  // Sync preset from ID (for edit mode initial load)
  useEffect(() => {
    if (selectedPresetId && !selectedPreset) {
      const preset = getAllPresets().find(p => p.id === selectedPresetId);
      if (preset) setSelectedPreset(preset);
    }
  }, [selectedPresetId]);

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = getAllPresets().find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(preset);
      if (mode === 'create') {
        setGenre(preset.genre);
        setWordsPerChapter(preset.defaultSettings.wordsPerChapter);
        setTargetChapters(preset.defaultSettings.targetChapters);
        setChaptersPerVolume(preset.defaultSettings.chaptersPerVolume);
        setPleasureRhythm({
          small: preset.pleasureRhythm.small,
          medium: preset.pleasureRhythm.medium,
          large: preset.pleasureRhythm.large,
        });
      }
    } else {
      setSelectedPreset(null);
    }
  };

  const isCreate = mode === 'create';

  // 标签切换处理
  const toggleTag = (tag: string, currentTags: string[], setter: (v: string[]) => void) => {
    if (currentTags.includes(tag)) {
      setter(currentTags.filter(t => t !== tag));
    } else {
      setter([...currentTags, tag]);
    }
  };

  // 添加自定义标签
  const addCustomTag = (input: string, currentTags: string[], setter: (v: string[]) => void, clearInput: () => void) => {
    const trimmed = input.trim();
    if (trimmed && !currentTags.includes(trimmed)) {
      setter([...currentTags, trimmed]);
      clearInput();
    }
  };

  // 移除标签
  const removeTag = (tag: string, currentTags: string[], setter: (v: string[]) => void) => {
    setter(currentTags.filter(t => t !== tag));
  };

  // 统一样式
  const inputClass = isCreate
    ? 'w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none placeholder-gray-600 transition-colors resize-none overflow-hidden'
    : 'w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 resize-none overflow-hidden';

  const numInputClass = isCreate
    ? 'w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white text-sm focus:border-blue-500 focus:outline-none transition-colors resize-none overflow-hidden'
    : 'w-full bg-gray-900 border border-gray-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none overflow-hidden';

  const labelClass = isCreate
    ? 'block text-sm text-gray-400 mb-1'
    : 'block text-sm text-gray-500 mb-1';

  const selectClass = isCreate
    ? 'w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none transition-colors'
    : 'w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500';

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {/* 书名 */}
      <div className="md:col-span-2">
        <label className={labelClass}>
          书名 {isCreate && <span className="text-red-500">*</span>}
        </label>
        <textarea
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputClass}
          placeholder="例如：赛博修仙传"
          rows={1}
          required={isCreate}
          autoComplete="off"
        />
      </div>

      {/* 题材预设 */}
      <div className="md:col-span-2">
        <label className={labelClass}>题材预设</label>
        <select
          value={selectedPresetId}
          onChange={e => handlePresetChange(e.target.value)}
          className={selectClass}
        >
          <option value="">不使用预设{isCreate ? '（通用配置）' : ''}</option>
          {getAllPresets().map(preset => (
            <option key={preset.id} value={preset.id}>
              {preset.name} - {preset.description}
            </option>
          ))}
        </select>
        {selectedPreset && (
          <p className="text-xs text-gray-500 mt-1">
            {selectedPreset.pleasureRhythm.description}
          </p>
        )}
      </div>

      {/* 每卷章节数 */}
      <div>
        <label className={labelClass}>每卷章节数</label>
        <textarea
          value={chaptersPerVolume}
          onChange={e => setChaptersPerVolume(parseInt(e.target.value) || 0)}
          className={inputClass}
          placeholder="例如：10"
          inputMode="numeric"
          rows={1}
          autoComplete="off"
        />
      </div>

      {/* 单章字数 & 目标章节 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>单章字数</label>
          <textarea
            value={wordsPerChapter}
            onChange={e => setWordsPerChapter(parseInt(e.target.value) || 0)}
            className={inputClass}
            inputMode="numeric"
            rows={1}
            autoComplete="off"
          />
        </div>
        <div>
          <label className={labelClass}>目标章节</label>
          <textarea
            value={targetChapters}
            onChange={e => setTargetChapters(parseInt(e.target.value) || 0)}
            className={inputClass}
            inputMode="numeric"
            rows={1}
            autoComplete="off"
          />
        </div>
      </div>

      {/* 爽点节奏配置 */}
      <div className="md:col-span-2">
        <label className={labelClass}>爽点节奏配置</label>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">小爽间隔（章）</label>
            <textarea
              value={pleasureRhythm.small}
              onChange={e => setPleasureRhythm({ ...pleasureRhythm, small: parseInt(e.target.value) || 1 })}
              className={numInputClass}
              inputMode="numeric"
              rows={1}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">中爽间隔（章）</label>
            <textarea
              value={pleasureRhythm.medium}
              onChange={e => setPleasureRhythm({ ...pleasureRhythm, medium: parseInt(e.target.value) || 1 })}
              className={numInputClass}
              inputMode="numeric"
              rows={1}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">大爽间隔（章）</label>
            <textarea
              value={pleasureRhythm.large}
              onChange={e => setPleasureRhythm({ ...pleasureRhythm, large: parseInt(e.target.value) || 1 })}
              className={numInputClass}
              inputMode="numeric"
              rows={1}
              autoComplete="off"
            />
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          小爽：小收获、小胜利 | 中爽：阶段胜利、重要突破 | 大爽：重大转折、终极高潮
        </p>
      </div>

      {/* 简介 / 核心梗 */}
      <div className="md:col-span-2">
        <label className={labelClass}>简介 / 核心梗 {isCreate && '(可选)'}</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          className={`${isCreate
            ? 'w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-blue-500 focus:outline-none placeholder-gray-600 transition-colors'
            : 'w-full bg-gray-900 border border-gray-600 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500'
          } resize-none h-24`}
          placeholder={isCreate ? '写下一句话核心梗，点击 AI 润色，自动为您扩写...' : '请输入简介...'}
          rows={4}
          autoComplete="off"
        />
      </div>

      {/* 核心玩法标签 */}
      <div className="md:col-span-2">
        <label className={labelClass}>核心玩法 (可多选)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {CORE_GAMEPLAY_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag, coreGameplay, setCoreGameplay)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                coreGameplay.includes(tag)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        {/* 自定义标签输入 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customGameplayInput}
            onChange={e => setCustomGameplayInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag(customGameplayInput, coreGameplay, setCoreGameplay, () => setCustomGameplayInput(''));
              }
            }}
            placeholder="输入自定义标签后按回车"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => addCustomTag(customGameplayInput, coreGameplay, setCoreGameplay, () => setCustomGameplayInput(''))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors"
          >
            添加
          </button>
        </div>
        {/* 已选标签显示 */}
        {coreGameplay.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">已选:</span>
            {coreGameplay.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-900/30 border border-blue-700 rounded text-xs text-blue-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, coreGameplay, setCoreGameplay)}
                  className="hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 叙事元素标签 */}
      <div className="md:col-span-2">
        <label className={labelClass}>叙事元素 (可多选)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {NARRATIVE_ELEMENT_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag, narrativeElements, setNarrativeElements)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                narrativeElements.includes(tag)
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customNarrativeInput}
            onChange={e => setCustomNarrativeInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag(customNarrativeInput, narrativeElements, setNarrativeElements, () => setCustomNarrativeInput(''));
              }
            }}
            placeholder="输入自定义标签后按回车"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => addCustomTag(customNarrativeInput, narrativeElements, setNarrativeElements, () => setCustomNarrativeInput(''))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors"
          >
            添加
          </button>
        </div>
        {narrativeElements.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">已选:</span>
            {narrativeElements.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-700 rounded text-xs text-purple-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, narrativeElements, setNarrativeElements)}
                  className="hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 风格基调标签 */}
      <div className="md:col-span-2">
        <label className={labelClass}>风格基调 (可多选)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {STYLE_TONE_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag, styleTone, setStyleTone)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                styleTone.includes(tag)
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customStyleInput}
            onChange={e => setCustomStyleInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag(customStyleInput, styleTone, setStyleTone, () => setCustomStyleInput(''));
              }
            }}
            placeholder="输入自定义标签后按回车"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => addCustomTag(customStyleInput, styleTone, setStyleTone, () => setCustomStyleInput(''))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors"
          >
            添加
          </button>
        </div>
        {styleTone.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">已选:</span>
            {styleTone.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-green-900/30 border border-green-700 rounded text-xs text-green-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, styleTone, setStyleTone)}
                  className="hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 感情线标签 */}
      <div className="md:col-span-2">
        <label className={labelClass}>感情线 (可多选)</label>
        <div className="flex flex-wrap gap-2 mb-2">
          {ROMANCE_LINE_TAGS.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag, romanceLine, setRomanceLine)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                romanceLine.includes(tag)
                  ? 'bg-pink-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={customRomanceInput}
            onChange={e => setCustomRomanceInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomTag(customRomanceInput, romanceLine, setRomanceLine, () => setCustomRomanceInput(''));
              }
            }}
            placeholder="输入自定义标签后按回车"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => addCustomTag(customRomanceInput, romanceLine, setRomanceLine, () => setCustomRomanceInput(''))}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm text-white transition-colors"
          >
            添加
          </button>
        </div>
        {romanceLine.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="text-xs text-gray-500">已选:</span>
            {romanceLine.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2 py-1 bg-pink-900/30 border border-pink-700 rounded text-xs text-pink-300"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag, romanceLine, setRomanceLine)}
                  className="hover:text-red-400 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectMetaForm;
