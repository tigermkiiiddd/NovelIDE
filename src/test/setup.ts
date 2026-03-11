import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

// Polyfill for TextEncoder/TextDecoder in jsdom
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Suppress console output during tests unless needed
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('Warning: ReactDOM.render') ||
       args[0].includes('Warning: useLayoutEffect') ||
       args[0].includes('Not implemented:') ||
       args[0].includes('[AI Response] ⚠️ completion_tokens=0') ||
       args[0].includes('[AIService] API Error:') ||
       args[0].includes('[AgentEngine]') ||
       args[0].includes('[AgentEngine-EXIT]') ||
       (args[0].includes('An update to') && args[0].includes('was not wrapped in act')) ||
       (args[0].includes('Failed to load files from DB, falling back to initial')))
    ) {
      return;
    }
    originalError.call(console, ...args);
  };

  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      (args[0].includes('componentWillReceiveProps') ||
       args[0].includes('No files found for project'))
    ) {
      return;
    }
    originalWarn.call(console, ...args);
  };

  console.log = (...args) => {
    if (typeof args[0] === 'string') {
      const msg = args[0];
      if (
        msg.includes('[AI Request - 完整请求]') ||
        msg.includes('[AI Response]') ||
        msg.includes('[Editor]') ||
        msg.includes('mergedPendingChange') ||
        msg.includes('[窗口-Summary]')
      ) {
        return;
      }
    }
    originalLog.call(console, ...args);
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});
