// screens/HomeScreen.tsx — Main screen shown to authenticated users.
//
// Responsibilities:
//   - Show sensor pairing/connection status
//   - Auto-reconnect to the previously paired sensor on app load (once per session)
//   - Monitor BLE tap pattern characteristic — trigger alert on firmware "1" signal
//   - Allow manual alert trigger via the SEND ALERT button
//   - Show a real-time event log of BLE and alert events
//   - Provide navigation to Pairing, Contacts, and logout
//
// State overview:
//   sensorPaired        — whether the user has a sensor record in the DB (from GET /sensors/me)
//   bleConnected        — whether there is an active BLE connection (Device in BLEContext)
//   contactId           — DB primary key of the first emergency contact (used for alerts)
//   resolvedSensorDbId  — the sensor's DB primary key (used for POST /alerts sensor_id field)
//
// The distinction between sensorPaired and bleConnected matters:
//   - sensorPaired=true but bleConnected=false: sensor is in DB but phone isn't BLE-connected
//   - sensorPaired=true and bleConnected=true: fully operational, ready to detect taps
//
// Alert dispatch flow:
//   1. alertInProgress ref prevents duplicate concurrent alerts
//   2. GPS is requested (3-second timeout — proceeds without location if denied/unavailable)
//   3. POST /alerts called with sensor DB id, contact DB id, and GPS data
//   4. Phone vibrates as haptic confirmation
//   5. Navigate to AlertSentScreen with the returned alert_id
//
// Auto-reconnect (on focus):
//   If the sensor is paired in DB but not currently BLE-connected, reconnectSilently() is
//   called once per app session (guarded by reconnectAttempted ref). It races against a
//   5-second timeout so the app doesn't hang if the sensor isn't nearby.

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

// LogLevel controls the color of each event log entry
type LogLevel = 'info' | 'ok' | 'warn' | 'error';
type LogEntry = { id: number; ts: string; msg: string; level: LogLevel };

// Module-level counter for unique log entry IDs (survives re-renders without state overhead)
let logCounter = 0;

export default function HomeScreen({ navigation }: Props) {
  const { clearAuth } = useAuth();
  // BLEContext provides: the live Device object, its DB id, and state setters
  const { connectedDevice, sensorDbId, setBLEState, clearBLEState, unmonitorRef } = useBLE();

  const [sensorPaired, setSensorPaired] = useState(false);   // sensor record exists in DB
  const [bleConnected, setBleConnected] = useState(false);    // BLE connection is active
  const [contactId, setContactId] = useState<number | null>(null);           // first contact's DB id
  const [resolvedSensorDbId, setResolvedSensorDbId] = useState<number | null>(null); // sensor DB id
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // alertInProgress prevents duplicate alerts if the tap fires twice rapidly
  const alertInProgress = useRef(false);
  const logListRef = useRef<FlatList>(null);
  // reconnectAttempted ensures auto-reconnect only runs once per app session (not on every focus)
  const reconnectAttempted = useRef(false);

  // Countdown state for the 10-second cancel window shown before every alert dispatch
  const [alertCountdown, setAlertCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingAlertManualRef = useRef(false);
  // dispatchAlertRef always points to the latest dispatchAlert — avoids stale closure in setInterval
  const dispatchAlertRef = useRef<(isManual?: boolean) => void>(() => {});

  // addLog — appends a timestamped entry to the event log.
  // Keeps the last 100 entries (slice(-99) + new entry = 100 max).
  // Auto-scrolls the list to the bottom after each entry.
  const addLog = useCallback((msg: string, level: LogLevel = 'info') => {
    const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [
      ...prev.slice(-99), // cap at 100 entries
      { id: logCounter++, ts, msg, level },
    ]);
    setTimeout(() => logListRef.current?.scrollToEnd({ animated: true }), 50);
  }, []);

  // Reload contacts and sensor status each time the screen comes into focus.
  // useFocusEffect (not useEffect) is used so this runs when navigating back to Home.
  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, []),
  );

  // Wire up BLE tap monitoring whenever connectedDevice changes.
  // This effect runs each time a new device connects or the current device disconnects.
  // It sets up the characteristic monitor and a disconnect listener.
  useEffect(() => {
    if (!connectedDevice) {
      // Device was cleared (disconnected or unpaired) — update UI state
      if (bleConnected) {
        setBleConnected(false);
        addLog('Sensor disconnected', 'warn');
      }
      return;
    }

    setBleConnected(true);
    addLog(`Sensor connected: ${connectedDevice.name || connectedDevice.id}`, 'ok');

    // Cancel any existing monitor subscription before starting a new one
    // (prevents duplicate listeners if the device reference changes)
    if (unmonitorRef.current) {
      unmonitorRef.current();
    }

    // Subscribe to tap pattern notifications from the firmware.
    // onTapPattern fires when decoded value === "1" — triggers the alert flow.
    // onData fires on every notification and logs the raw value for debugging.
    unmonitorRef.current = bleService.monitorTapPattern(
      connectedDevice,
      () => {
        if (!alertInProgress.current) {
          addLog('Tap pattern detected — starting alert countdown', 'warn');
          startAlertCountdown(false);
        }
      },
      (value) => {
        addLog(`BLE data received: "${value}"`, 'info');
      },
    );

    // Listen for unexpected disconnection (e.g. sensor went out of range).
    // onDisconnected fires from the native BLE layer — we clear state in response.
    const disconnectSub = connectedDevice.onDisconnected(() => {
      clearBLEState();
      setBleConnected(false);
      addLog('Sensor disconnected unexpectedly', 'warn');
    });

    // Cleanup on effect re-run or unmount — cancel monitoring and disconnect listener
    return () => {
      if (unmonitorRef.current) {
        unmonitorRef.current();
        unmonitorRef.current = null;
      }
      disconnectSub.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedDevice]); // only re-run when the connected device changes

  // loadStatus — fetches contacts and sensor state from the backend.
  // Called on each screen focus via useFocusEffect.
  const loadStatus = async () => {
    // Step 1: load contacts to get the first contact's ID for alert dispatch
    try {
      const contactsRes = await getContacts();
      const contacts = contactsRes.data?.contacts || [];
      if (contacts.length > 0) {
        setContactId(contacts[0].id); // always alerts to the first contact (MVP behavior)
      } else {
        setContactId(null);
      }
    } catch {
      // No contacts yet — alert button will show "Not ready"
    }

    // Step 2: determine sensor status
    if (sensorDbId) {
      // BLEContext already has a DB id — sensor was paired this session, skip API call
      setResolvedSensorDbId(sensorDbId);
      setSensorPaired(true);
    } else {
      // No sensor in context — query the DB to see if this user has a paired sensor
      try {
        const res = await getMySensor();
        if (res.data?.is_paired) {
          setSensorPaired(true);
          setResolvedSensorDbId(res.data.id);    // DB primary key for alert creation
          // Attempt auto-reconnect if not already connected and not yet tried this session
          if (!connectedDevice && !reconnectAttempted.current) {
            reconnectAttempted.current = true;
            // `sensor_id` is the BLE hardware UUID — used by bleService.connect()
            reconnectSilently(res.data.sensor_id, res.data.id);
          }
        } else {
          setSensorPaired(false);
          setResolvedSensorDbId(null);
        }
      } catch {
        // GET /sensors/me returned 404 — no sensor paired for this user
        setSensorPaired(false);
        setResolvedSensorDbId(null);
      }
    }
  };

  // reconnectSilently — attempts to BLE-connect to the previously paired sensor on app load.
  // Runs once per session (guarded by reconnectAttempted ref in loadStatus).
  // Uses Promise.race to enforce timeouts — if BT isn't on in 3s or device doesn't connect
  // in 5s, it gives up silently and logs a message instead of leaving the user hanging.
  const reconnectSilently = async (bleDeviceId: string, dbId: number) => {
    addLog('Auto-reconnect: looking for paired sensor…', 'info');
    try {
      await bleService.requestPermissions();
      // Race BT power-on check against a 3-second timeout
      await Promise.race([
        bleService.waitForBluetooth(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('BT timeout')), 3000),
        ),
      ]);
      // Race BLE connect against a 5-second timeout
      const device = await Promise.race([
        bleService.connect(bleDeviceId), // bleDeviceId is the BLE hardware UUID
        new Promise<Device>((_, reject) =>
          setTimeout(() => reject(new Error('connect timeout')), 5000),
        ),
      ]);
      // Connection succeeded — store in context so the monitoring effect fires
      setBLEState(device, dbId);
      addLog('Auto-reconnected to sensor', 'ok');
    } catch {
      // Sensor not nearby or BT off — user can manually reconnect via the Pairing screen
      addLog('Sensor not in range — tap Reconnect to retry', 'warn');
    }
  };

  // getLocationAndAlert — wraps the Geolocation API in a Promise.
  // Resolves with GPS coordinates if available, or { location_available: false } if denied/timed out.
  // 3-second timeout prevents the alert from being held up by a slow GPS fix.
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
        () => resolve({ location_available: false }), // GPS failed/denied — still send alert
        { timeout: 3000, maximumAge: 10000 },
      );
    });
  };

  // dispatchAlert — the core alert-sending function.
  // Called by both the manual button (isManual=true) and the BLE tap handler (isManual=false).
  // alertInProgress ref prevents concurrent dispatches (e.g. double-tap or button + sensor).
  const dispatchAlert = async (isManual = false) => {
    if (alertInProgress.current) return; // prevent duplicate concurrent alerts
    if (!resolvedSensorDbId || !contactId) {
      const reason = 'Make sure your sensor is paired and you have at least one emergency contact.';
      addLog(`Alert failed: sensor or contact not ready`, 'error');
      Alert.alert('Not ready', reason);
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

      // Haptic feedback: two long vibration pulses (pattern: [delay, on, off, on] in ms)
      Vibration.vibrate([0, 500, 200, 500]);

      // POST /alerts — sensor_id is the DB primary key, not the BLE hardware UUID
      const res = await sendAlert({
        sensor_id: resolvedSensorDbId,
        contact_id: contactId,
        ...locationPayload, // spreads gps_latitude, gps_longitude, location_available
      });

      addLog('Alert sent successfully', 'ok');
      const alertId = res.data?.alert_id;
      // Navigate to confirmation screen — back navigation is disabled on AlertSentScreen
      navigation.navigate('AlertSent', { alertId });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error || 'Failed to send alert. Try again.';
      addLog(`Alert failed: ${msg}`, 'error');
      Alert.alert('Error', msg);
    } finally {
      alertInProgress.current = false; // allow future alerts once this one completes
    }
  };

  // Keep dispatchAlertRef pointing to the latest dispatchAlert on every render
  // so the setInterval callback always calls the up-to-date version.
  useEffect(() => {
    dispatchAlertRef.current = dispatchAlert;
  });

  // startAlertCountdown — begins the 10-second cancel window before dispatching an alert.
  // Used for both BLE tap triggers and the manual SEND ALERT button.
  const startAlertCountdown = useCallback((isManual: boolean) => {
    if (alertCountdown !== null) return; // already counting down
    pendingAlertManualRef.current = isManual;
    setAlertCountdown(10);
    let count = 10;
    countdownTimerRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(countdownTimerRef.current!);
        countdownTimerRef.current = null;
        setAlertCountdown(null);
        dispatchAlertRef.current(pendingAlertManualRef.current); // use ref — never stale
      } else {
        setAlertCountdown(count);
      }
    }, 1000);
  }, [alertCountdown]);

  // cancelCountdown — cancels the pending alert before it dispatches.
  const cancelCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setAlertCountdown(null);
    addLog('Alert cancelled', 'warn');
  }, [addLog]);

  // handleUnpair — confirmation dialog before calling DELETE /sensors/me.
  // Clears BLEContext state and resets paired/connected UI indicators.
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
              await unpairSensor(); // DELETE /sensors/me — cascade-deletes alert records too
              if (connectedDevice) {
                try { await bleService.disconnect(connectedDevice.id); } catch {}
              }
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

  // handleLogout — best-effort server logout, then clears local auth state.
  // The server logout (POST /users/logout) just confirms the token is valid — it doesn't
  // actually invalidate anything. The real logout is Keychain.resetGenericPassword() in clearAuth().
  const handleLogout = async () => {
    try {
      await logoutUser(); // best-effort — if the token is already expired, this 401s
    } catch {
      // Ignore logout API errors — we always clear local state regardless
    }
    clearBLEState(); // stop monitoring + clear connection state
    await clearAuth(); // clear Keychain + React auth state → App.tsx navigates to LoginScreen
  };

  // bleStatusText — returns a human-readable status string for the status card
  const bleStatusText = () => {
    if (!sensorPaired) return 'No sensor paired';
    if (bleConnected) return 'Paired & connected';
    return 'Paired — not connected';
  };

  // Color-coded status dot: green = connected, yellow = paired but not connected, red = no sensor
  const dotStyle = bleConnected
    ? styles.dotGreen
    : sensorPaired
    ? styles.dotYellow
    : styles.dotRed;

  // Map log levels to display colors for the event log terminal UI
  const logColor: Record<LogLevel, string> = {
    info: '#9ca3af',  // gray — routine events
    ok: '#22c55e',    // green — success
    warn: '#eab308',  // yellow — non-fatal warnings
    error: '#ef4444', // red — failures
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

      {/* Countdown cancel overlay — shown for 10 seconds after alert is triggered */}
      {alertCountdown !== null && (
        <View style={styles.countdownOverlay}>
          <Text style={styles.countdownLabel}>ALERT SENDING IN</Text>
          <Text style={styles.countdownNumber}>{alertCountdown}</Text>
          <TouchableOpacity style={styles.cancelAlertButton} onPress={cancelCountdown}>
            <Text style={styles.cancelAlertText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Alert button */}
      <TouchableOpacity
        style={styles.alertButton}
        onPress={() => startAlertCountdown(true)}>
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

  // Countdown overlay
  countdownOverlay: {
    position: 'absolute',
    bottom: 120,
    left: Spacing.lg,
    right: Spacing.lg,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: Spacing.lg,
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  countdownLabel: {
    color: '#9ca3af',
    fontSize: 11,
    letterSpacing: 2,
    fontWeight: '600',
    marginBottom: 4,
  },
  countdownNumber: {
    color: Colors.white,
    fontSize: 56,
    fontWeight: '700',
    lineHeight: 64,
  },
  cancelAlertButton: {
    marginTop: Spacing.md,
    borderWidth: 2,
    borderColor: '#ef4444',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 40,
  },
  cancelAlertText: {
    color: '#ef4444',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
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
