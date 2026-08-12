import { create } from 'zustand';
import type { ExtractedMenuItem } from '@/features/menu/ocrService';

export interface DraftMenuItem extends ExtractedMenuItem {
  include: boolean;
}

interface MenuScanState {
  drafts: DraftMenuItem[];
  setDrafts: (items: ExtractedMenuItem[]) => void;
  updateDraft: (index: number, patch: Partial<DraftMenuItem>) => void;
  clear: () => void;
}

export const useMenuScanStore = create<MenuScanState>((set) => ({
  drafts: [],
  setDrafts: (items) => set({ drafts: items.map((item) => ({ ...item, include: true })) }),
  updateDraft: (index, patch) =>
    set((state) => ({
      drafts: state.drafts.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    })),
  clear: () => set({ drafts: [] }),
}));
