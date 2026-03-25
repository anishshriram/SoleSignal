import React, { createContext, useContext, useRef, useState } from 'react';
import { Device } from 'react-native-ble-plx';

interface BLEContextValue {
  connectedDevice: Device | null;
  sensorDbId: number | null;
  setBLEState: (device: Device, dbId: number) => void;
  clearBLEState: () => void;
  unmonitorRef: React.MutableRefObject<(() => void) | null>;
}

const BLEContext = createContext<BLEContextValue | null>(null);

export function BLEProvider({ children }: { children: React.ReactNode }) {
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [sensorDbId, setSensorDbId] = useState<number | null>(null);
  // Holds the tap-pattern unsubscribe function so HomeScreen can clean it up
  const unmonitorRef = useRef<(() => void) | null>(null);

  const setBLEState = (device: Device, dbId: number) => {
    setConnectedDevice(device);
    setSensorDbId(dbId);
  };

  const clearBLEState = () => {
    if (unmonitorRef.current) {
      unmonitorRef.current();
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

export function useBLE(): BLEContextValue {
  const ctx = useContext(BLEContext);
  if (!ctx) {
    throw new Error('useBLE must be used inside BLEProvider');
  }
  return ctx;
}
