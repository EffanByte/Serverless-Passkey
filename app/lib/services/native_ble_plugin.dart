import 'package:flutter/services.dart';

class NativeBlePlugin {
  static const MethodChannel _channel = MethodChannel('native_ble_plugin');

  static Future<void> startAdvertising() =>
      _channel.invokeMethod('startAdvertising');

  static Future<void> stopAdvertising() =>
      _channel.invokeMethod('stopAdvertising');

  /// Sends the Base64-encoded signature back to the phone plugin.
  static Future<void> sendSignature(String signatureB64) =>
      _channel.invokeMethod('sendSignature', signatureB64);
}
