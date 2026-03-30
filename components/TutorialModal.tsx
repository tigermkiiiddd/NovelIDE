
import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles, MessageSquare, Brain, BookOpen, Layers } from 'lucide-react';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TutorialStep {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  description: string;
  tip: string;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    icon: <Sparkles size={28} />,
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-400',
    title: '欢迎来到 NovelGenie',
    subtitle: '你的 AI 长篇小说创作工作台',
    description: 'NovelGenie 是一个 AI 驱动的小说写作 IDE。它的核心是你的 AI 创作助手——它不仅能写文，还能自动管理记忆、追踪剧情、维护角色状态。所有创作都在对话中完成。',
    tip: '点击右侧 Agent 面板中的聊天框，或按消息图标打开对话',
  },
  {
    icon: <Sparkles size={28} />,
    iconBg: 'bg-purple-600/20',
    iconColor: 'text-purple-400',
    title: '可定制的技能系统',
    subtitle: 'AI 的能力由你定义',
    description: 'AI 助手使用「技能」来理解如何写作。每个项目自带一套专业技能（大纲构建、正文扩写、编辑审核等）。你可以直接编辑或新增技能模板，让 AI 按你的风格创作。',
    tip: '文件树 → 98_技能配置 → subskill 文件夹',
  },
  {
    icon: <MessageSquare size={28} />,
    iconBg: 'bg-green-600/20',
    iconColor: 'text-green-400',
    title: '对话式创作 & 变更审批',
    subtitle: 'AI 写，你审，完全掌控',
    description: '告诉 AI 你要写什么，它会像编辑一样工作——读取项目设定、调用工具、生成内容。所有写入操作（创建、修改、删除文件）都需要你的审批。你可以逐段查看差异（diff），接受或拒绝每一处修改。',
    tip: '右侧 Agent 面板 → 输入指令 → 审批 AI 提交的变更',
  },
  {
    icon: <Brain size={28} />,
    iconBg: 'bg-pink-600/20',
    iconColor: 'text-pink-400',
    title: '自动记忆 & 知识图谱',
    subtitle: 'AI 永远不会忘记你的故事',
    description: 'NovelGenie 自动维护一个知识图谱，按设定、规则、风格、用户偏好分类存储你的世界设定。AI 在每次创作时都会参考这些知识，保证故事的一致性。你也可以手动添加、编辑知识节点。',
    tip: '顶部工具栏的「知识图谱」按钮',
  },
  {
    icon: <BookOpen size={28} />,
    iconBg: 'bg-orange-600/20',
    iconColor: 'text-orange-400',
    title: '世界时间线 & 伏笔管理',
    subtitle: '精确追踪故事发展脉络',
    description: '内置时间线编辑器帮你管理事件、章节和卷的层级结构。每个事件可以关联伏笔，追踪从「埋设」到「推进」到「收尾」的完整生命周期。',
    tip: '文件树 → 03_剧情大纲/outline.json 打开时间线视图',
  },
  {
    icon: <Layers size={28} />,
    iconBg: 'bg-cyan-600/20',
    iconColor: 'text-cyan-400',
    title: '创作规范 & 自定义模板',
    subtitle: '定义你的写作标准',
    description: '「99_创作规范」文件夹包含文风指南、角色档案模板、项目档案模板等。这些模板指导 AI 按照你定义的格式和风格生成内容。你可以随时编辑这些文件来调整 AI 的输出标准。',
    tip: '文件树 → 99_创作规范 文件夹',
  },
];

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  if (!isOpen) return null;

  const step = TUTORIAL_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TUTORIAL_STEPS.length - 1;

  const handleClose = () => {
    console.log('[TutorialModal] Close button clicked');
    setCurrentStep(0);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        // 点击背景关闭
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[calc(100%-16px)] sm:w-full max-w-2xl sm:max-h-[85vh] max-h-[calc(100%-32px)] flex flex-col shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setCurrentStep(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === currentStep ? 'bg-blue-500 w-4' : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors relative z-10"
            aria-label="关闭教程"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-2 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
            {/* Icon */}
            <div className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl ${step.iconBg} flex items-center justify-center ${step.iconColor} mx-auto sm:mx-0`}>
              {step.icon}
            </div>

            {/* Text */}
            <div className="flex-1 text-center sm:text-left">
              <h2 className="text-lg sm:text-xl font-bold text-white mb-1">{step.title}</h2>
              <p className="text-sm text-gray-400 mb-3">{step.subtitle}</p>
              <p className="text-sm text-gray-300 leading-relaxed mb-4">{step.description}</p>

              {/* Tip */}
              <div className="px-3 py-2.5 bg-blue-900/20 border border-blue-800/30 rounded-lg text-xs sm:text-sm text-blue-300">
                <span className="font-medium">在哪里找到：</span> {step.tip}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-800 shrink-0">
          <button
            onClick={handleClose}
            className="text-sm text-gray-500 hover:text-gray-300 transition-colors px-3 py-2"
          >
            跳过
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isFirst && (
              <button
                onClick={() => setCurrentStep(prev => prev - 1)}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline">上一页</span>
              </button>
            )}

            {isLast ? (
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                开始写作
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="flex items-center gap-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span className="hidden sm:inline">下一页</span>
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialModal;
