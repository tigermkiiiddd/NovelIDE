/**
 * VConsole type definitions
 */
declare module 'vconsole' {
  export default class VConsole {
    constructor(options?: { theme?: 'light' | 'dark' });
    destroy(): void;
    setOption(key: string, value: any): void;
  }
}
