export type Action = { type: 'addVideo'; payload: VideoProps } | { type: 'deletePreviousVideo' } | { type: 'deleteAllVideo' };

export type VideoProps = {
  uri: string;
  speed: number;
  duration: number;
  filename: string;
  ext: string;
};

export type State = {
  readonly videos: VideoProps[];
  readonly total: number;
};
