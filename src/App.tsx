import {NavigationContainer} from '@react-navigation/native';
import React, {useEffect, useState} from 'react';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {PermissionsPage} from './screens/PermissionsPage';
import {MediaPage} from './screens/MediaPage';
import {ReelPage} from './screens/ReelPage';
import type {Routes} from './Routes';
import {Camera, CameraPermissionStatus} from 'react-native-vision-camera';
import {VideoProvider} from './hooks/context/videoContext';

const Stack = createNativeStackNavigator<Routes>();

export function App(): React.ReactElement | null {
  const [cameraPermission, setCameraPermission] =
    useState<CameraPermissionStatus>();
  const [microphonePermission, setMicrophonePermission] =
    useState<CameraPermissionStatus>();

  useEffect(() => {
    Camera.getCameraPermissionStatus().then(setCameraPermission);
    Camera.getMicrophonePermissionStatus().then(setMicrophonePermission);
  }, []);

  console.log(
    `Re-rendering Navigator. Camera: ${cameraPermission} | Microphone: ${microphonePermission}`,
  );

  if (cameraPermission == null || microphonePermission == null) {
    // still loading
    return null;
  }

  const showPermissionsPage =
    cameraPermission !== 'authorized' ||
    microphonePermission === 'not-determined';
  return (
    <VideoProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            statusBarStyle: 'dark',
            animationTypeForReplace: 'push',
          }}
          initialRouteName={
            showPermissionsPage ? 'PermissionsPage' : 'ReelPage'
          }>
          <Stack.Screen name="PermissionsPage" component={PermissionsPage} />
          <Stack.Screen name="ReelPage" component={ReelPage} />
          <Stack.Screen
            name="MediaPage"
            component={MediaPage}
            options={{
              animation: 'fade_from_bottom',
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </VideoProvider>
  );
}
