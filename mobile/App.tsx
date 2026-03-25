import React from 'react';
import { ActivityIndicator, StatusBar, View, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { BLEProvider } from './src/context/BLEContext';
import RegisterScreen from './src/screens/RegisterScreen';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import PairingScreen from './src/screens/PairingScreen';
import ContactsScreen from './src/screens/ContactsScreen';
import AlertSentScreen from './src/screens/AlertSentScreen';
import { Colors } from './src/theme';

export type RootStackParamList = {
  Register: undefined;
  Login: undefined;
  Home: undefined;
  Pairing: undefined;
  Contacts: undefined;
  AlertSent: { alertId: number };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={Colors.scarlet} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: Colors.scarlet },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}>
      {user ? (
        // Authenticated screens
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'SoleSignal', headerBackVisible: false }} />
          <Stack.Screen name="Pairing" component={PairingScreen} options={{ title: 'Pair Sensor' }} />
          <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Emergency Contacts' }} />
          <Stack.Screen name="AlertSent" component={AlertSentScreen} options={{ title: 'Alert Sent', headerBackVisible: false }} />
        </>
      ) : (
        // Unauthenticated screens
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AuthProvider>
          <BLEProvider>
            <StatusBar barStyle="light-content" backgroundColor={Colors.scarlet} />
            <NavigationContainer>
              <AppNavigator />
            </NavigationContainer>
          </BLEProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
});
