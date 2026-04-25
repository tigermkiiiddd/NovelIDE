
import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles, MessageSquare, Brain, BookOpen, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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

const getTutorialSteps = (t: (key: string) => string): TutorialStep[] => [
  {
    icon: <Sparkles size={28} />,
    iconBg: 'bg-blue-600/20',
    iconColor: 'text-blue-400',
    title: t('tutorial.step1Title'),
    subtitle: t('tutorial.step1Subtitle'),
    description: t('tutorial.step1Desc'),
    tip: t('tutorial.step1Tip'),
  },
  {
    icon: <Sparkles size={28} />,
    iconBg: 'bg-purple-600/20',
    iconColor: 'text-purple-400',
    title: t('tutorial.step2Title'),
    subtitle: t('tutorial.step2Subtitle'),
    description: t('tutorial.step2Desc'),
    tip: t('tutorial.step2Tip'),
  },
  {
    icon: <MessageSquare size={28} />,
    iconBg: 'bg-green-600/20',
    iconColor: 'text-green-400',
    title: t('tutorial.step3Title'),
    subtitle: t('tutorial.step3Subtitle'),
    description: t('tutorial.step3Desc'),
    tip: t('tutorial.step3Tip'),
  },
  {
    icon: <Brain size={28} />,
    iconBg: 'bg-pink-600/20',
    iconColor: 'text-pink-400',
    title: t('tutorial.step4Title'),
    subtitle: t('tutorial.step4Subtitle'),
    description: t('tutorial.step4Desc'),
    tip: t('tutorial.step4Tip'),
  },
  {
    icon: <BookOpen size={28} />,
    iconBg: 'bg-orange-600/20',
    iconColor: 'text-orange-400',
    title: t('tutorial.step5Title'),
    subtitle: t('tutorial.step5Subtitle'),
    description: t('tutorial.step5Desc'),
    tip: t('tutorial.step5Tip'),
  },
  {
    icon: <Layers size={28} />,
    iconBg: 'bg-cyan-600/20',
    iconColor: 'text-cyan-400',
    title: t('tutorial.step6Title'),
    subtitle: t('tutorial.step6Subtitle'),
    description: t('tutorial.step6Desc'),
    tip: t('tutorial.step6Tip'),
  },
];

const TutorialModal: React.FC<TutorialModalProps> = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const { t } = useTranslation();

  if (!isOpen) return null;

  const tutorialSteps = getTutorialSteps(t);
  const step = tutorialSteps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === tutorialSteps.length - 1;

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
            {tutorialSteps.map((_, i) => (
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
            aria-label={t('tutorial.closeAriaLabel')}
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
                <span className="font-medium">{t('tutorial.whereToFind')}</span> {step.tip}
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
            {t('common.skip')}
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            {!isFirst && (
              <button
                onClick={() => setCurrentStep(prev => prev - 1)}
                className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline">{t('tutorial.prevPage')}</span>
              </button>
            )}

            {isLast ? (
              <button
                onClick={handleClose}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {t('tutorial.startWriting')}
              </button>
            ) : (
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="flex items-center gap-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <span className="hidden sm:inline">{t('tutorial.nextPage')}</span>
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
