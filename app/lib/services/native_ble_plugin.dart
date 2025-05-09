// lib/services/native_ble_plugin.dart

import 'package:flutter/services.dart';

class NativeBlePlugin {
  // This must exactly match the channel name in MainActivity.kt
  static const MethodChannel _channel = MethodChannel('native_ble_plugin');

  /// Exposes the channel so you can set a handler in BroadcastingScreen
  static MethodChannel get channel => _channel;

  /// Called from Dart to start the BLE server
  static Future<void> startAdvertising() async {
    await _channel.invokeMethod('startAdvertising');
  }

  /// Called from Dart to stop it
  static Future<void> stopAdvertising() async {
    await _channel.invokeMethod('stopAdvertising');
  }

  /// Sends your Base64 signature string back to MainActivity.kt
  static Future<void> sendSignature(String b64) async {
    await _channel.invokeMethod('sendSignature', b64);
  }

  /// Sends your public-key JSON string back to MainActivity.kt
  static Future<void> sendPublicKey(String json) async {
    await _channel.invokeMethod('sendPublicKey', json);
  }
}
