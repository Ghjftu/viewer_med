import { create } from 'zustand';
import type { ModelState } from '../types';

interface ViewerStore {
  models: ModelState[];
  addModel: (model: Omit<ModelState, 'id'>) => void;
  removeModel: (id: string) => void;
  updateModel: (id: string, updates: Partial<ModelState>) => void;
  setModels: (models: ModelState[]) => void;
  resetScene: () => void;
}

export const useViewerStore = create<ViewerStore>((set, get) => ({
  models: [],

  addModel: (modelData) => {
    console.log('[Store] addModel called with:', modelData);
    const newModel = {
      ...modelData,
      id: Math.random().toString(36).substr(2, 9),
    };
    set((state) => ({
      models: [...state.models, newModel],
    }));
    console.log('[Store] Models after addModel:', get().models);
  },

  removeModel: (id) => {
    console.log('[Store] removeModel called with id:', id);
    set((state) => ({
      models: state.models.filter((m) => m.id !== id),
    }));
    console.log('[Store] Models after removeModel:', get().models);
  },

  updateModel: (id, updates) => {
    console.log(`[Store] updateModel id=${id}`, updates);
    set((state) => ({
      models: state.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    }));
    console.log('[Store] Models after updateModel:', get().models);
  },

  setModels: (models) => {
    console.log('[Store] setModels called with', models.length, 'models:', models);
    set({ models });
    console.log('[Store] Models after setModels:', get().models);
  },

  resetScene: () => {
    console.log('[Store] resetScene called');
    set({ models: [] });
  },
}));