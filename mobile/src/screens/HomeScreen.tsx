import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Device } from 'react-native-ble-plx';
import Geolocation from '@react-native-community/geolocation';
import { useAuth } from '../context/AuthContext';
import { useBLE } from '../context/BLEContext';
import {
  sendAlert,
  getContacts,
  getMySensor,
  logoutUser,
  unpairSensor,
} from '../services/api';
import { bleService } from '../services/ble';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

type LogLevel = 'info' | 'ok' | 'warn' | 'error';
type LogEntry = { id: number; ts: string; msg: string; level: LogLevel };

let logCounter = 0;

export default function HomeScreen({ navigation }: Props) {
  const { clearAuth } = useAuth();
  const { connectedDevice, sensorDbId, setBLEState, clearBLEState, unmonitorRef } = useBLE();

  const [sensorPaired, setSensorPaired] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [contactId, setContactId] = useState<number | null>(null);
  const [resolvedSensorDbId, setResolvedSensorDbId] = useState<number | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const alertInProgress = useRef(false);
  const logListRef = useRef<FlatList>(null);
  const reconnectAttempted = useRef(false);

  const addLog = useCallback((msg: string, level: LogLevel = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [
      ...prev.slice(-99), // keep last 100 entries
      { id: logCounter++, ts, msg, level },
    ]);
    setTimeout(() => logListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, []),
  );

  // Wire up BLE tap monitoring whenever we have a connected device
  useEffect(() => {
    if (!connectedDevice) {
      if (bleConnected) {
        setBleConnected(false);
        addLog('Sensor disconnected', 'warn');
      }
      return;
    }

    setBleConnected(true);
    addLog(`Sensor connected: ${connectedDevice.name || connectedDevice.id}`, 'ok');

    if (unmonitorRef.current) {
      unmonitorRef.current();
    }

    unmonitorRef.current = bleService.monitorTapPattern(
      connectedDevice,
      () => {
        if (!alertInProgress.current) {
          addLog('Tap pattern detected — triggering alert', 'warn');
          handleAutoAlert();
        }
      },
      (value) => {
        addLog(`BLE data received: "${value}"`, 'info');
      },
    );

    // Listen for disconnection
    const disconnectSub = connectedDevice.onDisconnected(() => {
      clearBLEState();
      setBleConnected(false);
      addLog('Sensor disconnected unexpectedly', 'warn');
    });

    return () => {
      if (unmonitorRef.current) {
        unmonitorRef.current();
        unmonitorRef.current = null;
      }
      disconnectSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedDevice]);

  const loadStatus = async () => {
    try {
      const contactsRes = await getContacts();
      const contacts = contactsRes.data?.contacts || [];
      if (contacts.length > 0) {
        setContactId(contacts[0].id);
      } else {
        setContactId(null);
      }
    } catch {
      // No contacts yet
    }

    if (sensorDbId) {
      setResolvedSensorDbId(sensorDbId);
      setSensorPaired(true);
    } else {
      try {
        const res = await getMySensor();
        if (res.data?.is_paired) {
          setSensorPaired(true);
          setResolvedSensorDbId(res.data.id);
          if (!connectedDevice && !reconnectAttempted.current) {
            reconnectAttempted.current = true;
            reconnectSilently(res.data.sensor_id, res.data.id);
          }
        } else {
          setSensorPaired(false);
          setResolvedSensorDbId(null);
        }
      } catch {
        setSensorPaired(false);
        setResolvedSensorDbId(null);
      }
    }
  };

  const reconnectSilently = async (bleDeviceId: string, dbId: number) => {
    addLog('Auto-reconnect: looking for paired sensor…', 'info');
    try {
      await bleService.requestPermissions();
      await Promise.race([
        bleService.waitForBluetooth(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('BT timeout')), 3000),
        ),
      ]);
      const device = await Promise.race([
        bleService.connect(bleDeviceId),
        new Promise<Device>((_, reject) =>
          setTimeout(() => reject(new Error('connect timeout')), 5000),
        ),
      ]);
      setBLEState(device, dbId);
      addLog('Auto-reconnected to sensor', 'ok');
    } catch {
      addLog('Sensor not in range — tap Reconnect to retry', 'warn');
    }
  };

  const getLocationAndAlert = (): Promise<{
    gps_latitude?: number;
    gps_longitude?: number;
    location_available: boolean;
  }> => {
    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        pos => {
          resolve({
            gps_latitude: pos.coords.latitude,
            gps_longitude: pos.coords.longitude,
            location_available: true,
          });
        },
        () => resolve({ location_available: false }),
        { timeout: 3000, maximumAge: 10000 },
      );
    });
  };

  const dispatchAlert = async (isManual = false) => {
    if (alertInProgress.current) return;
    if (!resolvedSensorDbId || !contactId) {
      if (isManual) {
        Alert.alert(
          'Not ready',
          'Make sure your sensor is paired and you have at least one emergency contact.',
        );
      }
      return;
    }

    alertInProgress.current = true;
    addLog('Fetching GPS location…', 'info');

    try {
      const locationPayload = await getLocationAndAlert();
      if (locationPayload.location_available) {
        addLog(
          `GPS: ${locationPayload.gps_latitude?.toFixed(5)}, ${locationPayload.gps_longitude?.toFixed(5)}`,
          'ok',
        );
      } else {
        addLog('GPS unavailable — sending without location', 'warn');
      }

      addLog('Sending alert…', 'info');

      // Vibrate on alert: long buzz, pause, long buzz
      Vibration.vibrate([0, 500, 200, 500]);

      const res = await sendAlert({
        sensor_id: resolvedSensorDbId,
        contact_id: contactId,
        ...locationPayload,
      });

      addLog('Alert sent successfully', 'ok');
      const alertId = res.data?.alert_id;
      navigation.navigate('AlertSent', { alertId });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to send alert. Try again.';
      addLog(`Alert failed: ${msg}`, 'error');
      Alert.alert('Error', msg);
    } finally {
      alertInProgress.current = false;
    }
  };

  const handleAutoAlert = () => {
    Alert.alert('Tap pattern detected', 'Sending emergency alert…', [{ text: 'OK' }], {
      cancelable: false,
    });
    dispatchAlert();
  };

  const handleUnpair = () => {
    Alert.alert(
      'Unpair sensor',
      'This will remove your sensor from your account. You can pair again later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpair',
          style: 'destructive',
          onPress: async () => {
            try {
              await unpairSensor();
              clearBLEState();
              setSensorPaired(false);
              setResolvedSensorDbId(null);
              setBleConnected(false);
              addLog('Sensor unpaired', 'warn');
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.error || 'Failed to unpair sensor.');
            }
          },
        },
      ],
    );
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
      // Best-effort
    }
    clearBLEState();
    await clearAuth();
  };

  const bleStatusText = () => {
    if (!sensorPaired) return 'No sensor paired';
    if (bleConnected) return 'Paired & connected';
    return 'Paired — not connected';
  };

  const dotStyle = bleConnected
    ? styles.dotGreen
    : sensorPaired
    ? styles.dotYellow
    : styles.dotRed;

  const logColor: Record<LogLevel, string> = {
    info: '#9ca3af',
    ok: '#22c55e',
    warn: '#eab308',
    error: '#ef4444',
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>SoleSignal</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      {/* Status card */}
      <View style={styles.statusCard}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, dotStyle]} />
          <Text style={styles.statusValue}>{bleStatusText()}</Text>
        </View>

        <View style={styles.statusActions}>
          {!sensorPaired && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('Pairing')}>
              <Text style={styles.actionButtonText}>Pair sensor</Text>
            </TouchableOpacity>
          )}
          {sensorPaired && !bleConnected && (
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('Pairing')}>
              <Text style={styles.actionButtonText}>Reconnect</Text>
            </TouchableOpacity>
          )}
          {sensorPaired && (
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonDestructive]}
              onPress={handleUnpair}>
              <Text style={styles.actionButtonDestructiveText}>Unpair</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => navigation.navigate('Contacts')}>
            <Text style={styles.actionButtonText}>Contacts</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Event log */}
      <View style={styles.logCard}>
        <Text style={styles.logTitle}>EVENT LOG</Text>
        <FlatList
          ref={logListRef}
          data={logs}
          keyExtractor={item => String(item.id)}
          renderItem={({ item }) => (
            <Text style={[styles.logEntry, { color: logColor[item.level as LogLevel] }]}>
              <Text style={styles.logTs}>{item.ts} </Text>
              {item.msg}
            </Text>
          )}
          ListEmptyComponent={
            <Text style={styles.logEmpty}>Waiting for events…</Text>
          }
          style={styles.logList}
          onContentSizeChange={() =>
            logListRef.current?.scrollToEnd({ animated: true })
          }
        />
      </View>

      {/* Alert button */}
      <TouchableOpacity
        style={styles.alertButton}
        onPress={() => dispatchAlert(true)}>
        <Text style={styles.alertButtonText}>SEND ALERT</Text>
      </TouchableOpacity>
      <Text style={styles.alertHint}>
        Also triggered automatically by your sensor tap pattern.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.heading,
    color: Colors.scarlet,
    fontSize: 26,
  },
  logoutText: {
    color: Colors.midGray,
    fontSize: 14,
  },

  // Status card
  statusCard: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: Spacing.sm,
  },
  dotGreen: { backgroundColor: '#22c55e' },
  dotYellow: { backgroundColor: '#eab308' },
  dotRed: { backgroundColor: '#ef4444' },
  statusValue: {
    ...Typography.subheading,
    fontSize: 15,
  },
  statusActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    borderWidth: 1,
    borderColor: Colors.scarlet,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    color: Colors.scarlet,
    fontSize: 13,
    fontWeight: '600',
  },
  actionButtonDestructive: {
    borderColor: '#ef4444',
  },
  actionButtonDestructiveText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
  },

  // Event log
  logCard: {
    flex: 1,
    backgroundColor: '#0d0d0d',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  logTitle: {
    fontSize: 10,
    letterSpacing: 2,
    color: '#4b5563',
    marginBottom: Spacing.sm,
    fontWeight: '600',
  },
  logList: { flex: 1 },
  logEntry: {
    fontFamily: 'Menlo',
    fontSize: 11,
    lineHeight: 18,
  },
  logTs: {
    color: '#374151',
  },
  logEmpty: {
    color: '#374151',
    fontFamily: 'Menlo',
    fontSize: 11,
  },

  // Alert button
  alertButton: {
    backgroundColor: Colors.scarlet,
    borderRadius: 12,
    padding: Spacing.xl,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  alertButtonText: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
  },
  alertHint: {
    textAlign: 'center',
    color: Colors.midGray,
    fontSize: 12,
    marginBottom: Spacing.sm,
  },
});
