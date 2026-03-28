import React, { useState, useEffect } from 'react';
import { getAllPresets, GenrePreset } from '../services/resources/presets';

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
  mode,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<GenrePreset | null>(null);

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

      {/* 题材类型 */}
      <div>
        <label className={labelClass}>题材类型</label>
        <textarea
          value={genre}
          onChange={e => setGenre(e.target.value)}
          className={inputClass}
          placeholder="例如：玄幻、悬疑、科幻"
          rows={1}
          autoComplete="off"
        />
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
    </div>
  );
};

export default ProjectMetaForm;
