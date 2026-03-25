/**
 * @file KnowledgeTreeView.tsx
 * @description 知识图谱树状视图组件 - 三级分类 + Tag系统
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Edit2,
  Trash2,
  Tag,
  Search,
  Filter,
  Globe,
  BookOpen,
  AlertTriangle,
  PenTool,
} from 'lucide-react';
import {
  KnowledgeCategory,
  KnowledgeNode,
  KnowledgeNodeDraft,
  DEFAULT_SUB_CATEGORIES,
} from '../types';
import { useKnowledgeGraphStore } from '../stores/knowledgeGraphStore';
import { KnowledgeNodeEditor } from './KnowledgeNodeEditor';

// ============================================
// 常量
// ============================================

const CATEGORY_CONFIG: Record<
  KnowledgeCategory,
  { icon: React.ReactNode; color: string; bgColor: string }
> = {
  '设定': {
    icon: <Globe className="w-4 h-4" />,
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/30',
  },
  '规则': {
    icon: <BookOpen className="w-4 h-4" />,
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/30',
  },
  '禁止': {
    icon: <AlertTriangle className="w-4 h-4" />,
    color: 'text-red-400',
    bgColor: 'bg-red-900/30',
  },
  '风格': {
    icon: <PenTool className="w-4 h-4" />,
    color: 'text-purple-400',
    bgColor: 'bg-purple-900/30',
  },
};

// ============================================
// 子组件
// ============================================

interface TreeNodeProps {
  label: string;
  icon?: React.ReactNode;
  color?: string;
  bgColor?: string;
  count?: number;
  level: number;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
  onClick?: () => void;
  isSelected?: boolean;
}

const TreeNode: React.FC<TreeNodeProps> = ({
  label,
  icon,
  color = 'text-gray-300',
  bgColor = 'bg-gray-800/50',
  count,
  level,
  isExpanded,
  onToggle,
  children,
  onClick,
  isSelected,
}) => {
  const paddingLeft = level * 16 + 8;

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-gray-700/50 rounded ${
          isSelected ? 'bg-blue-900/30' : ''
        }`}
        style={{ paddingLeft }}
        onClick={(e) => {
          e.stopPropagation();
          if (children) {
            onToggle();
          }
          onClick?.();
        }}
      >
        {children && (
          <span className="text-gray-500">
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </span>
        )}
        {!children && <span className="w-3" />}
        {icon && <span className={color}>{icon}</span>}
        <span className={`flex-1 truncate ${color}`}>{label}</span>
        {count !== undefined && (
          <span className="text-xs text-gray-500">{count}</span>
        )}
      </div>
      {children && isExpanded && <div>{children}</div>}
    </div>
  );
};

interface NodeItemProps {
  node: KnowledgeNode;
  onEdit: () => void;
  onDelete: () => void;
  isSelected: boolean;
  onSelect: () => void;
}

const NodeItem: React.FC<NodeItemProps> = ({
  node,
  onEdit,
  onDelete,
  isSelected,
  onSelect,
}) => {
  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 cursor-pointer hover:bg-gray-700/50 rounded ml-8 ${
          isSelected ? 'bg-blue-900/30 border-l-2 border-blue-500' : ''
        }`}
      onClick={onSelect}
    >
      <span className="flex-1 truncate text-gray-300 text-sm">{node.name}</span>
      {node.tags.length > 0 && (
        <div className="flex gap-1">
          {node.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-xs px-1.5 py-0.5 bg-gray-700 text-gray-400 rounded"
            >
              {tag}
            </span>
          ))}
          {node.tags.length > 2 && (
            <span className="text-xs text-gray-500">+{node.tags.length - 2}</span>
          )}
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="p-1 hover:bg-gray-600 rounded text-gray-500 hover:text-white"
      >
        <Edit2 className="w-3 h-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
};

// ============================================
// 主组件
// ============================================

interface Props {
  onSelectNode?: (node: KnowledgeNode) => void;
  className?: string;
}

export const KnowledgeTreeView: React.FC<Props> = ({ onSelectNode, className = '' }) => {
  const store = useKnowledgeGraphStore();
  const { nodes, availableSubCategories, availableTags, ensureInitialized, addNode, updateNode, deleteNode } =
    store;

  const [expandedCategories, setExpandedCategories] = useState<Set<KnowledgeCategory>>(
    new Set()
  );
  const [expandedSubCategories, setExpandedSubCategories] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingNode, setEditingNode] = useState<KnowledgeNode | null>(null);

  // 初始化
  useEffect(() => {
    ensureInitialized();
  }, [ensureInitialized]);

  // 过滤节点
  const filteredNodes = useMemo(() => {
    let result = nodes;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.summary.toLowerCase().includes(q) ||
          n.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (selectedTag) {
      result = result.filter((n) => n.tags.includes(selectedTag));
    }

    return result;
  }, [nodes, searchQuery, selectedTag]);

  // 统计
  const stats = useMemo(() => {
    const byCategory: Record<KnowledgeCategory, number> = {
      '设定': 0,
      '规则': 0,
      '禁止': 0,
      '风格': 0,
    };
    const bySubCategory: Record<string, number> = {};

    filteredNodes.forEach((node) => {
      byCategory[node.category]++;
      const key = `${node.category}/${node.subCategory}`;
      bySubCategory[key] = (bySubCategory[key] || 0) + 1;
    });

    return { byCategory, bySubCategory };
  }, [filteredNodes]);

  // 获取子分类下的节点
  const getNodesForSubCategory = useCallback(
    (category: KnowledgeCategory, subCategory: string) => {
      return filteredNodes.filter(
        (n) => n.category === category && n.subCategory === subCategory
      );
    },
    [filteredNodes]
  );

  // 切换分类展开状态
  const toggleCategory = useCallback((category: KnowledgeCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  // 切换子分类展开状态
  const toggleSubCategory = useCallback((key: string) => {
    setExpandedSubCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // 处理节点选择
  const handleSelectNode = useCallback(
    (node: KnowledgeNode) => {
      setSelectedNodeId(node.id);
      onSelectNode?.(node);
    },
    [onSelectNode]
  );

  // 处理删除
  const handleDelete = useCallback(
    (node: KnowledgeNode) => {
      if (confirm(`确定删除知识节点「${node.name}」吗？`)) {
        deleteNode(node.id);
        if (selectedNodeId === node.id) {
          setSelectedNodeId(null);
        }
      }
    },
    [deleteNode, selectedNodeId]
  );

  return (
    <div className={`h-full flex flex-col bg-gray-900 text-gray-100 ${className}`}>
      {/* 工具栏 */}
      <div className="p-3 border-b border-gray-700 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="搜索知识..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded pl-9 pr-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm"
        >
          <Plus className="w-4 h-4" />
          添加
        </button>
      </div>

      {/* Tag 过滤器 */}
      {availableTags.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2 overflow-x-auto">
          <Filter className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                !selectedTag ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            全部
          </button>
          {availableTags.slice(0, 10).map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${
                selectedTag === tag ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* 树状视图 */}
      <div className="flex-1 overflow-auto p-2">
        {(Object.keys(DEFAULT_SUB_CATEGORIES) as KnowledgeCategory[]).map((category) => {
          const config = CATEGORY_CONFIG[category];
          const subCategories = availableSubCategories[category] || [];
          const count = stats.byCategory[category];

          return (
            <TreeNode
              key={category}
              label={category}
              icon={config.icon}
              color={config.color}
              bgColor={config.bgColor}
              count={count}
              level={0}
              isExpanded={expandedCategories.has(category)}
              onToggle={() => toggleCategory(category)}
            >
              {subCategories.map((subCategory) => {
                const key = `${category}/${subCategory}`;
                const subCount = stats.bySubCategory[key] || 0;

                if (subCount === 0 && searchQuery) return null;

                return (
                  <TreeNode
                    key={key}
                    label={subCategory}
                    color="text-gray-400"
                    level={1}
                    isExpanded={expandedSubCategories.has(key)}
                    onToggle={() => toggleSubCategory(key)}
                  >
                    {getNodesForSubCategory(category, subCategory).map((node) => (
                      <NodeItem
                        key={node.id}
                        node={node}
                        isSelected={selectedNodeId === node.id}
                        onSelect={() => handleSelectNode(node)}
                        onEdit={() => setEditingNode(node)}
                        onDelete={() => handleDelete(node)}
                      />
                    ))}
                  </TreeNode>
                );
              })}
            </TreeNode>
          );
        })}

        {filteredNodes.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            {searchQuery ? '没有匹配的知识' : '暂无知识，点击添加按钮创建'}
          </div>
        )}
      </div>

      {/* 添加/编辑模态框 */}
      {(showAddModal || editingNode) && (
        <KnowledgeNodeEditor
          node={editingNode}
          onSave={(draft) => {
            if (editingNode) {
              updateNode(editingNode.id, draft);
            } else {
              addNode(draft);
            }
            setShowAddModal(false);
            setEditingNode(null);
          }}
          onCancel={() => {
            setShowAddModal(false);
            setEditingNode(null);
          }}
        />
      )}
    </div>
  );
};

export default KnowledgeTreeView;
