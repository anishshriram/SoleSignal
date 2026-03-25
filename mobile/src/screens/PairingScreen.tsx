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
  const [devices, setDevices] = useState<Device[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);
  const stopScanRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (stopScanRef.current) {
        stopScanRef.current();
      }
    };
  }, []);

  const startScan = async () => {
    const granted = await bleService.requestPermissions();
    if (!granted) {
      Alert.alert('Permission required', 'Bluetooth permission is needed to scan for sensors.');
      return;
    }

    await bleService.waitForBluetooth();
    setDevices([]);
    setScanning(true);

    stopScanRef.current = bleService.startScan(device => {
      setDevices(prev => {
        if (prev.find(d => d.id === device.id)) {
          return prev;
        }
        return [...prev, device];
      });
    }, 10000);

    setTimeout(() => setScanning(false), 10000);
  };

  const connectAndPair = async (device: Device) => {
    setConnecting(device.id);
    try {
      if (stopScanRef.current) {
        stopScanRef.current();
        setScanning(false);
      }

      const connectedDevice = await bleService.connect(device.id);
      const res = await pairSensor(device.id);
      const sensorDbId: number = res.data.id;

      // Store the live BLE device + its DB id so HomeScreen can monitor it
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
