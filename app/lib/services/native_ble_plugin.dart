import 'package:flutter/services.dart';

class NativeBlePlugin {
  static const MethodChannel _channel = MethodChannel('native_ble_plugin');

  static Future<void> startAdvertising() async {
    await _channel.invokeMethod('startAdvertising');
  }

  static Future<void> stopAdvertising() async {
    await _channel.invokeMethod('stopAdvertising');
  }
}
