// app/lib/services/native_ble_plugin.dart

import 'dart:typed_data';
import 'package:flutter/services.dart';

class NativeBlePlugin {
  // Must match the channel name in MainActivity.kt
  static const MethodChannel _channel = MethodChannel('native_ble_plugin');

  /// Exposes the channel so you can set handlers if needed
  static MethodChannel get channel => _channel;

  /// BLE Advertising control
  static Future<void> startAdvertising() async {
    await _channel.invokeMethod('startAdvertising');
  }
  static Future<void> stopAdvertising() async {
    await _channel.invokeMethod('stopAdvertising');
  }
  static Future<void> sendSignature(String b64) async {
    await _channel.invokeMethod('sendSignature', b64);
  }
  static Future<void> sendPublicKey(String json) async {
    await _channel.invokeMethod('sendPublicKey', json);
  }
  static Future<void> sendRawBytes(Uint8List chunk) async {
    await _channel.invokeMethod('sendRawBytes', chunk);
  }

  // ─── ML-DSA-44 via JNI ─────────────────────────────────────

  /// 1) generateKeypair
  /// Returns a map with 'publicKey' and 'secretKey' as Uint8List.
  static Future<Map<String, Uint8List>> generateKeypair() async {
    final result =
    await _channel.invokeMethod<Map<dynamic, dynamic>>('generateKeypair');
    return {
      'publicKey': result!['publicKey'] as Uint8List,
      'secretKey': result['secretKey'] as Uint8List,
    };
  }

  /// 2) sign
  static Future<Uint8List> sign({
    required Uint8List message,
    required Uint8List secretKey,
  }) async {
    final sig = await _channel.invokeMethod<Uint8List>(
      'sign',
      {
        'message': message,
        'secretKey': secretKey,
      },
    );
    return sig!;
  }

  /// 3) verify
  static Future<int> verify({
    required Uint8List signature,
    required Uint8List message,
    required Uint8List publicKey,
  }) async {
    final rc = await _channel.invokeMethod<int>(
      'verify',
      {
        'signature': signature,
        'message': message,
        'publicKey': publicKey,
      },
    );
    return rc!;
  }
}