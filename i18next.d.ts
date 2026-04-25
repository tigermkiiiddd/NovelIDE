import 'i18next';
import zhTranslation from './locales/zh/translation.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: typeof zhTranslation;
  }
}
