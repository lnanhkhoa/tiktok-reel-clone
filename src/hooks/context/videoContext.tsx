import React, { ReactNode, createContext, useReducer, useMemo } from 'react';
import { videoReducer } from './reducers/videoReducer';
import type { Action, State } from './types';

type Dispatch = (action: Action) => void;
type VideoProviderProps = { readonly children: ReactNode };
export type VideoContextType = { state: State; videoDispatch: Dispatch } | undefined;

export const VideoStateContext = createContext<VideoContextType>(undefined);

const initialState: State = { videos: [], total: 0 };

export const VideoProvider = (props: VideoProviderProps) => {
  const [state, dispatch] = useReducer(videoReducer, initialState);
  const value = useMemo(() => ({ state, videoDispatch: dispatch }), [state]);

  return <VideoStateContext.Provider value={value}>{props.children}</VideoStateContext.Provider>;
};
