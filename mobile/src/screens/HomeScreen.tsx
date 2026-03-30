import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Geolocation from '@react-native-community/geolocation';
import { useAuth } from '../context/AuthContext';
import { useBLE } from '../context/BLEContext';
import { sendAlert, getContacts, getMySensor, logoutUser } from '../services/api';
import { bleService } from '../services/ble';
import { Colors, Spacing, Typography } from '../theme';
import { RootStackParamList } from '../../App';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const { clearAuth } = useAuth();
  const { connectedDevice, sensorDbId, clearBLEState, unmonitorRef } = useBLE();

  const [sensorPaired, setSensorPaired] = useState(false);
  const [bleConnected, setBleConnected] = useState(false);
  const [contactId, setContactId] = useState<number | null>(null);
  // Resolved sensor DB id: prefer context (set during this session's pairing),
  // fall back to what we fetch from the server on mount.
  const [resolvedSensorDbId, setResolvedSensorDbId] = useState<number | null>(null);
  const alertInProgress = useRef(false);

  // Reload contacts and sensor status whenever screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, []),
  );

  // Wire up BLE tap monitoring whenever we have a connected device
  useEffect(() => {
    if (!connectedDevice) {
      setBleConnected(false);
      return;
    }

    setBleConnected(true);

    // Clean up any existing monitor before starting a new one
    if (unmonitorRef.current) {
      unmonitorRef.current();
    }

    unmonitorRef.current = bleService.monitorTapPattern(
      connectedDevice,
      () => {
        // Guard against double-firing
        if (!alertInProgress.current) {
          handleAutoAlert();
        }
      },
    );

    return () => {
      if (unmonitorRef.current) {
        unmonitorRef.current();
        unmonitorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedDevice]);

  const loadStatus = async () => {
    try {
      const contactsRes = await getContacts();
      const contacts = contactsRes.data?.contacts || [];
      if (contacts.length > 0) {
        setContactId(contacts[0].id);
      }
    } catch {
      // No contacts yet
    }

    // Use sensor DB id from BLE context if available (set during pairing this session).
    // Otherwise, fetch it from /sensors/me so the app works after a restart.
    if (sensorDbId) {
      setResolvedSensorDbId(sensorDbId);
      setSensorPaired(true);
    } else {
      try {
        const res = await getMySensor();
        if (res.data?.is_paired) {
          setSensorPaired(true);
          setResolvedSensorDbId(res.data.id);
        }
      } catch {
        // No sensor paired yet
      }
    }
  };

  /**
   * Get a one-shot GPS fix (max 3 s), then fire the alert.
   * Falls back to location_available=false if GPS is unavailable or times out.
   */
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
    try {
      const locationPayload = await getLocationAndAlert();
      const res = await sendAlert({
        sensor_id: resolvedSensorDbId,
        contact_id: contactId,
        ...locationPayload,
      });
      const alertId = res.data?.alert_id;
      navigation.navigate('AlertSent', { alertId });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to send alert. Try again.';
      Alert.alert('Error', msg);
    } finally {
      alertInProgress.current = false;
    }
  };

  // Called automatically when the sensor tap pattern is detected over BLE
  const handleAutoAlert = () => {
    Alert.alert(
      'Tap pattern detected',
      'Sending emergency alert…',
      [{ text: 'OK' }],
      { cancelable: false },
    );
    dispatchAlert();
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
    return 'Paired — sensor not in range';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SoleSignal</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Log out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Sensor status</Text>
        <View
          style={[
            styles.statusDot,
            bleConnected
              ? styles.dotGreen
              : sensorPaired
              ? styles.dotYellow
              : styles.dotRed,
          ]}
        />
        <Text style={styles.statusValue}>{bleStatusText()}</Text>
      </View>

      {!sensorPaired && (
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate('Pairing')}>
          <Text style={styles.secondaryButtonText}>Pair sensor</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => navigation.navigate('Contacts')}>
        <Text style={styles.secondaryButtonText}>Manage contacts</Text>
      </TouchableOpacity>

      <View style={styles.spacer} />

      <TouchableOpacity style={styles.alertButton} onPress={() => dispatchAlert(true)}>
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
    marginBottom: Spacing.xl,
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
  statusCard: {
    backgroundColor: Colors.lightGray,
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    alignItems: 'center',
  },
  statusLabel: {
    ...Typography.label,
    marginBottom: Spacing.sm,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginBottom: Spacing.sm,
  },
  dotGreen: { backgroundColor: Colors.successGreen },
  dotYellow: { backgroundColor: '#F9A825' },
  dotRed: { backgroundColor: Colors.errorRed },
  statusValue: {
    ...Typography.subheading,
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.scarlet,
    borderRadius: 8,
    padding: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  secondaryButtonText: {
    color: Colors.scarlet,
    fontSize: 16,
    fontWeight: '600',
  },
  spacer: { flex: 1 },
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
    marginBottom: Spacing.lg,
  },
});
