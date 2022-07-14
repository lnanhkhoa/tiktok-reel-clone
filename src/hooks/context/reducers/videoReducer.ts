/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import type { Action, State, VideoProps } from '../types';

const calculateTotalLength = (videos: VideoProps[]): number => {
  return videos.reduce((acc, curr) => acc + curr.duration, 0);
};

export const videoReducer = (state: State, action: Action) => {
  switch (action.type) {
    case 'addVideo': {
      const videos = [...state.videos];
      const newVideo = action.payload;
      const newVideos = [...videos, newVideo];
      const total = calculateTotalLength(newVideos);
      return { ...state, videos: newVideos, total };
    }
    case 'deletePreviousVideo': {
      const videos = [...state.videos];
      if (videos.length > 0) videos.pop();
      const total = calculateTotalLength(videos);
      return { ...state, videos, total };
    }
    case 'deleteAllVideo': {
      return { videos: [], total: 0 };
    }
    default:
      return state;
  }
};
