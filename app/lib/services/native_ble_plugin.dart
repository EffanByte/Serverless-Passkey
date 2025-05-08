import 'package:flutter/services.dart';

class NativeBlePlugin {
  static const MethodChannel _ch = MethodChannel('native_ble_plugin');

  static Future<void> startAdvertising() =>
      _ch.invokeMethod('startAdvertising');
  static Future<void> stopAdvertising() => _ch.invokeMethod('stopAdvertising');
  static Future<void> sendSignature(String b64) =>
      _ch.invokeMethod('sendSignature', b64);

  /// Ask Android to update its advertise payload
  static Future<void> updatePublicKey(String uncompressedB64) =>
      _ch.invokeMethod('updatePublicKey', uncompressedB64);

  /// NEW: Flutter → Native calls to retrieve stored X / Y
  static Future<String?> getPublicKeyX() async {
    final x = await _ch.invokeMethod<String>('getPublicKeyX');
    return x;
  }

  static Future<String?> getPublicKeyY() async {
    final y = await _ch.invokeMethod<String>('getPublicKeyY');
    return y;
  }
}
