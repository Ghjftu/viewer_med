import { useEffect } from 'react';
import { useViewerStore } from '../store/useViewerStore';
import { decodeStateFromBase64 } from '../utils/base64';
import type { ViewerData } from '../types';

export const useUrlIntegration = (onDataLoaded?: (data: ViewerData) => void) => {
  const { setModels } = useViewerStore();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const encoded = urlParams.get('state');
    if (encoded) {
      try {
        const data = decodeStateFromBase64(encoded);
        if (data?.models) {
          setModels(data.models);
          
        }
      } catch (e) {
        console.error('Failed to decode URL state', e);
      }
    }
  }, [setModels, onDataLoaded]);
};