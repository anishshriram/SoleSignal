"""
sensor_slides.py — SoleSignal → Google Slides controller

When the sensor sends "1", this script presses the RIGHT ARROW key
system-wide, advancing the slide in whatever window is focused
(Google Slides in presentation mode, PowerPoint, Keynote, etc.)

Setup (one time):
    pip install bleak pynput

Run:
    python sensor_slides.py

Then open Google Slides, enter presentation mode (Cmd+Shift+F or
click Present), and step on the insert to advance slides.

macOS note: Python may need Accessibility permission the first time.
  System Settings → Privacy & Security → Accessibility → add Terminal
"""

import asyncio
from bleak import BleakScanner, BleakClient
from pynput.keyboard import Controller, Key

SERVICE_UUID        = "12345678-1234-1234-1234-1234567890ab"
CHARACTERISTIC_UUID = "99999999-8888-7777-6666-555555555555"

keyboard = Controller()

def on_data(_sender, data: bytearray):
    value = data.decode("utf-8", errors="ignore").strip()
    print(f"  sensor → '{value}'", end="")
    if value == "1":
        keyboard.press(Key.right)
        keyboard.release(Key.right)
        print("  ✓ → next slide")
    else:
        print()

async def main():
    print("SoleSignal → Google Slides")
    print("─" * 40)
    print("Scanning for SoleSignal sensor…")

    device = await BleakScanner.find_device_by_filter(
        lambda d, adv: any(
            str(s).lower() == SERVICE_UUID.lower()
            for s in (adv.service_uuids or [])
        ),
        timeout=15.0,
    )

    if device is None:
        print("\nSensor not found. Make sure:")
        print("  • The insert is powered on")
        print("  • Your iPhone app is closed (BLE allows only one connection)")
        print("  • Bluetooth is on on this Mac")
        return

    print(f"Found: {device.name or device.address}")
    print("Connecting…")

    async with BleakClient(device) as client:
        print(f"Connected! Step on the insert to advance slides.\n")
        await client.start_notify(CHARACTERISTIC_UUID, on_data)
        # Keep running until Ctrl+C
        try:
            await asyncio.get_event_loop().create_future()
        except (asyncio.CancelledError, KeyboardInterrupt):
            print("\nDisconnected. Bye!")

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nStopped.")
