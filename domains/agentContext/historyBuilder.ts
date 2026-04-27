import { ChatMessage, ChatSession } from '../../types';
import {
  classifyMessages,
  ContentValue,
  ToolType,
} from './messageClassifier';
import { LifecycleManager } from './toolLifecycle';

interface HistoryBuilderConfig {
  maxMessages?: number;
}

const DEFAULT_CONFIG: HistoryBuilderConfig = {};

/**
 * Build API history without message-count truncation.
 *
 * This intentionally does not classify, decay, strip tool args, or remove old
 * model text by age. Fiction continuity should come from canon assets and
 * workflow-guided retrieval, while chat history remains a complete transcript.
 */
export const buildSimpleHistory = (
  messages: ChatMessage[],
  _config: Partial<HistoryBuilderConfig> = {},
): ChatMessage[] => {
  return messages
    .filter(message => !message.skipInHistory);
};

/**
 * Compatibility wrapper for older callers. Lifecycle-based history decay has
 * been removed; the lifecycle manager is still used by skill trigger decay.
 */
export const buildRefinedHistory = (
  messages: ChatMessage[],
  _lifecycleManager: LifecycleManager,
  config: Partial<HistoryBuilderConfig> = {},
): ChatMessage[] => buildSimpleHistory(messages, config);

export const buildSessionHistory = (
  session: ChatSession,
  lifecycleManager: LifecycleManager,
  config?: Partial<HistoryBuilderConfig>,
): ChatMessage[] => {
  return buildRefinedHistory(session.messages, lifecycleManager, config);
};

export const getHistoryStats = (messages: ChatMessage[]): {
  total: number;
  byRole: Record<string, number>;
  byValue: Record<ContentValue, number>;
  toolTypes: Record<ToolType, number>;
} => {
  const classifications = classifyMessages(messages);

  const byRole: Record<string, number> = {
    user: 0,
    model: 0,
    system: 0,
  };

  const byValue: Record<ContentValue, number> = {
    [ContentValue.HIGH]: 0,
    [ContentValue.MEDIUM]: 0,
    [ContentValue.LOW]: 0,
  };

  const toolTypes: Record<ToolType, number> = {
    [ToolType.READ_FILE]: 0,
    [ToolType.CREATE_FILE]: 0,
    [ToolType.WRITE_FILE]: 0,
    [ToolType.PATCH_FILE]: 0,
    [ToolType.UPDATE_FILE]: 0,
    [ToolType.DELETE_FILE]: 0,
    [ToolType.LIST_FILES]: 0,
    [ToolType.MANAGE_TODOS]: 0,
    [ToolType.MANAGE_PLAN_NOTE]: 0,
    [ToolType.UPDATE_PROJECT_META]: 0,
    [ToolType.UNKNOWN]: 0,
  };

  classifications.forEach(c => {
    byRole[c.role]++;
    byValue[c.contentValue]++;
    if (c.toolType) {
      toolTypes[c.toolType]++;
    }
  });

  return {
    total: messages.length,
    byRole,
    byValue,
    toolTypes,
  };
};
