import { ChatMessage } from '../../types';
import { buildSimpleHistory } from './historyBuilder';

const getFunctionCallIds = (message: ChatMessage): string[] =>
  message.rawParts
    ?.filter((part: any) => part.functionCall)
    .map((part: any) => part.functionCall.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0) ?? [];

const getFunctionResponseIds = (message: ChatMessage): string[] =>
  message.rawParts
    ?.filter((part: any) => part.functionResponse)
    .map((part: any) => part.functionResponse.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0) ?? [];

const isUserIntentMessage = (message: ChatMessage): boolean =>
  message.role === 'user' &&
  !message.isToolOutput &&
  !message.rawParts?.some((part: any) => part.functionResponse);

const findLatestUserIntent = (messages: ChatMessage[]): ChatMessage | null => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (isUserIntentMessage(message)) return message;
  }

  return null;
};

const ensureLatestUserIntent = (
  messages: ChatMessage[],
  windowedMessages: ChatMessage[]
): ChatMessage[] => {
  const latestUserIntent = findLatestUserIntent(messages);
  if (!latestUserIntent) return windowedMessages;
  if (windowedMessages.some(message => message.id === latestUserIntent.id)) {
    return windowedMessages;
  }

  return [latestUserIntent, ...windowedMessages];
};

export const fixWindowStart = (messages: ChatMessage[]): ChatMessage[] => {
  if (messages.length === 0) return messages;

  const [firstMessage, ...rest] = messages;

  if (firstMessage.role === 'system') {
    return [firstMessage, ...fixWindowStart(rest)];
  }

  if (
    (firstMessage.role === 'model') &&
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
      (message.rawParts?.some((part: any) => part.functionResponse) || message.isToolOutput);

    if (hasToolResponse) {
      if (!lastToolCallsMessage) {
        console.log(`[fixWindowIntegrity] SKIP isolated toolResponse: msgId=${message.id}, role=${message.role}, text=${message.text?.substring(0, 50)}`);
        continue;
      }
    } else {
      lastToolCallsMessage = null;
    }

    const hasToolCalls =
      message.role === 'model' &&
      message.rawParts?.some((part: any) => part.functionCall);

    if (hasToolCalls) {
      const callIds = getFunctionCallIds(message);
      const responseIds = new Set<string>();
      let responseCount = 0;

      for (let j = i + 1; j < messages.length; j++) {
        const next = messages[j];
        const isResponse =
          (next?.role === 'user' || next?.role === 'system') &&
          (next?.rawParts?.some((part: any) => part.functionResponse) || next?.isToolOutput);

        if (isResponse) {
          responseCount++;
          getFunctionResponseIds(next).forEach(id => responseIds.add(id));
          continue;
        }

        const isSubstantial =
          next?.role === 'model' ||
          (next?.role === 'user' && !next?.rawParts?.some((part: any) => part.functionResponse));

        if (isSubstantial) break;
      }

      const hasCompleteResponses = callIds.length > 0
        ? callIds.every(id => responseIds.has(id))
        : responseCount > 0;

      if (!hasCompleteResponses) {
        console.log(`[fixWindowIntegrity] SKIP isolated toolCall: msgId=${message.id}, text=${message.text?.substring(0, 50)}`);
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
  _maxMessages?: number
): ChatMessage[] => {
  // Keep the full transcript, then repair tool-call boundaries for API validity.
  // The window does not mutate old message contents; continuity belongs to
  // project assets and workflow retrieval, not chat-history decay or truncation.
  const base = buildSimpleHistory(messages);
  const anchored = ensureLatestUserIntent(messages, base);
  return fixWindowIntegrity(fixWindowStart(anchored));
};

export const createApiHistoryPreview = (messages: ChatMessage[]) =>
  messages.map((message) => {
    const role = message.role === 'system' ? 'user' : message.role;

    if (message.rawParts) {
      return { role, parts: message.rawParts };
    }

    return { role, parts: [{ text: message.text }] };
  });
