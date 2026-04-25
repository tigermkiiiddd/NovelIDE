
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Check, Star, HelpCircle } from 'lucide-react';
import { Questionnaire } from '../types';

interface QuestionnairePanelProps {
  questionnaire: Questionnaire;
  onAnswer: (questionId: string, optionIds: string[]) => void;
  onTextAnswer: (questionId: string, text: string) => void;
  onNavigate: (index: number) => void;
  onComplete: () => void;
}

const OTHER_OPTION_ID = '__other__';

const QuestionnairePanel: React.FC<QuestionnairePanelProps> = ({
  questionnaire,
  onAnswer,
  onTextAnswer,
  onNavigate,
  onComplete,
}) => {
  const { t } = useTranslation();
  const { questions, currentIndex } = questionnaire;
  const currentQuestion = questions[currentIndex];
  const total = questions.length;
  const isFirst = currentIndex === 0;
  const isLast = currentIndex === total - 1;

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion) return;
    const currentSelected = currentQuestion.userSelectedOptionIds || [];
    if (currentQuestion.type === 'single') {
      onAnswer(currentQuestion.id, [optionId]);
    } else {
      if (currentSelected.includes(optionId)) {
        onAnswer(currentQuestion.id, currentSelected.filter(id => id !== optionId));
      } else {
        onAnswer(currentQuestion.id, [...currentSelected, optionId]);
      }
    }
  };

  const isOptionSelected = (optionId: string) => {
    return currentQuestion?.userSelectedOptionIds?.includes(optionId) ?? false;
  };

  const isOtherSelected = (question = currentQuestion) => {
    return question?.userSelectedOptionIds?.includes(OTHER_OPTION_ID) ?? false;
  };

  const hasAnsweredCurrent = (() => {
    if (!currentQuestion) return false;
    const selected = currentQuestion.userSelectedOptionIds || [];
    if (selected.length === 0) return false;
    // 如果只选了"其他"，必须有填写内容才算回答
    if (selected.length === 1 && selected[0] === OTHER_OPTION_ID) {
      return !!(currentQuestion.userTextAnswer?.trim());
    }
    // 选了其他选项（非"其他"），算回答
    return true;
  })();

  const allAnswered = questions.every(q => {
    const selected = q.userSelectedOptionIds || [];
    if (selected.length === 0) return false;
    if (selected.length === 1 && selected[0] === OTHER_OPTION_ID) {
      return !!(q.userTextAnswer?.trim());
    }
    return true;
  });

  return (
    <div className="bg-gray-800 border border-amber-700/40 rounded-lg mb-2 overflow-hidden text-xs">
      {/* Compact Header */}
      <div className="px-2.5 py-1 bg-amber-900/20 border-b border-amber-800/30 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <HelpCircle size={11} className="text-amber-400" />
          <span className="text-[11px] font-medium text-amber-200">{t('questionnaire.title')}</span>
        </div>
        <div className="text-[10px] text-amber-400/60 font-mono">
          {currentIndex + 1}/{total}
        </div>
      </div>

      {/* Thin Progress bar */}
      <div className="w-full h-0.5 bg-gray-700">
        <div
          className="h-full bg-amber-500 transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>

      {/* Question */}
      {currentQuestion && (
        <div className="px-2.5 py-1.5">
          {/* Question text */}
          <div className="flex items-start gap-1.5 mb-1.5">
            <span className={`
              mt-0.5 text-[9px] px-1 py-0.5 rounded font-medium leading-none shrink-0
              ${currentQuestion.type === 'single'
                ? 'bg-blue-900/50 text-blue-400 border border-blue-800/50'
                : 'bg-purple-900/50 text-purple-400 border border-purple-800/50'
              }
            `}>
              {currentQuestion.type === 'single' ? t('questionnaire.singleSelect') : t('questionnaire.multiSelect')}
            </span>
            <span className="text-xs text-gray-200 font-medium leading-snug">{currentQuestion.text}</span>
          </div>

          {/* Compact Options */}
          <div className="space-y-1">
            {currentQuestion.options.map(option => {
              const selected = isOptionSelected(option.id);
              return (
                <button
                  key={option.id}
                  onClick={() => handleSelectOption(option.id)}
                  className={`
                    w-full text-left px-2 py-1 rounded border transition-all duration-150
                    ${selected
                      ? 'bg-amber-900/20 border-amber-600/40'
                      : 'bg-gray-900/40 border-gray-700/60 hover:border-gray-600'
                    }
                  `}
                >
                  <div className="flex items-start gap-1.5">
                    {/* Tiny Selector */}
                    <div className={`
                      mt-0.5 w-3.5 h-3.5 shrink-0 border flex items-center justify-center transition-colors
                      ${currentQuestion.type === 'single' ? 'rounded-full' : 'rounded-sm'}
                      ${selected ? 'border-amber-500 bg-amber-500/20' : 'border-gray-600'}
                    `}>
                      {selected && (
                        currentQuestion.type === 'single'
                          ? <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          : <Check size={10} className="text-amber-400" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <span className={`text-[11px] font-medium ${selected ? 'text-amber-200' : 'text-gray-200'}`}>
                        {option.label}
                      </span>
                      {option.isRecommended && (
                        <span className="ml-1 text-[9px] text-amber-400">{t('questionnaire.recommended')}</span>
                      )}
                      <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
                        {option.description}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Default "Other" option */}
            <button
              onClick={() => handleSelectOption(OTHER_OPTION_ID)}
              className={`
                w-full text-left px-2 py-1 rounded border transition-all duration-150
                ${isOptionSelected(OTHER_OPTION_ID)
                  ? 'bg-amber-900/20 border-amber-600/40'
                  : 'bg-gray-900/40 border-gray-700/60 hover:border-gray-600'
                }
              `}
            >
              <div className="flex items-start gap-1.5">
                <div className={`
                  mt-0.5 w-3.5 h-3.5 shrink-0 border flex items-center justify-center transition-colors
                  ${currentQuestion.type === 'single' ? 'rounded-full' : 'rounded-sm'}
                  ${isOptionSelected(OTHER_OPTION_ID) ? 'border-amber-500 bg-amber-500/20' : 'border-gray-600'}
                `}>
                  {isOptionSelected(OTHER_OPTION_ID) && (
                    currentQuestion.type === 'single'
                      ? <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                      : <Check size={10} className="text-amber-400" />
                  )}
                </div>
                <span className={`text-[11px] font-medium ${isOptionSelected(OTHER_OPTION_ID) ? 'text-amber-200' : 'text-gray-300'}`}>
                  {t('questionnaire.otherOption')}
                </span>
              </div>
            </button>

            {/* Text input only visible when "Other" is selected */}
            {isOtherSelected() && (
              <div className="mt-1">
                <textarea
                  value={currentQuestion.userTextAnswer || ''}
                  onChange={(e) => onTextAnswer(currentQuestion.id, e.target.value)}
                  placeholder={t('questionnaire.otherPlaceholder')}
                  rows={2}
                  className="w-full bg-gray-900/60 text-gray-200 placeholder-gray-600 border border-amber-700/40 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-amber-500/60 resize-none leading-snug"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Compact Navigation */}
      <div className="px-2.5 py-1 bg-gray-900/40 border-t border-gray-700/60 flex items-center justify-between">
        <button
          onClick={() => onNavigate(currentIndex - 1)}
          disabled={isFirst}
          className={`
            flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] transition-colors
            ${isFirst ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:bg-gray-700 hover:text-white'}
          `}
        >
          <ChevronLeft size={13} />
          {t('questionnaire.prevQuestion')}
        </button>

        <div className="flex items-center gap-0.5">
          {questions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => onNavigate(idx)}
              className={`
                w-1.5 h-1.5 rounded-full transition-colors
                ${idx === currentIndex
                  ? 'bg-amber-400'
                  : (q.userSelectedOptionIds?.length ?? 0) > 0
                    ? 'bg-amber-600/40'
                    : 'bg-gray-700'
                }
              `}
            />
          ))}
        </div>

        {isLast ? (
          <button
            onClick={onComplete}
            disabled={!allAnswered}
            className={`
              flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors
              ${allAnswered ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}
            `}
          >
            <Check size={11} />
            {t('questionnaire.complete')}
          </button>
        ) : (
          <button
            onClick={() => onNavigate(currentIndex + 1)}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
          >
            {t('questionnaire.nextQuestion')}
            <ChevronRight size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

export default QuestionnairePanel;
