import { useCallback } from 'react';

export const useExport = () => {
  const captureScreenshot = useCallback((canvas: HTMLCanvasElement) => {
    const dataURL = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `screenshot-${Date.now()}.png`;
    link.click();
  }, []);

  // Placeholder for GIF export
  const exportGif = useCallback(() => {
    console.warn('GIF export not implemented yet');
  }, []);

  return { captureScreenshot, exportGif };
};