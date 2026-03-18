/**
 * OutlineViewer.tsx
 * 大纲查看器组件 - 嵌入式版本（在 Editor 区域显示）
 *
 * 功能：
 * - 三级渐进式显示：卷纲列表 → 章纲列表 → 章节细纲
 * - 加载和显示大纲数据
 */

import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, BookOpen, FileText, Users, ArrowLeft, Plus } from 'lucide-react';
import { useStoryOutlineStore } from '../stores/storyOutlineStore';
import { useProjectStore } from '../stores/projectStore';
import { VolumeOutline, ChapterOutline } from '../types';

interface OutlineViewerProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewLevel = 'volumes' | 'chapters' | 'detail';

const OutlineViewer: React.FC<OutlineViewerProps> = ({ isOpen, onClose }) => {
  const [level, setLevel] = useState<ViewLevel>('volumes');
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [expandedVolumes, setExpandedVolumes] = useState<Set<string>>(new Set());

  // 创建表单状态
  const [showAddVolume, setShowAddVolume] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState<string | null>(null);
  const [showAddScene, setShowAddScene] = useState<string | null>(null);
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [newVolume, setNewVolume] = useState({ volumeNumber: 1, title: '', description: '' });
  const [newChapter, setNewChapter] = useState({ chapterNumber: 1, title: '', summary: '' });
  const [newScene, setNewScene] = useState({ nodeNumber: 1, title: '', content: '', location: '', characters: '', emotion: '', purpose: '' });

  const outline = useStoryOutlineStore(state => state.outline);
  const isLoading = useStoryOutlineStore(state => state.isLoading);
  const loadOutline = useStoryOutlineStore(state => state.loadOutline);
  const addVolume = useStoryOutlineStore(state => state.addVolume);
  const updateVolume = useStoryOutlineStore(state => state.updateVolume);
  const deleteVolume = useStoryOutlineStore(state => state.deleteVolume);
  const addChapter = useStoryOutlineStore(state => state.addChapter);
  const updateChapter = useStoryOutlineStore(state => state.updateChapter);
  const deleteChapter = useStoryOutlineStore(state => state.deleteChapter);
  const addScene = useStoryOutlineStore(state => state.addScene);
  const updateScene = useStoryOutlineStore(state => state.updateScene);
  const deleteScene = useStoryOutlineStore(state => state.deleteScene);
  const currentProjectId = useProjectStore(state => state.currentProjectId);

  // 编辑状态
  const [editingVolume, setEditingVolume] = useState<string | null>(null);
  const [editingChapter, setEditingChapter] = useState<string | null>(null);
  const [editVolumeForm, setEditVolumeForm] = useState({ volumeNumber: 1, title: '', description: '' });
  const [editChapterForm, setEditChapterForm] = useState({ chapterNumber: 1, title: '', summary: '', pov: '', driver: '', conflict: '', hook: '' });

  // 加载大纲数据 - 只在 store 中没有数据时才加载
  useEffect(() => {
    if (isOpen && currentProjectId && !outline) {
      loadOutline(currentProjectId);
    }
  }, [isOpen, currentProjectId, outline, loadOutline]);

  // 重置状态
  useEffect(() => {
    if (!isOpen) {
      setLevel('volumes');
      setSelectedVolumeId(null);
      setSelectedChapterId(null);
      setExpandedVolumes(new Set());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 获取当前卷和章节
  const selectedVolume = outline?.volumes.find(v => v.id === selectedVolumeId);
  const selectedChapter = selectedVolume?.chapters.find(c => c.id === selectedChapterId);

  // 切换卷的展开状态
  const toggleVolumeExpand = (volumeId: string) => {
    const newExpanded = new Set(expandedVolumes);
    if (newExpanded.has(volumeId)) {
      newExpanded.delete(volumeId);
    } else {
      newExpanded.add(volumeId);
    }
    setExpandedVolumes(newExpanded);
  };

  // 状态颜色
  const statusColors = {
    draft: 'bg-gray-600 text-gray-200',
    outline: 'bg-blue-600 text-blue-200',
    writing: 'bg-yellow-600 text-yellow-200',
    completed: 'bg-green-600 text-green-200'
  };

  // 创建卷
  const handleAddVolume = async () => {
    if (!newVolume.title.trim()) return;

    // 确保大纲已加载
    if (!outline && currentProjectId) {
      await loadOutline(currentProjectId);
    }

    if (!outline) return;

    addVolume({
      volumeNumber: newVolume.volumeNumber,
      title: newVolume.title.trim(),
      description: newVolume.description.trim()
    });
    setNewVolume({ volumeNumber: newVolume.volumeNumber + 1, title: '', description: '' });
    setShowAddVolume(false);
  };

  // 创建章节
  const handleAddChapter = (volumeId: string) => {
    if (!newChapter.title.trim()) return;
    addChapter(volumeId, {
      chapterNumber: newChapter.chapterNumber,
      title: newChapter.title.trim(),
      summary: newChapter.summary.trim(),
      pov: '',
      driver: '',
      conflict: '',
      hook: '',
      status: 'outline',
      scenes: []
    });
    setNewChapter({ chapterNumber: newChapter.chapterNumber + 1, title: '', summary: '' });
    setShowAddChapter(null);
  };

  // 创建场景
  const handleAddScene = (chapterId: string) => {
    if (!newScene.title.trim()) return;
    addScene(chapterId, {
      nodeNumber: newScene.nodeNumber,
      title: newScene.title.trim(),
      content: newScene.content.trim(),
      location: newScene.location.trim(),
      characters: newScene.characters.split(',').map(c => c.trim()).filter(Boolean),
      emotion: newScene.emotion.trim(),
      purpose: newScene.purpose.trim()
    });
    setNewScene({ nodeNumber: newScene.nodeNumber + 1, title: '', content: '', location: '', characters: '', emotion: '', purpose: '' });
    setShowAddScene(null);
  };

  // 删除场景
  const handleDeleteScene = (chapterId: string, sceneId: string) => {
    deleteScene(chapterId, sceneId);
  };

  // 开始编辑卷
  const handleStartEditVolume = (volume: any) => {
    setEditVolumeForm({ volumeNumber: volume.volumeNumber, title: volume.title, description: volume.description });
    setEditingVolume(volume.id);
  };

  // 保存编辑卷
  const handleSaveEditVolume = (volumeId: string) => {
    updateVolume(volumeId, editVolumeForm);
    setEditingVolume(null);
  };

  // 删除卷
  const handleDeleteVolume = (volumeId: string) => {
    if (confirm('确定要删除这个卷吗？')) {
      deleteVolume(volumeId);
    }
  };

  // 开始编辑章节
  const handleStartEditChapter = (chapter: any) => {
    setEditChapterForm({
      chapterNumber: chapter.chapterNumber,
      title: chapter.title,
      summary: chapter.summary,
      pov: chapter.pov,
      driver: chapter.driver,
      conflict: chapter.conflict,
      hook: chapter.hook
    });
    setEditingChapter(chapter.id);
  };

  // 保存编辑章节
  const handleSaveEditChapter = (chapterId: string) => {
    updateChapter(chapterId, editChapterForm);
    setEditingChapter(null);
  };

  // 删除章节
  const handleDeleteChapter = (volumeId: string, chapterId: string) => {
    if (confirm('确定要删除这个章节吗？')) {
      deleteChapter(chapterId);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0d1117] text-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          {level !== 'volumes' && (
            <button
              onClick={() => {
                if (level === 'detail') {
                  setLevel('chapters');
                  setSelectedChapterId(null);
                } else {
                  setLevel('volumes');
                  setSelectedVolumeId(null);
                }
              }}
              className="p-1 hover:bg-gray-700 rounded"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <BookOpen size={20} className="text-blue-400" />
          <span className="font-semibold text-lg">大纲</span>
          {level === 'chapters' && selectedVolume && (
            <ChevronRight size={16} className="text-gray-500" />
          )}
          {level === 'chapters' && selectedVolume && (
            <span className="text-gray-400">{selectedVolume.title}</span>
          )}
          {level === 'detail' && selectedChapter && (
            <>
              <ChevronRight size={16} className="text-gray-500" />
              <span className="text-gray-400">第{selectedChapter.chapterNumber}章</span>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded">
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-gray-500">加载中...</span>
          </div>
        ) : !outline || !outline.volumes || outline.volumes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-500">
            <FileText size={32} className="mb-2 opacity-50" />
            <p>暂无大纲</p>
            <p className="text-sm mb-4">使用 Agent 添加章节大纲</p>
            {showAddVolume ? (
              <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700 w-80">
                <h4 className="font-medium text-gray-300">新建卷</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">卷号</label>
                    <input
                      type="number"
                      value={newVolume.volumeNumber}
                      onChange={(e) => setNewVolume({ ...newVolume, volumeNumber: parseInt(e.target.value) || 1 })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">卷名</label>
                    <input
                      type="text"
                      value={newVolume.title}
                      onChange={(e) => setNewVolume({ ...newVolume, title: e.target.value })}
                      placeholder="卷名"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">简介</label>
                  <textarea
                    value={newVolume.description}
                    onChange={(e) => setNewVolume({ ...newVolume, description: e.target.value })}
                    placeholder="卷简介"
                    rows={2}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddVolume}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => setShowAddVolume(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddVolume(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
              >
                <Plus size={16} />
                <span>添加卷</span>
              </button>
            )}
          </div>
        ) : level === 'volumes' ? (
          /* Level 1: 卷纲列表 */
          <div className="space-y-2">
            {/* 添加卷按钮 */}
            <button
              onClick={() => {
                if (!outline && currentProjectId) {
                  loadOutline(currentProjectId);
                }
                setShowAddVolume(true);
              }}
              className="w-full flex items-center justify-center gap-2 py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors"
            >
              <Plus size={16} />
              <span>添加卷</span>
            </button>

            {/* 添加卷表单 */}
            {showAddVolume && (
              <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700">
                <h4 className="font-medium text-gray-300">新建卷</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-gray-500">卷号</label>
                    <input
                      type="number"
                      value={newVolume.volumeNumber}
                      onChange={(e) => setNewVolume({ ...newVolume, volumeNumber: parseInt(e.target.value) || 1 })}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">卷名</label>
                    <input
                      type="text"
                      value={newVolume.title}
                      onChange={(e) => setNewVolume({ ...newVolume, title: e.target.value })}
                      placeholder="卷名"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500">简介</label>
                  <textarea
                    value={newVolume.description}
                    onChange={(e) => setNewVolume({ ...newVolume, description: e.target.value })}
                    placeholder="卷简介"
                    rows={2}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddVolume}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => setShowAddVolume(false)}
                    className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}

            {(outline.volumes || []).map((volume) => (
              <div key={volume.id} className="border border-gray-700 rounded-lg overflow-hidden">
                {/* 卷标题 */}
                <div
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-750 cursor-pointer"
                  onClick={() => toggleVolumeExpand(volume.id)}
                >
                  {expandedVolumes.has(volume.id) ? (
                    <ChevronDown size={16} className="text-gray-400" />
                  ) : (
                    <ChevronRight size={16} className="text-gray-400" />
                  )}
                  <span className="font-medium">第{volume.volumeNumber}卷</span>
                  <span className="text-gray-300">{volume.title}</span>
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleStartEditVolume(volume); }}
                      className="p-1 text-gray-500 hover:text-blue-400"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteVolume(volume.id); }}
                      className="p-1 text-gray-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {/* 编辑卷表单 */}
                {editingVolume === volume.id && (
                  <div className="p-3 bg-gray-800/80 border-t border-gray-700 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-xs text-gray-500">卷号</label>
                        <input
                          type="number"
                          value={editVolumeForm.volumeNumber}
                          onChange={(e) => setEditVolumeForm({ ...editVolumeForm, volumeNumber: parseInt(e.target.value) || 1 })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500">卷名</label>
                        <input
                          type="text"
                          value={editVolumeForm.title}
                          onChange={(e) => setEditVolumeForm({ ...editVolumeForm, title: e.target.value })}
                          className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">简介</label>
                      <textarea
                        value={editVolumeForm.description}
                        onChange={(e) => setEditVolumeForm({ ...editVolumeForm, description: e.target.value })}
                        rows={2}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveEditVolume(volume.id)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                      >
                        保存
                      </button>
                      <button
                        onClick={() => setEditingVolume(null)}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}

                {/* 卷简介（展开时显示） */}
                {expandedVolumes.has(volume.id) && volume.description && (
                  <div className="px-3 py-2 bg-gray-800/50 text-sm text-gray-400 border-t border-gray-700">
                    {volume.description}
                  </div>
                )}

                {/* 章列表（展开时显示） */}
                {expandedVolumes.has(volume.id) && (
                  <div className="border-t border-gray-700">
                    {/* 添加章节按钮 */}
                    {showAddChapter === volume.id ? (
                      <div className="p-3 space-y-2 bg-gray-800/50">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">章号</label>
                            <input
                              type="number"
                              value={newChapter.chapterNumber}
                              onChange={(e) => setNewChapter({ ...newChapter, chapterNumber: parseInt(e.target.value) || 1 })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="text-xs text-gray-500">章名</label>
                            <input
                              type="text"
                              value={newChapter.title}
                              onChange={(e) => setNewChapter({ ...newChapter, title: e.target.value })}
                              placeholder="章名"
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">概要</label>
                          <textarea
                            value={newChapter.summary}
                            onChange={(e) => setNewChapter({ ...newChapter, summary: e.target.value })}
                            placeholder="章节概要"
                            rows={2}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleAddChapter(volume.id)}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                          >
                            确认
                          </button>
                          <button
                            onClick={() => setShowAddChapter(null)}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowAddChapter(volume.id)}
                        className="w-full flex items-center justify-center gap-1 py-2 text-gray-500 hover:text-gray-300 text-sm border-b border-gray-700/50"
                      >
                        <Plus size={14} />
                        <span>添加章节</span>
                      </button>
                    )}

                    {volume.chapters.length > 0 && volume.chapters.map((chapter) => (
                      <div
                        key={chapter.id}
                        className="flex items-center gap-2 px-4 py-2 hover:bg-gray-700/50 border-b border-gray-700/50 last:border-0"
                      >
                        <div
                          className="flex items-center gap-2 flex-1 cursor-pointer"
                          onClick={() => {
                            setSelectedVolumeId(volume.id);
                            setSelectedChapterId(chapter.id);
                            setLevel('detail');
                          }}
                        >
                          <FileText size={14} className="text-gray-500" />
                          <span className="text-gray-400 text-sm">第{chapter.chapterNumber}章</span>
                          <span className="text-gray-300 flex-1 truncate">{chapter.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[chapter.status]}`}>
                            {chapter.status}
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleStartEditChapter(chapter); }}
                          className="p-1 text-gray-500 hover:text-blue-400"
                        >
                          <FileText size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteChapter(volume.id, chapter.id); }}
                          className="p-1 text-gray-500 hover:text-red-400"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}

                    {/* 编辑章节表单 */}
                    {editingChapter && (
                      <div className="p-3 bg-gray-800/80 border-t border-gray-700 space-y-2">
                        <h4 className="font-medium text-gray-300 text-sm">编辑章节</h4>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-500">章号</label>
                            <input
                              type="number"
                              value={editChapterForm.chapterNumber}
                              onChange={(e) => setEditChapterForm({ ...editChapterForm, chapterNumber: parseInt(e.target.value) || 1 })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-500">章名</label>
                            <input
                              type="text"
                              value={editChapterForm.title}
                              onChange={(e) => setEditChapterForm({ ...editChapterForm, title: e.target.value })}
                              className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">POV</label>
                          <input
                            type="text"
                            value={editChapterForm.pov}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, pov: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">概要</label>
                          <textarea
                            value={editChapterForm.summary}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, summary: e.target.value })}
                            rows={2}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">推动者</label>
                          <input
                            type="text"
                            value={editChapterForm.driver}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, driver: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">冲突来源</label>
                          <input
                            type="text"
                            value={editChapterForm.conflict}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, conflict: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">章末悬念</label>
                          <input
                            type="text"
                            value={editChapterForm.hook}
                            onChange={(e) => setEditChapterForm({ ...editChapterForm, hook: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveEditChapter(editingChapter)}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingChapter(null)}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : level === 'detail' && selectedChapter ? (
          /* Level 3: 章节细纲 */
          <div className="space-y-4">
            {/* 基本信息 */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="font-medium text-lg mb-3">第{selectedChapter.chapterNumber}章 {selectedChapter.title}</h3>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">POV：</span>
                  <span className="text-gray-300">{selectedChapter.pov || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">状态：</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${statusColors[selectedChapter.status]}`}>
                    {selectedChapter.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 章节概要 */}
            {selectedChapter.summary && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">章节概要</h4>
                <p className="text-gray-300">{selectedChapter.summary}</p>
              </div>
            )}

            {/* 推动者 */}
            {selectedChapter.driver && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">推动者</h4>
                <p className="text-gray-300">{selectedChapter.driver}</p>
              </div>
            )}

            {/* 冲突来源 */}
            {selectedChapter.conflict && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">冲突来源</h4>
                <p className="text-gray-300">{selectedChapter.conflict}</p>
              </div>
            )}

            {/* 章末悬念 */}
            {selectedChapter.hook && (
              <div className="bg-gray-800 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">章末悬念</h4>
                <p className="text-gray-300">{selectedChapter.hook}</p>
              </div>
            )}

            {/* 场景节点列表 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-400">场景节点 ({selectedChapter.scenes?.length || 0})</h4>
                <button
                  onClick={() => setShowAddScene(selectedChapter.id)}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  <Plus size={14} />
                  <span>添加场景</span>
                </button>
              </div>

              {/* 添加场景表单 */}
              {showAddScene === selectedChapter.id && (
                <div className="bg-gray-800 rounded-lg p-4 space-y-3 border border-gray-700">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-500">节点号</label>
                      <input
                        type="number"
                        value={newScene.nodeNumber}
                        onChange={(e) => setNewScene({ ...newScene, nodeNumber: parseInt(e.target.value) || 1 })}
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">场景标题</label>
                      <input
                        type="text"
                        value={newScene.title}
                        onChange={(e) => setNewScene({ ...newScene, title: e.target.value })}
                        placeholder="场景标题"
                        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">场景地点</label>
                    <input
                      type="text"
                      value={newScene.location}
                      onChange={(e) => setNewScene({ ...newScene, location: e.target.value })}
                      placeholder="场景地点"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">出场角色（逗号分隔）</label>
                    <input
                      type="text"
                      value={newScene.characters}
                      onChange={(e) => setNewScene({ ...newScene, characters: e.target.value })}
                      placeholder="角色A, 角色B"
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">情绪氛围</label>
                    <input
                      type="text"
                      value={newScene.emotion}
                      onChange={(e) => setNewScene({ ...newScene, emotion: e.target.value })}
                      placeholder="紧张、温馨、压抑..."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">场景内容/要点</label>
                    <textarea
                      value={newScene.content}
                      onChange={(e) => setNewScene({ ...newScene, content: e.target.value })}
                      placeholder="场景详细描述..."
                      rows={3}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">场景作用</label>
                    <input
                      type="text"
                      value={newScene.purpose}
                      onChange={(e) => setNewScene({ ...newScene, purpose: e.target.value })}
                      placeholder="推动剧情、塑造人物..."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddScene(selectedChapter.id)}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1 text-sm"
                    >
                      确认
                    </button>
                    <button
                      onClick={() => setShowAddScene(null)}
                      className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-3 py-1 text-sm"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {/* 场景列表 */}
              {(selectedChapter.scenes || []).map((scene) => (
                <div key={scene.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs text-gray-500">节点{scene.nodeNumber}</span>
                      <h5 className="font-medium text-gray-200">{scene.title}</h5>
                    </div>
                    <button
                      onClick={() => handleDeleteScene(selectedChapter.id, scene.id)}
                      className="text-gray-500 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {scene.location && (
                    <p className="text-xs text-gray-400 mb-1">📍 {scene.location}</p>
                  )}
                  {scene.characters && scene.characters.length > 0 && (
                    <p className="text-xs text-gray-400 mb-1">👥 {scene.characters.join(', ')}</p>
                  )}
                  {scene.emotion && (
                    <p className="text-xs text-gray-400 mb-1">💫 {scene.emotion}</p>
                  )}
                  {scene.content && (
                    <p className="text-sm text-gray-300 mt-2">{scene.content}</p>
                  )}
                  {scene.purpose && (
                    <p className="text-xs text-blue-400 mt-2">→ {scene.purpose}</p>
                  )}
                </div>
              ))}

              {(!selectedChapter.scenes || selectedChapter.scenes.length === 0) && !showAddScene && (
                <p className="text-center text-gray-500 text-sm py-4">暂无场景节点</p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default OutlineViewer;
