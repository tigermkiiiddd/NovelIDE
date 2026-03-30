import React, { useMemo, useState } from 'react';
import {
  Activity,
  BookOpen,
  Brain,
  Clock3,
  HeartHandshake,
  MapPin,
  Sparkles,
  Target,
  User,
  Zap,
  Archive,
  ChevronDown,
  ChevronRight,
  Pencil,
  Check,
  X,
  Trash2,
  Plus,
  History,
} from 'lucide-react';
import { EntityVersionHistory } from './EntityVersionHistory';
import { useEntityVersionStore } from '../stores/entityVersionStore';
import { useCharacterMemoryStore, CharacterMemoryState } from '../stores/characterMemoryStore';
import {
  CharacterProfileV2,
  CharacterCategoryName,
  CharacterCategory,
  OverwriteEntry,
  AccumulateEntry,
  CHARACTER_CATEGORIES,
  SkillValue,
  AttributeValue,
} from '../types';

interface CharacterProfileViewProps {
  filePath: string;
  content?: string;
}

const cardStyle: React.CSSProperties = {
  background: 'linear-gradient(180deg, rgba(35,39,46,0.96) 0%, rgba(24,27,33,0.96) 100%)',
  border: '1px solid rgba(148, 163, 184, 0.16)',
  borderRadius: 16,
  padding: 18,
  boxShadow: '0 18px 40px rgba(0, 0, 0, 0.22)',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  borderRadius: 999,
  background: 'rgba(56, 189, 248, 0.12)',
  border: '1px solid rgba(56, 189, 248, 0.2)',
  color: '#bae6fd',
  fontSize: 12,
  lineHeight: 1.4,
};

const unicodeProfileFolder = '\u0030\u0032_\u89d2\u8272\u6863\u6848/\u89d2\u8272\u72b6\u6001\u4e0e\u8bb0\u5fc6/';

// 分类图标映射
const CATEGORY_ICONS: Record<CharacterCategoryName, React.ReactNode> = {
  '状态': <Activity size={16} />,
  '属性': <Zap size={16} />,
  '目标': <Target size={16} />,
  '技能': <Sparkles size={16} />,
  '关系': <HeartHandshake size={16} />,
  '经历': <BookOpen size={16} />,
  '记忆': <Brain size={16} />,
};

// 分类颜色映射
const CATEGORY_COLORS: Record<CharacterCategoryName, string> = {
  '状态': '#38bdf8',
  '属性': '#a78bfa',
  '目标': '#f59e0b',
  '技能': '#34d399',
  '关系': '#f472b6',
  '经历': '#60a5fa',
  '记忆': '#c084fc',
};

const formatTime = (timestamp?: number) => {
  if (!timestamp) return '未记录';

  try {
    return new Date(timestamp).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '未记录';
  }
};

const deriveCharacterName = (filePath: string) => {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || '';
  return fileName.replace(/\.json$/i, '').trim();
};

const parseFallbackProfile = (content?: string): CharacterProfileV2 | undefined => {
  if (!content) return undefined;

  try {
    return JSON.parse(content) as CharacterProfileV2;
  } catch {
    return undefined;
  }
};

const Section: React.FC<{
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accentColor?: string;
  children: React.ReactNode;
}> = ({ icon, title, subtitle, accentColor = '#38bdf8', children }) => (
  <section style={cardStyle}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          display: 'grid',
          placeItems: 'center',
          background: `${accentColor}14`,
          color: accentColor,
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{subtitle}</div> : null}
      </div>
    </div>
    {children}
  </section>
);

// 预设小分类选项
const PRESET_SUBCATEGORIES: Record<CharacterCategoryName, string[]> = {
  '状态': ['位置', '情绪', '体力', '当前装备', '当前任务', '健康状态', '精神状态'],
  '属性': ['力量', '敏捷', '智力', '魅力', '运气', '体质', '意志', '感知'],
  '目标': ['主目标', '近期目标', '隐藏目标', '短期目标', '最终目标'],
  '技能': ['剑术', '魔法', '潜行', '格斗', '医术', '烹饪', '手工艺'],
  '关系': [], // 关系以角色名为子分类，不需要预设
  '经历': ['身世背景', '关键事件', '转折点', '成长变化'],
  '记忆': ['已知秘密', '重要信息', '关键线索'],
};

// 分类卡片组件
const CategoryCard: React.FC<{
  categoryName: CharacterCategoryName;
  category: CharacterProfileV2['categories'][string];
  defaultExpanded?: boolean;
  characterName: string;
}> = ({ categoryName, category, defaultExpanded = false, characterName }) => {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [isAddingSubCategory, setIsAddingSubCategory] = React.useState(false);
  const [newSubCategoryName, setNewSubCategoryName] = React.useState('');
  const color = CATEGORY_COLORS[categoryName];
  const isOverwrite = category.type === '覆盖';
  const subCategoryCount = Object.keys(category.subCategories).length;
  const addSubCategory = useCharacterMemoryStore((state: CharacterMemoryState) => state.addSubCategory);

  // 计算条目数量
  const entryCount = useMemo(() => {
    let count = 0;
    Object.values(category.subCategories).forEach((value) => {
      if (Array.isArray(value)) {
        count += value.filter((e) => !e.archived).length;
      } else if ((value as OverwriteEntry).value) {
        count += 1;
      }
    });
    return count;
  }, [category.subCategories]);

  const handleAddSubCategory = () => {
    const name = newSubCategoryName.trim();
    if (!name) return;

    // 检查是否已存在
    if (category.subCategories[name]) {
      alert('该小分类已存在');
      return;
    }

    addSubCategory(characterName, categoryName, name);
    setNewSubCategoryName('');
    setIsAddingSubCategory(false);
  };

  return (
    <div
      style={{
        background: 'rgba(15, 23, 42, 0.5)',
        border: `1px solid ${color}22`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      {/* 标题栏 */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          cursor: 'pointer',
          background: expanded ? `${color}0a` : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              background: `${color}18`,
              color: color,
            }}
          >
            {CATEGORY_ICONS[categoryName]}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#f8fafc' }}>{categoryName}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {isOverwrite ? '覆盖型' : '累加型'} · {subCategoryCount} 小分类 · {entryCount} 条目
            </div>
          </div>
        </div>
        <div style={{ color: '#94a3b8' }}>
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </div>
      </div>

      {/* 内容区域 */}
      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          {Object.entries(category.subCategories).map(([subCatName, value]) => (
            <SubCategoryView
              key={subCatName}
              subCategoryName={subCatName}
              value={value}
              isOverwrite={isOverwrite}
              accentColor={color}
              categoryName={categoryName}
              characterName={characterName}
            />
          ))}
          {subCategoryCount === 0 && !isAddingSubCategory && (
            <EmptyInline text={`暂无 ${categoryName} 相关记录`} />
          )}

          {/* 添加新子分类 */}
          {isAddingSubCategory ? (
            <div
              style={{
                padding: '12px 14px',
                marginTop: 10,
                borderRadius: 12,
                background: 'rgba(30, 41, 59, 0.7)',
                border: `1px solid ${color}40`,
              }}
            >
              {/* 预设选项 */}
              {(() => {
                const presets = PRESET_SUBCATEGORIES[categoryName] || [];
                const availablePresets = presets.filter(p => !category.subCategories[p]);
                if (availablePresets.length > 0) {
                  return (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>快速选择：</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {availablePresets.map((preset) => (
                          <button
                            key={preset}
                            onClick={() => {
                              addSubCategory(characterName, categoryName, preset);
                              setIsAddingSubCategory(false);
                              setNewSubCategoryName('');
                            }}
                            style={{
                              padding: '4px 10px',
                              borderRadius: 6,
                              background: `${color}15`,
                              border: `1px solid ${color}30`,
                              color: color,
                              fontSize: 12,
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = `${color}25`;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = `${color}15`;
                            }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* 自定义输入 */}
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>自定义：</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={newSubCategoryName}
                  onChange={(e) => setNewSubCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddSubCategory();
                    if (e.key === 'Escape') {
                      setIsAddingSubCategory(false);
                      setNewSubCategoryName('');
                    }
                  }}
                  placeholder="输入自定义名称..."
                  autoFocus
                  style={{ ...inputStyle, flex: 1 }}
                />
                <button
                  onClick={() => {
                    setIsAddingSubCategory(false);
                    setNewSubCategoryName('');
                  }}
                  style={{ ...editBtnStyle, color: '#94a3b8' }}
                >
                  <X size={16} />
                </button>
                <button
                  onClick={handleAddSubCategory}
                  style={{ ...editBtnStyle, color: '#34d399' }}
                >
                  <Check size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setIsAddingSubCategory(true)}
              style={{
                marginTop: 10,
                padding: '10px 14px',
                borderRadius: 10,
                background: 'transparent',
                border: `1px dashed ${color}40`,
                color: color,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                width: '100%',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
            >
              <Plus size={14} />
              添加小分类
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// 解析结构化值 - 支持字符串或直接的对象
const parseStructuredValue = (value: unknown): { isStructured: boolean; data?: any; display: React.ReactNode } => {
  // 如果已经是对象，直接处理
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;

    // 技能格式：{ quality, description, unlockCondition }
    if ('quality' in obj) {
      const skill = obj as { quality: string; description?: string; unlockCondition?: string };
      return {
        isStructured: true,
        data: skill,
        display: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: skill.quality === '未掌握' ? 'rgba(239, 68, 68, 0.2)' :
                  skill.quality === '入门' ? 'rgba(59, 130, 246, 0.2)' :
                  skill.quality === '熟练' ? 'rgba(34, 197, 94, 0.2)' :
                  skill.quality === '精通' ? 'rgba(168, 85, 247, 0.2)' :
                  'rgba(234, 179, 8, 0.2)',
                color: skill.quality === '未掌握' ? '#fca5a5' :
                  skill.quality === '入门' ? '#93c5fd' :
                  skill.quality === '熟练' ? '#4ade80' :
                  skill.quality === '精通' ? '#d8b4fe' :
                  '#fbbf24',
              }}>
                {skill.quality}
              </span>
            </div>
            {skill.description && (
              <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
                {skill.description}
              </div>
            )}
            {skill.unlockCondition && (
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
                <span style={{ color: '#64748b' }}>解锁条件：</span>{skill.unlockCondition}
              </div>
            )}
          </div>
        ),
      };
    }

    // 属性格式：{ level, description }
    if ('level' in obj && 'description' in obj) {
      const attr = obj as { level: string; description: string };
      return {
        isStructured: true,
        data: attr,
        display: (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: attr.level === 'S' ? '#fbbf24' :
                attr.level === 'A' ? '#4ade80' :
                attr.level === 'B' ? '#60a5fa' :
                attr.level === 'C' ? '#f97316' :
                '#94a3b8',
            }}>{attr.level}</span>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{attr.description}</span>
          </div>
        ),
      };
    }

    // 未知对象格式，显示 JSON
    return { isStructured: false, display: JSON.stringify(obj) };
  }

  // 如果是字符串，尝试 JSON 解析
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === 'object' && parsed !== null) {
        return parseStructuredValue(parsed); // 递归处理对象
      }
    } catch {
      // 不是 JSON，直接显示字符串
    }
    return { isStructured: false, display: value };
  }

  return { isStructured: false, display: String(value) };
};

// 编辑按钮样式
const editBtnStyle: React.CSSProperties = {
  padding: 4,
  borderRadius: 6,
  background: 'transparent',
  border: 'none',
  color: '#64748b',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.2s',
};

// 输入框样式
const inputStyle: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.8)',
  border: '1px solid rgba(148, 163, 184, 0.3)',
  borderRadius: 6,
  padding: '6px 10px',
  color: '#f8fafc',
  fontSize: 13,
  outline: 'none',
  width: '100%',
};

// 下拉框样式
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

// 技能编辑表单
const SkillEditForm: React.FC<{
  initialValue: SkillValue | string;
  onSave: (value: SkillValue) => void;
  onCancel: () => void;
}> = ({ initialValue, onSave, onCancel }) => {
  const parsed = typeof initialValue === 'object' && initialValue !== null
    ? initialValue as SkillValue
    : { quality: '入门' as const, description: '', unlockCondition: '' };

  const [quality, setQuality] = useState<SkillValue['quality']>(parsed.quality || '入门');
  const [description, setDescription] = useState(parsed.description || '');
  const [unlockCondition, setUnlockCondition] = useState(parsed.unlockCondition || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60 }}>品质：</span>
        <select
          value={quality}
          onChange={(e) => setQuality(e.target.value as SkillValue['quality'])}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="未掌握">未掌握</option>
          <option value="入门">入门</option>
          <option value="熟练">熟练</option>
          <option value="精通">精通</option>
          <option value="大师">大师</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60, paddingTop: 6 }}>描述：</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical' }}
          placeholder="技能描述"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60, paddingTop: 6 }}>解锁条件：</span>
        <textarea
          value={unlockCondition}
          onChange={(e) => setUnlockCondition(e.target.value)}
          style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical' }}
          placeholder="解锁或提升条件"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ ...editBtnStyle, color: '#94a3b8' }}>
          <X size={16} />
        </button>
        <button
          onClick={() => onSave({ quality, description, unlockCondition })}
          style={{ ...editBtnStyle, color: '#34d399' }}
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
};

// 属性编辑表单
const AttributeEditForm: React.FC<{
  initialValue: AttributeValue | string;
  onSave: (value: AttributeValue) => void;
  onCancel: () => void;
}> = ({ initialValue, onSave, onCancel }) => {
  const parsed = typeof initialValue === 'object' && initialValue !== null
    ? initialValue as AttributeValue
    : { level: 'C', description: '' };

  const [level, setLevel] = useState(parsed.level || 'C');
  const [description, setDescription] = useState(parsed.description || '');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60 }}>等级：</span>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          style={{ ...selectStyle, flex: 1 }}
        >
          <option value="S">S</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <span style={{ fontSize: 12, color: '#94a3b8', minWidth: 60, paddingTop: 6 }}>描述：</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ ...inputStyle, flex: 1, minHeight: 60, resize: 'vertical' }}
          placeholder="属性描述"
        />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ ...editBtnStyle, color: '#94a3b8' }}>
          <X size={16} />
        </button>
        <button
          onClick={() => onSave({ level, description })}
          style={{ ...editBtnStyle, color: '#34d399' }}
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
};

// 简单字符串编辑表单
const StringEditForm: React.FC<{
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}> = ({ initialValue, onSave, onCancel }) => {
  const [value, setValue] = useState(String(initialValue || ''));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
        placeholder="输入内容..."
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{ ...editBtnStyle, color: '#94a3b8' }}>
          <X size={16} />
        </button>
        <button
          onClick={() => onSave(value)}
          style={{ ...editBtnStyle, color: '#34d399' }}
        >
          <Check size={16} />
        </button>
      </div>
    </div>
  );
};

// 判断值类型
const getValueType = (categoryName: CharacterCategoryName, value: unknown): 'skill' | 'attribute' | 'string' => {
  if (categoryName === '技能') return 'skill';
  if (categoryName === '属性') return 'attribute';
  return 'string';
};

// 小分类视图组件（带编辑功能）
const SubCategoryView: React.FC<{
  subCategoryName: string;
  value: OverwriteEntry | AccumulateEntry[];
  isOverwrite: boolean;
  accentColor: string;
  categoryName: CharacterCategoryName;
  characterName: string;
}> = ({ subCategoryName, value, isOverwrite, accentColor, categoryName, characterName }) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(subCategoryName);
  const updateProfile = useCharacterMemoryStore((state: CharacterMemoryState) => state.updateProfile);
  const removeSubCategory = useCharacterMemoryStore((state: CharacterMemoryState) => state.removeSubCategory);
  const addSubCategory = useCharacterMemoryStore((state: CharacterMemoryState) => state.addSubCategory);

  // 重命名子分类
  const handleRename = () => {
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName === subCategoryName) {
      setIsRenaming(false);
      setNewName(subCategoryName);
      return;
    }

    // 1. 添加新子分类
    addSubCategory(characterName, categoryName, trimmedName);

    // 2. 复制内容到新子分类
    useCharacterMemoryStore.setState((state: CharacterMemoryState) => {
      const profile = state.profiles.find(p => p.characterName === characterName);
      if (!profile) return state;

      const oldContent = profile.categories[categoryName]?.subCategories[subCategoryName];

      return {
        profiles: state.profiles.map(p => {
          if (p.characterName !== characterName) return p;
          return {
            ...p,
            categories: {
              ...p.categories,
              [categoryName]: {
                ...p.categories[categoryName],
                subCategories: {
                  ...p.categories[categoryName].subCategories,
                  [trimmedName]: oldContent,
                },
              },
            },
            updatedAt: Date.now(),
          };
        }),
      };
    });

    // 3. 删除旧子分类
    removeSubCategory(characterName, categoryName, subCategoryName);

    setIsRenaming(false);
  };

  const handleSaveOverwrite = (newValue: string | SkillValue | AttributeValue) => {
    updateProfile({
      characterName,
      chapterRef: '手动编辑',
      updates: [{
        category: categoryName,
        subCategory: subCategoryName,
        value: newValue,
        action: 'update',
      }],
    });
    setEditingIndex(null);
  };

  const handleDeleteOverwrite = () => {
    removeSubCategory(characterName, categoryName, subCategoryName);
    setConfirmDelete(null);
  };

  const handleSaveAccumulate = (index: number, newValue: string) => {
    // 累加型：更新指定索引的条目
    const entries = (value as AccumulateEntry[]);
    const activeEntries = entries.filter(e => !e.archived);
    const actualIndex = entries.findIndex(e => e === activeEntries[index]);

    if (actualIndex >= 0) {
      // 直接修改条目
      entries[actualIndex].value = newValue;
      entries[actualIndex].updatedAt = Date.now();
      // 触发更新
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: state.profiles.map(p =>
          p.characterName === characterName ? { ...p, updatedAt: Date.now() } : p
        ),
      }));
    }
    setEditingIndex(null);
  };

  const handleDeleteAccumulate = (index: number) => {
    // 累加型：删除指定条目
    const entries = (value as AccumulateEntry[]);
    const activeEntries = entries.filter(e => !e.archived);
    const actualIndex = entries.findIndex(e => e === activeEntries[index]);

    if (actualIndex >= 0) {
      entries.splice(actualIndex, 1);
      // 触发更新
      useCharacterMemoryStore.setState((state: CharacterMemoryState) => ({
        profiles: state.profiles.map(p =>
          p.characterName === characterName ? { ...p, updatedAt: Date.now() } : p
        ),
      }));
    }
    setConfirmDelete(null);
  };

  if (isOverwrite) {
    const entry = value as OverwriteEntry;
    const isEmpty = !entry.value;
    const valueType = getValueType(categoryName, entry.value);
    const isEditing = editingIndex === 0;
    const isDeleting = confirmDelete === 0;

    // 删除确认
    if (isDeleting) {
      return (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 10,
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
          }}
        >
          <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>
            确定删除 "{subCategoryName}" 吗？
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmDelete(null)}
              style={{ ...editBtnStyle, color: '#94a3b8' }}
            >
              取消
            </button>
            <button
              onClick={handleDeleteOverwrite}
              style={{ ...editBtnStyle, color: '#ef4444' }}
            >
              确认删除
            </button>
          </div>
        </div>
      );
    }

    // 重命名
    if (isRenaming) {
      return (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 10,
            borderRadius: 12,
            background: 'rgba(30, 41, 59, 0.7)',
            border: `1px solid ${accentColor}40`,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setNewName(subCategoryName);
                }
              }}
              placeholder="输入新名称..."
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => {
                setIsRenaming(false);
                setNewName(subCategoryName);
              }}
              style={{ ...editBtnStyle, color: '#94a3b8' }}
              title="取消"
            >
              <X size={16} />
            </button>
            <button
              onClick={handleRename}
              style={{ ...editBtnStyle, color: '#34d399' }}
              title="确认"
            >
              <Check size={16} />
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            原名称：{subCategoryName}
          </div>
        </div>
      );
    }

    if (isEditing) {
      return (
        <div
          style={{
            padding: '12px 14px',
            marginBottom: 10,
            borderRadius: 12,
            background: 'rgba(30, 41, 59, 0.7)',
            border: '1px solid rgba(52, 211, 153, 0.3)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: accentColor, marginBottom: 10 }}>
            {subCategoryName}
          </div>
          {valueType === 'skill' && (
            <SkillEditForm
              initialValue={entry.value as SkillValue}
              onSave={handleSaveOverwrite}
              onCancel={() => setEditingIndex(null)}
            />
          )}
          {valueType === 'attribute' && (
            <AttributeEditForm
              initialValue={entry.value as AttributeValue}
              onSave={handleSaveOverwrite}
              onCancel={() => setEditingIndex(null)}
            />
          )}
          {valueType === 'string' && (
            <StringEditForm
              initialValue={String(entry.value)}
              onSave={handleSaveOverwrite}
              onCancel={() => setEditingIndex(null)}
            />
          )}
        </div>
      );
    }

    const parsed = parseStructuredValue(entry.value);

    return (
      <div
        style={{
          padding: '12px 14px',
          marginBottom: 10,
          borderRadius: 12,
          background: 'rgba(30, 41, 59, 0.5)',
          border: isEmpty ? `1px dashed ${accentColor}40` : '1px solid rgba(148, 163, 184, 0.1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>{subCategoryName}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {entry.chapterRef && (
              <span style={{ fontSize: 11, color: '#64748b' }}>{entry.chapterRef}</span>
            )}
            <button
              onClick={() => setIsRenaming(true)}
              style={{ ...editBtnStyle, fontSize: 11 }}
              title="重命名"
            >
              重命名
            </button>
            <button
              onClick={() => setEditingIndex(0)}
              style={editBtnStyle}
              title="编辑内容"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setConfirmDelete(0)}
              style={{ ...editBtnStyle, color: '#ef4444' }}
              title="删除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
        <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.7 }}>
          {isEmpty ? (
            <span style={{ color: '#64748b', fontStyle: 'italic' }}>
              点击编辑按钮添加内容
            </span>
          ) : (
            parsed.display
          )}
        </div>
      </div>
    );
  }

  // 累加型
  const entries = (value as AccumulateEntry[]).filter((e) => !e.archived);
  if (entries.length === 0) return null;

  // 重命名模式
  if (isRenaming) {
    return (
      <div style={{ marginBottom: 12 }}>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(30, 41, 59, 0.7)',
            border: `1px solid ${accentColor}40`,
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setIsRenaming(false);
                  setNewName(subCategoryName);
                }
              }}
              placeholder="输入新名称..."
              autoFocus
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={() => {
                setIsRenaming(false);
                setNewName(subCategoryName);
              }}
              style={{ ...editBtnStyle, color: '#94a3b8' }}
              title="取消"
            >
              <X size={16} />
            </button>
            <button
              onClick={handleRename}
              style={{ ...editBtnStyle, color: '#34d399' }}
              title="确认"
            >
              <Check size={16} />
            </button>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
            原名称：{subCategoryName} · {entries.length} 条记录
          </div>
        </div>
        {/* 显示条目列表但不可操作 */}
        {entries.map((entry, index) => (
          <div
            key={index}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(30, 41, 59, 0.3)',
              border: '1px solid rgba(148, 163, 184, 0.08)',
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6 }}>
              {String(entry.value)}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>
          {subCategoryName}
          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400, marginLeft: 8 }}>
            {entries.length} 条记录
          </span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            onClick={() => setIsRenaming(true)}
            style={{ ...editBtnStyle, fontSize: 11 }}
            title="重命名"
          >
            重命名
          </button>
          <button
            onClick={() => setConfirmDelete(-1)}
            style={{ ...editBtnStyle, color: '#ef4444' }}
            title="删除整个子分类"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {/* 删除整个子分类确认 */}
      {confirmDelete === -1 && (
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 13, color: '#fca5a5', marginBottom: 10 }}>
            确定删除整个 "{subCategoryName}" 子分类及其所有 {entries.length} 条记录吗？
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setConfirmDelete(null)}
              style={{ ...editBtnStyle, color: '#94a3b8' }}
            >
              取消
            </button>
            <button
              onClick={() => {
                removeSubCategory(characterName, categoryName, subCategoryName);
                setConfirmDelete(null);
              }}
              style={{ ...editBtnStyle, color: '#ef4444' }}
            >
              确认删除
            </button>
          </div>
        </div>
      )}
      {confirmDelete !== -1 && (
      <div style={{ display: 'grid', gap: 8 }}>
        {entries.map((entry, index) => {
          const isEditing = editingIndex === index;
          const isDeleting = confirmDelete === index;

          // 删除确认
          if (isDeleting) {
            return (
              <div
                key={index}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                }}
              >
                <div style={{ fontSize: 12, color: '#fca5a5', marginBottom: 8 }}>
                  确定删除这条记录吗？
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    style={{ ...editBtnStyle, color: '#94a3b8' }}
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleDeleteAccumulate(index)}
                    style={{ ...editBtnStyle, color: '#ef4444' }}
                  >
                    确认删除
                  </button>
                </div>
              </div>
            );
          }

          if (isEditing) {
            return (
              <div
                key={index}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  background: 'rgba(30, 41, 59, 0.7)',
                  border: '1px solid rgba(52, 211, 153, 0.3)',
                }}
              >
                <StringEditForm
                  initialValue={String(entry.value)}
                  onSave={(v) => handleSaveAccumulate(index, v)}
                  onCancel={() => setEditingIndex(null)}
                />
              </div>
            );
          }

          const parsed = parseStructuredValue(entry.value);
          return (
            <div
              key={index}
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(30, 41, 59, 0.4)',
                border: '1px solid rgba(148, 163, 184, 0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>#{index + 1}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {entry.chapterRef && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>{entry.chapterRef}</span>
                  )}
                  <button
                    onClick={() => setEditingIndex(index)}
                    style={editBtnStyle}
                    title="编辑"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(index)}
                    style={{ ...editBtnStyle, color: '#ef4444' }}
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>
                {parsed.display}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
};

const EmptyInline: React.FC<{ text: string }> = ({ text }) => (
  <div
    style={{
      padding: '12px 14px',
      borderRadius: 12,
      border: '1px dashed rgba(148, 163, 184, 0.22)',
      color: '#94a3b8',
      fontSize: 13,
      lineHeight: 1.7,
      textAlign: 'center',
    }}
  >
    {text}
  </div>
);

export const CharacterProfileView: React.FC<CharacterProfileViewProps> = ({ filePath, content }) => {
  const profiles = useCharacterMemoryStore((state: CharacterMemoryState) => state.profiles);
  const characterName = useMemo(() => deriveCharacterName(filePath), [filePath]);
  const fallbackProfile = useMemo(() => parseFallbackProfile(content), [content]);
  const profile = useMemo(
    () =>
      profiles.find(
        (item: CharacterProfileV2) => item.characterName.trim().toLowerCase() === characterName.trim().toLowerCase()
      ) || fallbackProfile,
    [characterName, fallbackProfile, profiles]
  );
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const restoreProfileFromVersion = useCharacterMemoryStore((state: CharacterMemoryState) => state.restoreProfileFromVersion);

  if (!profile) {
    return (
      <div
        style={{
          height: '100%',
          display: 'grid',
          placeItems: 'center',
          background:
            'radial-gradient(circle at top, rgba(14, 116, 144, 0.16), transparent 40%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
          color: '#cbd5e1',
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 560, textAlign: 'center' }}>
          <User size={42} style={{ marginBottom: 14, color: '#38bdf8' }} />
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>角色档案尚未生成</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, color: '#94a3b8' }}>
            当前文件位于 <code>{unicodeProfileFolder}</code>，但还没有可渲染的角色画像数据。
            <br />
            <br />
            AI 可以通过 <code>initCharacterProfile</code> 工具初始化角色档案。
          </div>
        </div>
      </div>
    );
  }

  // 计算统计信息
  const stats = useMemo(() => {
    let totalEntries = 0;
    let overwriteCount = 0;
    let accumulateCount = 0;

    (Object.entries(profile.categories) as [string, CharacterCategory][]).forEach(([, cat]) => {
      if (!cat || !cat.subCategories) return;
      Object.values(cat.subCategories).forEach((value) => {
        if (Array.isArray(value)) {
          const activeCount = value.filter((e: AccumulateEntry) => !e.archived).length;
          totalEntries += activeCount;
          accumulateCount += activeCount;
        } else if ((value as OverwriteEntry).value) {
          totalEntries += 1;
          overwriteCount += 1;
        }
      });
    });

    return { totalEntries, overwriteCount, accumulateCount };
  }, [profile.categories]);

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        padding: 24,
        background:
          'radial-gradient(circle at top left, rgba(14, 165, 233, 0.16), transparent 34%), radial-gradient(circle at top right, rgba(34, 197, 94, 0.12), transparent 28%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
        color: '#e2e8f0',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* 头部信息 */}
        <section
          style={{
            ...cardStyle,
            padding: 24,
            background:
              'linear-gradient(135deg, rgba(14, 116, 144, 0.18) 0%, rgba(15, 23, 42, 0.98) 44%, rgba(22, 101, 52, 0.22) 100%)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
            }}
          >
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 62,
                  height: 62,
                  borderRadius: 18,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: '#67e8f9',
                  flexShrink: 0,
                }}
              >
                <User size={28} />
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#f8fafc', marginBottom: 8 }}>
                  {profile.characterName}
                </div>
                {profile.baseProfilePath && (
                  <div style={{ fontSize: 13, color: '#64748b', marginBottom: 8 }}>
                    基础设定: {profile.baseProfilePath}
                  </div>
                )}
                <div style={{ fontSize: 13, color: '#94a3b8' }}>
                  创建于 {formatTime(profile.createdAt)} · 最后更新于 {profile.lastChapterRef || '未记录'}
                </div>
              </div>
              <button
                onClick={() => setShowVersionHistory(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 12px',
                  backgroundColor: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: 8,
                  color: '#bae6fd',
                  fontSize: 13,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <History size={16} />
                版本历史
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
                gap: 12,
                minWidth: 320,
                flex: 1,
              }}
            >
              <MetricCard label="总条目" value={String(stats.totalEntries)} accent="#38bdf8" />
              <MetricCard label="覆盖型" value={String(stats.overwriteCount)} accent="#34d399" />
              <MetricCard label="累加型" value={String(stats.accumulateCount)} accent="#f59e0b" />
              <MetricCard
                label="大分类"
                value={String(Object.keys(profile.categories).filter((k) => profile.categories[k]).length)}
                accent="#a78bfa"
              />
            </div>
          </div>
        </section>

        {/* 分类说明 */}
        <div
          style={{
            padding: '12px 16px',
            borderRadius: 12,
            background: 'rgba(30, 41, 59, 0.4)',
            border: '1px solid rgba(148, 163, 184, 0.1)',
            fontSize: 13,
            color: '#94a3b8',
          }}
        >
          <strong style={{ color: '#cbd5e1' }}>分类说明：</strong>
          <span style={{ marginLeft: 8 }}>
            <span style={{ color: '#34d399' }}>● 覆盖型</span>（状态/属性/目标/技能）只保留最新值；
            <span style={{ color: '#f59e0b', marginLeft: 12 }}>● 累加型</span>（关系/经历/记忆）保留历史记录
          </span>
        </div>

        {/* 覆盖型分类 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
          {(['状态', '属性', '目标', '技能'] as CharacterCategoryName[]).map((catName) => (
            <CategoryCard
              key={catName}
              categoryName={catName}
              category={profile.categories[catName]}
              defaultExpanded={catName === '状态'}
              characterName={profile.characterName}
            />
          ))}
        </div>

        {/* 累加型分类 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, 1fr)', gap: 18 }}>
          {(['关系', '经历', '记忆'] as CharacterCategoryName[]).map((catName) => (
            <CategoryCard
              key={catName}
              categoryName={catName}
              category={profile.categories[catName]}
              defaultExpanded={catName === '关系'}
              characterName={profile.characterName}
            />
          ))}
        </div>
      </div>

      {/* 版本历史弹窗 */}
      <EntityVersionHistory
        isOpen={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        entityType="character_profile"
        entityId={profile.characterId}
        entityName={profile.characterName}
        onRestore={(versionId) => {
          const restored = restoreProfileFromVersion(versionId);
          if (restored) {
            setShowVersionHistory(false);
          }
        }}
      />
    </div>
  );
};

const MetricCard: React.FC<{ label: string; value: string; accent: string }> = ({ label, value, accent }) => (
  <div
    style={{
      padding: 14,
      borderRadius: 14,
      background: 'rgba(15, 23, 42, 0.5)',
      border: '1px solid rgba(148, 163, 184, 0.14)',
    }}
  >
    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
  </div>
);
