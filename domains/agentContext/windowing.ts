import { ChatMessage } from '../../types';
import { buildSimpleHistory } from './historyBuilder';

export const MAX_CONTEXT_MESSAGES = 30;

export const fixWindowStart = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length === 0) return messages;

  const [firstMessage, ...rest] = messages;

  if (firstMessage.role === 'system') {
    return [firstMessage, ...fixWindowStart(rest)];
  }

  if (
    (firstMessage.role === 'model' || firstMessage.role === 'assistant') &&
    firstMessage.rawParts?.some((part: any) => part.functionCall)
  ) {
    return fixWindowStart(rest);
  }

  return messages;
};

export const fixWindowIntegrity = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length === 0) return messages;

  const result: ChatMessage[] = [];
  let lastToolCallsMessage: ChatMessage | null = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    const hasToolResponse =
      (message.role === 'user' || message.role === 'system') &&
      message.rawParts?.some((part: any) => part.functionResponse);

    if (hasToolResponse) {
      if (!lastToolCallsMessage) {
        continue;
      }
    } else {
      lastToolCallsMessage = null;
    }

    const hasToolCalls =
      (message.role === 'model' || message.role === 'assistant') &&
      message.rawParts?.some((part: any) => part.functionCall);

    if (hasToolCalls) {
      let hasNextResponse = false;

      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j];
        const isResponse =
          (next?.role === 'user' || next?.role === 'system') &&
          next?.rawParts?.some((part: any) => part.functionResponse);

        if (isResponse) {
          hasNextResponse = true;
          break;
        }

        const isSubstantial =
          next?.role === 'model' ||
          next?.role === 'assistant' ||
          (next?.role === 'user' && !next?.rawParts?.some((part: any) => part.functionResponse));

        if (isSubstantial) break;
      }

      if (!hasNextResponse) {
        continue;
      }

      lastToolCallsMessage = message;
    }

    result.push(message);
  }

  return result;
};

export const getWindowedMessages = (
  messages: ChatMessage[],
  maxMessages: number = MAX_CONTEXT_MESSAGES
): ChatMessage[] => {
  const base = buildSimpleHistory(messages, { maxMessages });
  return fixWindowIntegrity(fixWindowStart(base));
};

export const createApiHistoryPreview = (messages: ChatMessage[]) =>
  messages.map((message) => {
    const role = message.role === 'system' ? 'user' : message.role;

    if (message.rawParts) {
      return { role, parts: message.rawParts };
    }

    return { role, parts: [{ text: message.text }] };
  });
