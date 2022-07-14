import React, { useMemo, useImperativeHandle, forwardRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Reanimated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  cancelAnimation,
  withSpring,
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
} from 'react-native-reanimated';
import { PROGRESS_BAR_HEIGHT, PROGRESS_BAR_WIDTH } from '../Constants';

interface IProgressBarSlider {
  standardVideoLength?: number;
  speed?: number;
  isActive: boolean;
  onEnd?: (finished?: boolean) => void;
}

export const ProgressBarSlider = forwardRef(function ProgressBarSlider(
  { standardVideoLength = 15, speed = 1, onEnd, isActive }: IProgressBarSlider,
  ref,
) {
  const velocity = useMemo(() => PROGRESS_BAR_WIDTH / standardVideoLength, [standardVideoLength]);
  const progressWidth = useSharedValue(0);
  const timeCountdown = useDerivedValue(() => {
    return Math.ceil((PROGRESS_BAR_WIDTH - progressWidth.value) / velocity);
  });
  const [timer, setTimer] = useState(standardVideoLength);
  const updateTimer = useCallback((time) => setTimer(time), []);

  const remainTime = useMemo(() => {
    const remainDistance = PROGRESS_BAR_WIDTH - progressWidth.value;
    return ((remainDistance * speed) / velocity) * 1000;
  }, [progressWidth.value, speed, velocity]);

  useAnimatedReaction(
    () => timeCountdown.value,
    (result, previous) => {
      if (result !== previous) runOnJS(updateTimer)(result);
    },
  );

  const onStart = useCallback(() => {
    progressWidth.value = withTiming(
      PROGRESS_BAR_WIDTH,
      {
        duration: remainTime,
        easing: Easing.linear,
      },
      (finished) => {
        if (typeof onEnd === 'function') runOnJS(onEnd)(finished);
      },
    );
  }, [progressWidth, remainTime, onEnd]);

  const onPause = useCallback(() => {
    cancelAnimation(progressWidth);
  }, [progressWidth]);

  const onReset = useCallback(
    (defauValue = 0) => {
      progressWidth.value = withSpring(defauValue, {
        damping: 20,
        stiffness: 90,
        velocity: 10,
      });
    },
    [progressWidth],
  );

  useImperativeHandle(
    ref,
    () => ({
      start: onStart,
      pause: onPause,
      reset: onReset,
    }),
    [onStart, onPause, onReset],
  );

  useEffect(() => {
    if (!isActive) cancelAnimation(progressWidth);
  }, [isActive, progressWidth]);

  const progressWidthStyle = useAnimatedStyle(() => ({ width: progressWidth.value }));

  return (
    <>
      <View style={styles.progressContainer}>
        <View style={styles.progressOverlay}>
          <Reanimated.View style={[styles.progress, progressWidthStyle]} />
        </View>
      </View>
      <Text style={styles.timeText}>{'0:' + String(timer).padStart(2, '0')}</Text>
    </>
  );
});

const styles = StyleSheet.create({
  progressContainer: {
    marginTop: 20,
    marginBottom: 5,
    width: PROGRESS_BAR_WIDTH,
    height: PROGRESS_BAR_HEIGHT,
    alignSelf: 'center',
    borderRadius: 20,
    overflow: 'hidden',
  },
  progressOverlay: {
    flex: 1,
    backgroundColor: '#7a7a7a',
  },
  progress: {
    flex: 1,
    borderRadius: 20,
    backgroundColor: '#00a8ff',
  },
  timeText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
