// services/ble.ts — Bluetooth Low Energy (BLE) service layer.
//
// Wraps react-native-ble-plx's BleManager in a clean class interface.
// All BLE operations flow through this singleton (`bleService`), exported at the bottom.
//
// BLE protocol overview:
//   - The SoleSignal sensor advertises a custom GATT service (SOLE_SIGNAL_SERVICE_UUID)
//   - It has one characteristic (TAP_PATTERN_CHARACTERISTIC_UUID) that sends notifications
//   - When the user taps a specific pattern on the shoe insert, the firmware writes "1"
//     to this characteristic, which fires a notification to the phone
//   - The phone decodes the base64-encoded value and triggers an alert if the value is "1"
//
// UUIDs are agreed upon with the firmware team and must match exactly.

import { BleManager, Device, State } from 'react-native-ble-plx';

// atob is available in React Native (Hermes engine) but TypeScript's lib doesn't declare it.
// This declaration tells TypeScript the global exists at runtime.
declare function atob(encodedData: string): string;
import { Platform, PermissionsAndroid } from 'react-native';

// BLE service UUID that the SoleSignal firmware advertises.
// The scanner filters by this UUID so only SoleSignal devices appear during pairing.
export const SOLE_SIGNAL_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';

// Characteristic UUID for the tap pattern notification.
// The firmware writes "1" to this characteristic when the activation gesture is detected.
export const TAP_PATTERN_CHARACTERISTIC_UUID =
  '99999999-8888-7777-6666-555555555555';

class BLEService {
  // BleManager is the react-native-ble-plx entry point.
  // It manages the native Bluetooth radio and all device connections.
  private manager: BleManager;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * requestPermissions — Request Bluetooth and location permissions at runtime.
   *
   * iOS: permissions are declared in Info.plist (NSBluetoothAlwaysUsageDescription etc.)
   *   and the OS prompts automatically — no runtime request needed.
   * Android: Bluetooth permissions (SCAN, CONNECT) and ACCESS_FINE_LOCATION must be
   *   requested explicitly on Android 12+. Returns false if any are denied.
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true; // iOS handles permissions via Info.plist, not at runtime
    }
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,    // needed to scan for devices
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT, // needed to connect
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // required by BLE scan on Android
    ]);
    // All permissions must be granted — if any are denied, BLE will not work
    return Object.values(result).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  /**
   * waitForBluetooth — Returns a promise that resolves when the Bluetooth radio is on.
   *
   * Uses BleManager's state change listener. If BT is already on when called,
   * the listener fires immediately (because `true` is passed as the second arg to onStateChange).
   * The auto-reconnect flow races this against a 3-second timeout to avoid hanging.
   */
  waitForBluetooth(): Promise<void> {
    return new Promise(resolve => {
      // `true` as the second argument means: emit the current state immediately
      const sub = this.manager.onStateChange(state => {
        if (state === State.PoweredOn) {
          sub.remove(); // unsubscribe once we know BT is on
          resolve();
        }
      }, true);
    });
  }

  /**
   * startScan — Begin scanning for SoleSignal BLE devices.
   *
   * Filters by SOLE_SIGNAL_SERVICE_UUID so only relevant devices appear.
   * Calls `onDevice` for each device found during the scan window.
   * Automatically stops scanning after `timeoutMs` (default 10 seconds).
   * Returns a cleanup function — call it to cancel the scan early (e.g., on unmount).
   *
   * Note: scanning is battery-intensive. Always stop scanning after connecting.
   */
  startScan(
    onDevice: (device: Device) => void,
    timeoutMs = 10000,
  ): () => void {
    // Try scanning for our specific service UUID first.
    // Falls back to scanning all devices — only named devices are passed
    // to onDevice so the list isn't flooded with anonymous peripherals.
    this.manager.startDeviceScan(
      [SOLE_SIGNAL_SERVICE_UUID], // only return devices advertising this service
      null,
      (_error, device) => {
        if (device) {
          onDevice(device); // pass each discovered device to the caller
        }
      },
    );

    // Auto-stop after the timeout to conserve battery
    const timer = setTimeout(() => this.stopScan(), timeoutMs);

    // Return a cancel function the caller can invoke to stop early
    return () => {
      clearTimeout(timer);
      this.stopScan();
    };
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  /**
   * connect — Connect to a device by its BLE hardware ID and discover its services.
   *
   * `deviceId` is the platform-specific BLE hardware UUID (iOS) or MAC address (Android).
   * After connecting, `discoverAllServicesAndCharacteristics` must be called before
   * monitoring or reading characteristics — BLE requires service discovery first.
   *
   * Returns the connected Device object (needed for monitoring and disconnecting).
   */
  async connect(deviceId: string): Promise<Device> {
    const device = await this.manager.connectToDevice(deviceId);
    // Service discovery is required before interacting with characteristics
    await device.discoverAllServicesAndCharacteristics();
    return device;
  }

  /**
   * disconnect — Terminate the BLE connection to a device.
   */
  async disconnect(deviceId: string): Promise<void> {
    await this.manager.cancelDeviceConnection(deviceId);
  }

  /**
   * monitorTapPattern — Subscribe to notifications from the tap pattern characteristic.
   *
   * The firmware writes "1" when the activation gesture is detected.
   * react-native-ble-plx delivers characteristic values as base64-encoded strings,
   * so we decode with atob() before comparing.
   *
   * `onTapPattern` — called only when decoded value === "1" (the trigger gesture)
   * `onData`       — called on every notification (for the event log in HomeScreen)
   *
   * Returns an unsubscribe function — call it on screen unmount or disconnect.
   */
  monitorTapPattern(
    device: Device,
    onTapPattern: () => void,
    onData?: (value: string) => void,
  ): () => void {
    const sub = device.monitorCharacteristicForService(
      SOLE_SIGNAL_SERVICE_UUID,
      TAP_PATTERN_CHARACTERISTIC_UUID,
      (error, characteristic) => {
        if (error) {
          // Errors here are typically from BLE disconnect — not re-thrown
          // because the disconnection handler in HomeScreen cleans up state
          return;
        }
        if (characteristic?.value) {
          // BLE characteristic values are always base64-encoded in react-native-ble-plx
          const decoded = atob(characteristic.value).trim();
          onData?.(decoded); // log every raw notification for the event log UI
          if (decoded === '1') {
            onTapPattern(); // activation gesture detected — trigger the alert flow
          }
        }
      },
    );

    // Return an unsubscribe function — stored in HomeScreen's unmonitorRef
    return () => sub.remove();
  }

  /**
   * destroy — Clean up the native BLE manager.
   * Should be called when the app is shutting down (not typically needed in RN apps).
   */
  destroy() {
    this.manager.destroy();
  }
}

// Singleton instance — imported by screens and contexts.
// Using a single instance ensures there is only ever one native BleManager,
// which avoids duplicate scan sessions or double-connection issues.
export const bleService = new BLEService();
