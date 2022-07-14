import * as React from 'react';
import { useRef, useState, useMemo, useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { PinchGestureHandler, PinchGestureHandlerGestureEvent, TapGestureHandler } from 'react-native-gesture-handler';
import StaticSafeAreaInsets from 'react-native-static-safe-area-insets';
import { CameraDeviceFormat, CameraRuntimeError, sortFormats, useCameraDevices, VideoFile, PhotoFile } from 'react-native-vision-camera';
import { useIsFocused } from '@react-navigation/native';
import { Camera, frameRateIncluded } from 'react-native-vision-camera';
import {
  CAPTURE_BUTTON_SIZE,
  CONTENT_SPACING,
  MAX_ZOOM_FACTOR,
  SAFE_AREA_PADDING,
  SCREEN_WIDTH,
  HEADER_HEIGHT,
  PROGRESS_BAR_WIDTH,
} from '../Constants';
import Reanimated, { Extrapolate, interpolate, useAnimatedGestureHandler, useAnimatedProps, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';
import { useIsForeground } from '../hooks/useIsForeground';
import { StatusBarBlurBackground } from '../views/StatusBarBlurBackground';
import { RecordingButton } from '../views/RecordingButton';
import { PressableOpacity } from 'react-native-pressable-opacity';
import MaterialIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import IonIcon from 'react-native-vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// import { examplePlugin } from './frame-processors/ExamplePlugin';
import type { Routes } from '../Routes';
import { useVideo } from '../hooks/useVideo';
import { getVideoInfo } from '../utils';
import { ProgressBarSlider } from '../views/ProgressBarSlider';

const ReanimatedCamera = Reanimated.createAnimatedComponent(Camera);
Reanimated.addWhitelistedNativeProps({
  zoom: true,
});

const SCALE_FULL_ZOOM = 3;
const BUTTON_SIZE = 40;
const SPEED: number[] = [0.5, 1, 2, 3];
const STANDARD_VIDEO_LENGTH: number[] = [15, 30, 60];

type Props = NativeStackScreenProps<Routes, 'ReelPage'>;
export function ReelPage({ navigation }: Props): React.ReactElement {
  const camera = useRef<Camera>(null);
  const progressBarRef = useRef();
  const [isCameraInitialized, setIsCameraInitialized] = useState(false);
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState(false);
  const zoom = useSharedValue(0);
  const isPressingButton = useSharedValue(false);
  const {
    state: { videos },
    videoDispatch,
  } = useVideo();

  const showBottomRightButtons = videos.length > 0; // videos >0 and min 3s recording time

  const isFocussed = useIsFocused();
  const isForeground = useIsForeground();

  const [cameraPosition, setCameraPosition] = useState<'front' | 'back'>('back');
  const [enableHdr, setEnableHdr] = useState(false);
  const [flash, setFlash] = useState<'off' | 'on'>('off');
  const [enableNightMode, setEnableNightMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [standardVideoLength, setStandardVideoLength] = useState(STANDARD_VIDEO_LENGTH[0]);
  const [isRecordingVideo, setIsRecordingVideo] = useState(false);
  const [isFullRecorded, setIsFullRecorded] = useState(false);

  // camera format settings
  const devices = useCameraDevices();
  const device = devices[cameraPosition];
  const formats = useMemo<CameraDeviceFormat[]>(() => {
    if (device?.formats == null) return [];
    return device.formats.sort(sortFormats);
  }, [device?.formats]);

  //#region Memos
  const [is60Fps, setIs60Fps] = useState(true);
  const fps = useMemo(() => {
    if (!is60Fps) return 30;

    if (enableNightMode && !device?.supportsLowLightBoost) {
      // User has enabled Night Mode, but Night Mode is not natively supported, so we simulate it by lowering the frame rate.
      return 30;
    }

    const supportsHdrAt60Fps = formats.some((f) => f.supportsVideoHDR && f.frameRateRanges.some((r) => frameRateIncluded(r, 60)));
    if (enableHdr && !supportsHdrAt60Fps) {
      // User has enabled HDR, but HDR is not supported at 60 FPS.
      return 30;
    }

    const supports60Fps = formats.some((f) => f.frameRateRanges.some((r) => frameRateIncluded(r, 60)));
    if (!supports60Fps) {
      // 60 FPS is not supported by any format.
      return 30;
    }
    // If nothing blocks us from using it, we default to 60 FPS.
    return 60;
  }, [device?.supportsLowLightBoost, enableHdr, enableNightMode, formats, is60Fps]);

  const supportsCameraFlipping = useMemo(() => devices.back != null && devices.front != null, [devices.back, devices.front]);
  const supportsFlash = device?.hasFlash ?? false;
  const supportsHdr = useMemo(() => formats.some((f) => f.supportsVideoHDR || f.supportsPhotoHDR), [formats]);
  const supports60Fps = useMemo(() => formats.some((f) => f.frameRateRanges.some((rate) => frameRateIncluded(rate, 60))), [formats]);
  const canToggleNightMode = enableNightMode
    ? true // it's enabled so you have to be able to turn it off again
    : (device?.supportsLowLightBoost ?? false) || fps > 30; // either we have native support, or we can lower the FPS
  const canChooseSpeedMode = supportsCameraFlipping;
  const canChooseStandardVideoLength = videos.length === 0;
  // check if camera page is active
  const isActive = isFocussed && isForeground && !isFullRecorded;

  //#endregion

  const format = useMemo(() => {
    let result = formats;
    if (enableHdr) {
      // We only filter by HDR capable formats if HDR is set to true.
      // Otherwise we ignore the `supportsVideoHDR` property and accept formats which support HDR `true` or `false`
      result = result.filter((f) => f.supportsVideoHDR || f.supportsPhotoHDR);
    }

    // find the first format that includes the given FPS
    return result.find((f) => f.frameRateRanges.some((r) => frameRateIncluded(r, fps)));
  }, [formats, fps, enableHdr]);

  //#region Animated Zoom
  // This just maps the zoom factor to a percentage value.
  // so e.g. for [min, neutr., max] values [1, 2, 128] this would result in [0, 0.0081, 1]
  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 1, MAX_ZOOM_FACTOR);

  const cameraAnimatedProps = useAnimatedProps(() => {
    const z = Math.max(Math.min(zoom.value, maxZoom), minZoom);
    return {
      zoom: z,
    };
  }, [maxZoom, minZoom, zoom]);

  //#endregion

  //#region Callbacks
  const setIsPressingButton = useCallback(
    (_isPressingButton: boolean) => {
      isPressingButton.value = _isPressingButton;
      if (_isPressingButton) {
        // start progress bar
        setIsRecordingVideo(true);
        progressBarRef.current?.start();
      } else {
        // cancel progress
        setIsRecordingVideo(false);
        progressBarRef.current?.pause();
      }
    },
    [isPressingButton],
  );
  // Camera callbacks
  const onError = useCallback((error: CameraRuntimeError) => {
    console.error(error);
  }, []);
  const onInitialized = useCallback(() => {
    console.log('Camera initialized!');
    setIsCameraInitialized(true);
  }, []);
  const onMediaCaptured = useCallback(
    (media: PhotoFile | VideoFile, type: 'photo' | 'video') => {
      if (type === 'video') {
        const { filename, ext } = getVideoInfo(media.path);
        videoDispatch({
          type: 'addVideo',
          payload: {
            filename,
            ext,
            uri: media.path,
            duration: media.duration,
            speed,
          },
        });
      }
    },
    [videoDispatch, speed],
  );
  const onFlipCameraPressed = useCallback(() => {
    setCameraPosition((p) => (p === 'back' ? 'front' : 'back'));
  }, []);
  const onFlashPressed = useCallback(() => {
    setFlash((f) => (f === 'off' ? 'on' : 'off'));
  }, []);

  const onVideoEnd = useCallback(
    async (finished: boolean) => {
      if (!finished || isFullRecorded) return;
      setIsFullRecorded(true);
      try {
        if (camera.current == null) throw new Error('Camera ref is null!');
        await camera.current.stopRecording();
        setIsPressingButton(false);
        navigation.navigate('MediaPage');
      } catch (e) {
        console.error('failed to stop recording!', e);
      }
    },
    [navigation, setIsPressingButton, isFullRecorded],
  );

  //#endregion

  //#region Tap Gesture
  const onDoubleTap = useCallback(() => {
    onFlipCameraPressed();
  }, [onFlipCameraPressed]);

  const onSpeedPress = useCallback(
    () =>
      setSpeed((value) => {
        const index = SPEED.findIndex((i) => i === value);
        if (index !== -1) return SPEED[(index + 1) % SPEED.length];
        return value;
      }),
    [],
  );

  const onNightModePress = useCallback(() => setEnableNightMode((value) => !value), []);
  const onHdrPress = useCallback(() => setEnableHdr((value) => !value), []);
  const onFpsPress = useCallback(() => setIs60Fps((value) => !value), []);
  const onVideoLengthPress = useCallback(
    () =>
      setStandardVideoLength((value) => {
        const index = STANDARD_VIDEO_LENGTH.findIndex((i) => i === value);
        return STANDARD_VIDEO_LENGTH[(index + 1) % STANDARD_VIDEO_LENGTH.length];
      }),
    [],
  );

  const onDeleteLastVideoPress = useCallback(() => {
    Alert.alert('Discard the last clip?', '', [
      { text: 'Keep' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          if (videos.length === 0) return;
          const copyArrVideos = [...videos];
          copyArrVideos.pop();
          const previousValue = copyArrVideos.reduce((result, video) => {
            const velocity = PROGRESS_BAR_WIDTH / (standardVideoLength * video.speed);
            return result + velocity * video.duration;
          }, 0);

          progressBarRef.current?.reset(previousValue);
          videoDispatch({ type: 'deletePreviousVideo' });
          setIsFullRecorded(false);
        },
      },
    ]);
  }, [standardVideoLength, videoDispatch, videos]);
  const onBtnClosePress = useCallback(() => {
    Alert.alert('Quit recording?', '', [
      {
        text: 'Cancel',
      },
      {
        text: 'Confirm',
        style: 'destructive',
        onPress: () => {
          videoDispatch({ type: 'deleteAllVideo' });
          progressBarRef.current?.reset(0);
          setIsFullRecorded(false);
        },
      },
    ]);
  }, [videoDispatch]);

  //#endregion

  //#region Effects
  const neutralZoom = device?.neutralZoom ?? 1;
  useEffect(() => {
    // Run everytime the neutralZoomScaled value changes. (reset zoom when device changes)
    zoom.value = neutralZoom;
  }, [neutralZoom, zoom]);

  useEffect(() => {
    Camera.getMicrophonePermissionStatus().then((status) => setHasMicrophonePermission(status === 'authorized'));
  }, []);
  //#endregion

  //#region Pinch to Zoom Gesture
  // The gesture handler maps the linear pinch gesture (0 - 1) to an exponential curve since a camera's zoom
  // function does not appear linear to the user. (aka zoom 0.1 -> 0.2 does not look equal in difference as 0.8 -> 0.9)
  const onPinchGesture = useAnimatedGestureHandler<PinchGestureHandlerGestureEvent, { startZoom?: number }>({
    onStart: (_, context) => {
      context.startZoom = zoom.value;
    },
    onActive: (event, context) => {
      // we're trying to map the scale gesture to a linear zoom here
      const startZoom = context.startZoom ?? 0;
      const scale = interpolate(event.scale, [1 - 1 / SCALE_FULL_ZOOM, 1, SCALE_FULL_ZOOM], [-1, 0, 1], Extrapolate.CLAMP);
      zoom.value = interpolate(scale, [-1, 0, 1], [minZoom, startZoom, maxZoom], Extrapolate.CLAMP);
    },
  });
  //#endregion

  if (device != null && format != null) {
    console.log(
      `Re-rendering camera page with ${isActive ? 'active' : 'inactive'} camera. ` +
        `Device: "${device.name}" (${format.photoWidth}x${format.photoHeight} @ ${fps}fps)`,
    );
  } else {
    console.log('re-rendering camera page without active camera');
  }

  // const frameProcessor = useFrameProcessor((_frame) => {
  //   'worklet';
  // const values = examplePlugin(frame);
  // console.log(`Return Values: ${JSON.stringify(values)}`);
  // }, []);

  // const onFrameProcessorSuggestionAvailable = useCallback((_suggestion: FrameProcessorPerformanceSuggestion) => {
  // console.log(`Suggestion available! ${suggestion.type}: Can do ${suggestion.suggestedFrameProcessorFps} FPS`);
  // }, []);

  return (
    <View style={styles.container}>
      {device != null && (
        <PinchGestureHandler onGestureEvent={onPinchGesture} enabled={isActive}>
          <Reanimated.View style={StyleSheet.absoluteFill}>
            <TapGestureHandler onEnded={onDoubleTap} numberOfTaps={2}>
              <ReanimatedCamera
                ref={camera}
                style={StyleSheet.absoluteFill}
                device={device}
                format={format}
                fps={fps}
                hdr={enableHdr}
                lowLightBoost={device.supportsLowLightBoost && enableNightMode}
                isActive={isActive}
                onInitialized={onInitialized}
                onError={onError}
                enableZoomGesture={false}
                animatedProps={cameraAnimatedProps}
                video
                photo
                audio={hasMicrophonePermission}
                orientation="portrait"
                // frameProcessor={device.supportsParallelVideoProcessing ? frameProcessor : undefined}
                // frameProcessorFps={1}
                // onFrameProcessorPerformanceSuggestionAvailable={onFrameProcessorSuggestionAvailable}
              />
            </TapGestureHandler>
          </Reanimated.View>
        </PinchGestureHandler>
      )}

      <RecordingButton
        style={styles.captureButton}
        camera={camera}
        onMediaCaptured={onMediaCaptured}
        cameraZoom={zoom}
        minZoom={minZoom}
        maxZoom={maxZoom}
        flash={supportsFlash ? flash : 'off'}
        enabled={isCameraInitialized && isActive}
        setIsPressingButton={setIsPressingButton}
      />

      <StatusBarBlurBackground />

      <View style={styles.header}>
        <ProgressBarSlider
          ref={progressBarRef}
          isActive={isActive}
          standardVideoLength={standardVideoLength}
          speed={speed}
          onEnd={onVideoEnd}
        />
      </View>

      {!isRecordingVideo && (
        <PressableOpacity style={styles.closeButton} onPress={onBtnClosePress}>
          <IonIcon name="close" size={35} color="white" style={styles.icon} />
        </PressableOpacity>
      )}

      {!isRecordingVideo && (
        <View style={styles.rightButtonRow}>
          {supportsCameraFlipping && (
            <PressableOpacity style={styles.button} onPress={onFlipCameraPressed} disabledOpacity={0.4}>
              <IonIcon name="camera-reverse" color="white" size={24} />
            </PressableOpacity>
          )}
          {supportsFlash && (
            <PressableOpacity style={styles.button} onPress={onFlashPressed} disabledOpacity={0.4}>
              <IonIcon name={flash === 'on' ? 'flash' : 'flash-off'} color="white" size={24} />
            </PressableOpacity>
          )}
          {supports60Fps && (
            <PressableOpacity style={styles.button} onPress={onFpsPress}>
              <Text style={styles.text}>
                {is60Fps ? '60' : '30'}
                {'\n'}FPS
              </Text>
            </PressableOpacity>
          )}
          {supportsHdr && (
            <PressableOpacity style={styles.button} onPress={onHdrPress}>
              <MaterialIcon name={enableHdr ? 'hdr' : 'hdr-off'} color="white" size={24} />
            </PressableOpacity>
          )}
          {canToggleNightMode && (
            <PressableOpacity style={styles.button} onPress={onNightModePress} disabledOpacity={0.4}>
              <IonIcon name={enableNightMode ? 'moon' : 'moon-outline'} color="white" size={24} />
            </PressableOpacity>
          )}
          {canChooseSpeedMode && (
            <PressableOpacity style={styles.button} onPress={onSpeedPress} disabledOpacity={0.4}>
              <Text style={styles.text}>{`${speed}x`}</Text>
            </PressableOpacity>
          )}
          {canChooseStandardVideoLength && (
            <PressableOpacity style={styles.button} onPress={onVideoLengthPress} disabledOpacity={0.4}>
              <Text style={styles.text}>{`${standardVideoLength}s`}</Text>
            </PressableOpacity>
          )}
        </View>
      )}
      {showBottomRightButtons && (
        <View style={styles.bottomRightButtons}>
          <View>
            {!isRecordingVideo && (
              <PressableOpacity onPress={onDeleteLastVideoPress} disabledOpacity={0.4}>
                <MaterialIcon name="minus-box" size={BUTTON_SIZE} color={'white'} />
              </PressableOpacity>
            )}
          </View>
          <PressableOpacity style={styles.checkmarkWrapper} onPress={() => navigation.navigate('MediaPage')} disabledOpacity={0.4}>
            <IonIcon name="checkmark" size={24} color={'white'} />
          </PressableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  header: {
    position: 'absolute',
    top: StaticSafeAreaInsets.safeAreaInsetsTop,
    height: HEADER_HEIGHT,
    width: '100%',
  },
  captureButton: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: SAFE_AREA_PADDING.paddingBottom,
  },
  button: {
    marginBottom: CONTENT_SPACING,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'rgba(140, 140, 140, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: SAFE_AREA_PADDING.paddingTop + HEADER_HEIGHT,
    left: SAFE_AREA_PADDING.paddingLeft,
    width: 40,
    height: 40,
  },
  icon: {
    textShadowColor: 'black',
    textShadowOffset: {
      height: 0,
      width: 0,
    },
    textShadowRadius: 1,
  },
  rightButtonRow: {
    position: 'absolute',
    right: SAFE_AREA_PADDING.paddingRight,
    top: SAFE_AREA_PADDING.paddingTop + HEADER_HEIGHT,
  },
  bottomRightButtons: {
    position: 'absolute',
    flexDirection: 'row',
    paddingHorizontal: 10,
    justifyContent: 'space-between',
    width: SCREEN_WIDTH / 2 - CAPTURE_BUTTON_SIZE / 2 - 2 * CONTENT_SPACING,
    right: SAFE_AREA_PADDING.paddingRight,
    bottom: SAFE_AREA_PADDING.paddingBottom,
    minHeight: CAPTURE_BUTTON_SIZE,
    alignItems: 'center',
  },
  checkmarkWrapper: {
    backgroundColor: '#f66',
    borderRadius: 99,
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
