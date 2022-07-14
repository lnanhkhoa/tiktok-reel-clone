import { useMemo, useContext } from 'react';
import { VideoStateContext } from './context/videoContext';

export const useVideo = () => {
  const context = useContext(VideoStateContext);
  if (context === undefined) throw new Error('useVideo must be used within a VideoProvider');
  return useMemo(() => context, [context]);
};
