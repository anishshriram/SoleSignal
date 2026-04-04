// context/BLEContext.tsx — BLE connection state management.
//
// Provides a React context that stores the currently connected BLE device and its
// associated database sensor ID. All screens that need to know whether the sensor
// is connected (or need to trigger an alert) read this via the `useBLE()` hook.
//
// Why global state for BLE?
//   The BLE connection must persist while the user navigates between screens.
//   If state lived in a single screen component, it would be lost on navigation.
//   Storing it here (at the root level via BLEProvider in App.tsx) keeps the
//   connection alive for the full app session.
//
// Key fields:
//   - connectedDevice: the react-native-ble-plx Device object (null = not connected)
//     Used by HomeScreen to monitor tap notifications and by PairingScreen to
//     display connected status.
//   - sensorDbId: the INTEGER database primary key of the sensor record.
//     Stored after pairing (from POST /sensors/pair response) and used when
//     calling POST /alerts. Important: this is NOT the BLE hardware UUID (sensor_id).
//   - unmonitorRef: a ref holding the tap-pattern notification unsubscribe function.
//     Stored here (not in HomeScreen state) because it needs to survive re-renders
//     and be accessible from clearBLEState when cleaning up on disconnect or logout.

import React, { createContext, useContext, useRef, useState } from 'react';
import { Device } from 'react-native-ble-plx';

// Full shape of the context value — what any consumer of useBLE() receives
interface BLEContextValue {
  connectedDevice: Device | null;  // the active BLE device, or null if not connected
  sensorDbId: number | null;       // the sensor's DB primary key, or null if not paired/connected
  setBLEState: (device: Device, dbId: number) => void; // called after successful connect
  clearBLEState: () => void;       // called on disconnect, unpair, or logout
  unmonitorRef: React.MutableRefObject<(() => void) | null>; // tap notification cleanup fn
}

const BLEContext = createContext<BLEContextValue | null>(null);

export function BLEProvider({ children }: { children: React.ReactNode }) {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [sensorDbId, setSensorDbId] = useState<number | null>(null);

  // unmonitorRef holds the function returned by bleService.monitorTapPattern().
  // Calling it unsubscribes from BLE notifications. Stored in a ref (not state)
  // because updating it should NOT trigger a re-render — it's just a cleanup handle.
  const unmonitorRef = useRef<(() => void) | null>(null);

  // setBLEState — called after a successful BLE connection + DB lookup.
  // `dbId` is the sensor's database primary key (used when creating alerts).
  const setBLEState = (device: Device, dbId: number) => {
    setConnectedDevice(device);
    setSensorDbId(dbId);
  };

  // clearBLEState — called when the device disconnects, the user unpairs, or logs out.
  // First cancels the tap-pattern notification subscription to avoid memory leaks,
  // then clears both pieces of connection state.
  const clearBLEState = () => {
    if (unmonitorRef.current) {
      unmonitorRef.current(); // unsubscribe from tap notifications
      unmonitorRef.current = null;
    }
    setConnectedDevice(null);
    setSensorDbId(null);
  };

  return (
    <BLEContext.Provider
      value={{ connectedDevice, sensorDbId, setBLEState, clearBLEState, unmonitorRef }}>
      {children}
    </BLEContext.Provider>
  );
}

// useBLE — the hook all screens use to read or update BLE connection state.
// Must be called inside a component that is a descendant of BLEProvider.
export function useBLE(): BLEContextValue {
  const ctx = useContext(BLEContext);
  if (!ctx) {
    throw new Error('useBLE must be used inside BLEProvider');
  }
  return ctx;
}
