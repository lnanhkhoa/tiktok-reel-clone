import RNFS from 'react-native-fs';
import uuid from 'react-native-uuid';
import { FFmpegKit, FFmpegSession } from 'ffmpeg-kit-react-native';

type VideoInputParams = {
  uri: string;
  speed: number;
  duration: number;
  filename: string;
  ext: string;
};

export async function mergeVideos(videos: VideoInputParams[], videoOutputPath: string): Promise<FFmpegSession> {
  const listFilePath = 'file://' + RNFS.TemporaryDirectoryPath + 'mylist1.txt';
  const listVideoPaths = [];

  for (const video of videos) {
    // if (video.speed === 1) listVideoPaths.push(video.uri);
    const newFileName = [uuid.v4().toString(), video.ext].join('.');
    const newUri = 'file://' + RNFS.TemporaryDirectoryPath + newFileName;
    const speed = Math.round((1 / video.speed) * 100000) / 100000;
    const cmdText = `-itsscale ${speed} -i ${video.uri} -c copy ${newUri} -y`;
    // eslint-disable-next-line no-await-in-loop
    await FFmpegKit.execute(cmdText);
    listVideoPaths.push(newUri);
  }
  console.log({ listVideoPaths });
  const contentFile = listVideoPaths.map((uri) => `file '${uri}'`).join('\n');
  await RNFS.writeFile(listFilePath, contentFile, 'utf8');
  const commandStr = `-f concat -safe 0 -i ${listFilePath} -c copy ${videoOutputPath} -y`;
  return FFmpegKit.execute(commandStr);
}

export function getTmpOutputVideo(ext: string): string {
  const filename = [uuid.v4().toString(), ext].join('.');
  return RNFS.TemporaryDirectoryPath + filename;
}

export const getVideoInfo = (path = '') => {
  const filename = path.split('/').pop() ?? '';
  const ext = path.split('.').pop() ?? '';
  return { filename, ext };
};
