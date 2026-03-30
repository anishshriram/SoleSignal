import { BleManager, Device, State } from 'react-native-ble-plx';

// atob is available in React Native (Hermes) but not in TypeScript's lib by default
declare function atob(encodedData: string): string;
import { Platform, PermissionsAndroid } from 'react-native';

// SoleSignal sensor BLE service UUID (from firmware team)
export const SOLE_SIGNAL_SERVICE_UUID = '12345678-1234-1234-1234-1234567890ab';
// Status characteristic UUID (from firmware team)
export const TAP_PATTERN_CHARACTERISTIC_UUID =
  '99999999-8888-7777-6666-555555555555';

class BLEService {
  private manager: BleManager;

  constructor() {
    this.manager = new BleManager();
  }

  /**
   * Request Bluetooth permissions (Android only — iOS handles via Info.plist).
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      return true;
    }
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    ]);
    return Object.values(result).every(
      r => r === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  /**
   * Wait for Bluetooth to be powered on, then resolve.
   */
  waitForBluetooth(): Promise<void> {
    return new Promise(resolve => {
      const sub = this.manager.onStateChange(state => {
        if (state === State.PoweredOn) {
          sub.remove();
          resolve();
        }
      }, true);
    });
  }

  /**
   * Scan for SoleSignal devices. Calls onDevice for each discovered device.
   * Stops scanning after timeoutMs.
   */
  startScan(
    onDevice: (device: Device) => void,
    timeoutMs = 10000,
  ): () => void {
    // Try scanning for our specific service UUID first.
    // Falls back to scanning all devices — only named devices are passed
    // to onDevice so the list isn't flooded with anonymous peripherals.
    this.manager.startDeviceScan(
      [SOLE_SIGNAL_SERVICE_UUID],
      null,
      (_error, device) => {
        if (device) {
          onDevice(device);
        }
      },
    );

    const timer = setTimeout(() => this.stopScan(), timeoutMs);

    return () => {
      clearTimeout(timer);
      this.stopScan();
    };
  }

  stopScan() {
    this.manager.stopDeviceScan();
  }

  /**
   * Connect to a device and discover services + characteristics.
   */
  async connect(deviceId: string): Promise<Device> {
    const device = await this.manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();
    return device;
  }

  /**
   * Disconnect from a device.
   */
  async disconnect(deviceId: string): Promise<void> {
    await this.manager.cancelDeviceConnection(deviceId);
  }

  /**
   * Monitor the tap pattern characteristic.
   * Calls onTapPattern only when the firmware sends the value "1".
   * Calls onData on every notification (for the event log).
   * Returns an unsubscribe function.
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
          return;
        }
        if (characteristic?.value) {
          // Characteristic values are base64-encoded in react-native-ble-plx
          const decoded = atob(characteristic.value).trim();
          onData?.(decoded);
          if (decoded === '1') {
            onTapPattern();
          }
        }
      },
    );

    return () => sub.remove();
  }

  destroy() {
    this.manager.destroy();
  }
}

export const bleService = new BLEService();
