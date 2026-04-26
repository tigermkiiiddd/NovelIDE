import { create } from 'zustand';
import { DEFAULT_SOUL } from '../services/resources/skills/coreProtocol';
import { dbAPI } from '../services/persistence';

interface GlobalSoulState {
  soul: string;
  isLoaded: boolean;
  isLoading: boolean;
  setSoul: (soul: string) => void;
  load: () => Promise<void>;
  save: (soul?: string) => Promise<void>;
  resetToDefault: () => Promise<void>;
}

export const useGlobalSoulStore = create<GlobalSoulState>((set, get) => ({
  soul: DEFAULT_SOUL,
  isLoaded: false,
  isLoading: false,

  setSoul: (soul) => set({ soul }),

  load: async () => {
    if (get().isLoaded || get().isLoading) return;
    set({ isLoading: true });

    try {
      const savedSoul = await dbAPI.getGlobalSoul();
      set({
        soul: savedSoul?.trim() ? savedSoul : DEFAULT_SOUL,
        isLoaded: true,
        isLoading: false,
      });
    } catch (error) {
      console.error('[GlobalSoulStore] 加载失败:', error);
      set({ soul: DEFAULT_SOUL, isLoaded: true, isLoading: false });
    }
  },

  save: async (nextSoul) => {
    const soul = nextSoul ?? get().soul;
    set({ soul });
    await dbAPI.saveGlobalSoul(soul);
  },

  resetToDefault: async () => {
    set({ soul: DEFAULT_SOUL });
    await dbAPI.saveGlobalSoul(DEFAULT_SOUL);
  },
}));

export default useGlobalSoulStore;
