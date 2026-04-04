// screens/PairingScreen.tsx — BLE sensor discovery and pairing screen.
//
// Pairing flow:
//   1. User taps "Scan for sensors" → request BT permissions, wait for BT radio to power on
//   2. bleService.startScan() begins scanning for devices advertising SOLE_SIGNAL_SERVICE_UUID
//   3. Discovered named devices appear in a list (anonymous peripherals are filtered out)
//   4. User taps a device → scan stops, BLE connect() runs, then POST /sensors/pair is called
//   5. The backend links the BLE hardware UUID to this user's account in the DB
//   6. The DB primary key (`id`) returned from the server is stored in BLEContext alongside
//      the live Device object — HomeScreen uses both for monitoring and alert creation
//   7. User is navigated to ContactsScreen to set up their emergency contacts
//
// stopScanRef is used to cancel the scan from the cleanup effect on unmount,
// preventing ongoing scanning if the user navigates away mid-scan.

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Device } from 'react-native-ble-plx';
import { bleService } from '../services/ble';
import { pairSensor } from '../services/api';
import { useBLE } from '../context/BLEContext';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Pairing'>;
};

export default function PairingScreen({ navigation }: Props) {
  const { setBLEState } = useBLE();
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]); // devices found during scan
  const [connecting, setConnecting] = useState<string | null>(null); // device.id being connected to, or null
  // stopScanRef stores the cancel function returned by bleService.startScan()
  // so we can stop the scan on unmount or when connecting to a device
  const stopScanRef = useRef<(() => void) | null>(null);

  // Cleanup: stop scanning if the user navigates away while a scan is in progress
  useEffect(() => {
    return () => {
      if (stopScanRef.current) {
        stopScanRef.current();
      }
    };
  }, []);

  const startScan = async () => {
    // Request BT permissions (no-op on iOS, required on Android 12+)
    const granted = await bleService.requestPermissions();
    if (!granted) {
      Alert.alert('Permission required', 'Bluetooth permission is needed to scan for sensors.');
      return;
    }

    // Wait for the Bluetooth radio to be on before scanning
    await bleService.waitForBluetooth();
    setDevices([]);
    setScanning(true);

    // Start scan — filter by service UUID, auto-stop after 10 seconds
    stopScanRef.current = bleService.startScan(device => {
      // Only show devices that have a name — filters out anonymous peripherals
      if (!device.name) return;
      setDevices(prev => {
        // Deduplicate — the same device can appear multiple times in scan results
        if (prev.find(d => d.id === device.id)) {
          return prev;
        }
        return [...prev, device];
      });
    }, 10000);

    // Mirror the 10-second timeout in UI state so the button re-enables after scan ends
    setTimeout(() => setScanning(false), 10000);
  };

  const connectAndPair = async (device: Device) => {
    setConnecting(device.id); // show spinner on this specific list row
    try {
      // Stop scanning before connecting — scanning and connecting simultaneously can cause issues
      if (stopScanRef.current) {
        stopScanRef.current();
        setScanning(false);
      }

      // BLE connect + service discovery
      const connectedDevice = await bleService.connect(device.id);

      // Call the backend to link this BLE hardware UUID to the authenticated user's account.
      // `device.id` is the BLE hardware UUID — the server stores it as `sensor_id` (TEXT).
      // The response includes `id` (DB primary key) which the app uses for alert creation.
      const res = await pairSensor(device.id);
      const sensorDbId: number = res.data.id; // DB primary key — used in POST /alerts

      // Store the live Device object + DB id in BLEContext so HomeScreen can access them
      setBLEState(connectedDevice, sensorDbId);

      Alert.alert('Paired!', `${device.name || device.id} has been paired.`, [
        { text: 'OK', onPress: () => navigation.navigate('Contacts') },
      ]);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to pair sensor. Try again.';
      Alert.alert('Error', msg);
    } finally {
      setConnecting(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Pair your sensor</Text>
      <Text style={styles.body}>
        Make sure your SoleSignal insert is powered on and nearby, then tap Scan.
      </Text>

      <TouchableOpacity
        style={[styles.button, scanning && styles.buttonDisabled]}
        onPress={startScan}
        disabled={scanning}>
        {scanning ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <Text style={styles.buttonText}>Scan for sensors</Text>
        )}
      </TouchableOpacity>

      {devices.length === 0 && !scanning && (
        <Text style={styles.empty}>No devices found. Try scanning again.</Text>
      )}

      <FlatList
        data={devices}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.deviceRow}
            onPress={() => connectAndPair(item)}
            disabled={!!connecting}>
            <View style={styles.deviceInfo}>
              <Text style={styles.deviceName}>{item.name || 'Unknown device'}</Text>
              <Text style={styles.deviceId}>{item.id}</Text>
            </View>
            {connecting === item.id ? (
              <ActivityIndicator color={Colors.scarlet} />
            ) : (
              <Text style={styles.connectText}>Connect</Text>
            )}
          </TouchableOpacity>
        )}
        style={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
  },
  heading: {
    ...Typography.heading,
    marginBottom: Spacing.sm,
  },
  body: {
    ...Typography.body,
    color: Colors.midGray,
    marginBottom: Spacing.lg,
  },
  button: {
    backgroundColor: Colors.scarlet,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  empty: {
    textAlign: 'center',
    color: Colors.midGray,
    marginTop: Spacing.xl,
  },
  list: { flex: 1 },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightGray,
  },
  deviceInfo: { flex: 1 },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.black,
  },
  deviceId: {
    fontSize: 12,
    color: Colors.midGray,
  },
  connectText: {
    color: Colors.scarlet,
    fontWeight: '600',
  },
});
