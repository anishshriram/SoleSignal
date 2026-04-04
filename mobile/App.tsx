// App.tsx — Root component and navigation configuration.
//
// This is the entry point for the React Native app. It:
//   1. Wraps everything in required third-party providers (gesture handler, safe area)
//   2. Initializes AuthContext (JWT + user state) and BLEContext (BLE connection state)
//   3. Sets up React Navigation with a single native stack
//   4. Renders either the authenticated or unauthenticated screen set based on auth state
//
// Screen routing logic:
//   - While AuthProvider is reading the Keychain on startup, `loading` is true →
//     a spinner is shown (prevents a flash of the wrong screen)
//   - If user is non-null (logged in): Home, Pairing, Contacts, AlertSent are shown
//   - If user is null (not logged in): Login and Register are shown
//   Changing auth state (login/logout) causes React Navigation to automatically swap
//   the visible screen set because `user` is read from context at the navigator level.
//
// Provider order matters:
//   AuthProvider must wrap BLEProvider (BLE screens may need auth state)
//   Both must wrap NavigationContainer (screens access context via hooks)

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

// RootStackParamList defines the navigation parameter types for each screen.
// TypeScript uses this to enforce that navigation.navigate() passes the right params.
// `undefined` means the screen takes no parameters; `{ alertId: number }` means
// AlertSentScreen requires an alertId prop (passed from HomeScreen after alert is sent).
export type RootStackParamList = {
  Register: undefined;
  Login: undefined;
  Home: undefined;
  Pairing: undefined;
  Contacts: undefined;
  AlertSent: { alertId: number }; // alertId is used to poll GET /alerts/:id for delivery status
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// AppNavigator — the inner navigation component.
// Defined separately so it can access AuthContext via useAuth()
// (hooks can only be called inside components wrapped by their provider).
function AppNavigator() {
  const { user, loading } = useAuth();

  // Show a loading spinner while the Keychain read is in progress.
  // Without this, there would be a brief flash of the Login screen before the
  // app realizes the user is already authenticated.
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
        // Global header style — applied to all screens that show a header
        headerStyle: { backgroundColor: Colors.scarlet },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
      }}>
      {user ? (
        // ─── Authenticated screen set ───────────────────────────────────────
        // These screens are only reachable when user is logged in.
        // Home has headerBackVisible: false to prevent navigating back to Login.
        // AlertSent also disables back — once an alert is sent, back navigation is blocked.
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'SoleSignal', headerBackVisible: false }} />
          <Stack.Screen name="Pairing" component={PairingScreen} options={{ title: 'Pair Sensor' }} />
          <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: 'Emergency Contacts' }} />
          <Stack.Screen name="AlertSent" component={AlertSentScreen} options={{ title: 'Alert Sent', headerBackVisible: false }} />
        </>
      ) : (
        // ─── Unauthenticated screen set ─────────────────────────────────────
        // Login is the default first screen when not logged in.
        // headerShown: false gives Login/Register full-screen layouts without a nav bar.
        <>
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
        </>
      )}
    </Stack.Navigator>
  );
}

// Root App component — sets up providers in the correct order.
export default function App() {
  return (
    // GestureHandlerRootView is required by react-native-gesture-handler
    // (used by React Navigation for swipe-back gestures). Must be the outermost wrapper.
    <GestureHandlerRootView style={styles.flex}>
      {/* SafeAreaProvider ensures screens respect device notches and home indicators */}
      <SafeAreaProvider>
        {/* AuthProvider initializes JWT state from Keychain — must wrap everything */}
        <AuthProvider>
          {/* BLEProvider initializes BLE connection state — must wrap screens that use it */}
          <BLEProvider>
            {/* StatusBar matches the scarlet header color for visual consistency */}
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
