// app/lib/services/key_utils.dart

import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:app/services/native_ble_plugin.dart';

class KeyUtils {
  static const _publicKeyStorageKey = 'ml_dsa_public_key';
  static const _secretKeyStorageKey = 'ml_dsa_secret_key';
  static final FlutterSecureStorage _storage = FlutterSecureStorage();

  /// Generates a fresh ML-DSA-44 keypair via the native JNI bridge,
  /// and stores both public and secret keys (Base64) securely.
  static Future<void> generateAndStoreKeyPair() async {
    final keys = await NativeBlePlugin.generateKeypair();
    final pub = keys['publicKey']!;
    final sec = keys['secretKey']!;

    await _storage.write(
      key: _publicKeyStorageKey,
      value: base64Encode(pub),
    );
    await _storage.write(
      key: _secretKeyStorageKey,
      value: base64Encode(sec),
    );

    print('🔑 ML-DSA-44 keypair generated & stored');
  }

  /// Returns true if a keypair has already been generated and saved.
  static Future<bool> isKeyGenerated() async {
    final hasPub = await _storage.containsKey(key: _publicKeyStorageKey);
    final hasSec = await _storage.containsKey(key: _secretKeyStorageKey);
    return hasPub && hasSec;
  }

  /// Retrieves the stored ML-DSA-44 public key (Base64).
  static Future<String> getPublicKey() async {
    final b64Pub = await _storage.read(key: _publicKeyStorageKey);
    print('🔑 Flutter public key (Base64): $b64Pub');
    if (b64Pub == null) {
      throw StateError(
          'No ML-DSA-44 keypair found. Call generateAndStoreKeyPair() first.');
    }
    final pub = base64Decode(b64Pub);
    print('🔑 Retrieved ML-DSA-44 public key: ${pub.length} bytes');

    print('🔑 Flutter public key hex:\n' +
        pub.map((b) => b.toRadixString(16).padLeft(2, '0')).join(' '));

    // Print fingerprint in hex
    final fingerprint = pub.sublist(0, 8).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ');
    print('🔑 Flutter public key fingerprint: $fingerprint');

    return b64Pub;
  }

  /// Signs a 16-byte challenge using the stored ML-DSA-44 secret key.
  static Future<Uint8List> signChallenge(Uint8List challenge) async {
    final b64Sec = await _storage.read(key: _secretKeyStorageKey);
    if (b64Sec == null) {
      throw StateError(
          'No ML-DSA-44 keypair found. Call generateAndStoreKeyPair() first.');
    }
    final sec = base64Decode(b64Sec);

    // Log challenge details
    print('📥 Challenge to sign: ${challenge.toList()}');
    print('📏 Challenge length: ${challenge.length}');
    print('🧠 Secret key length: ${sec.length}');

    // Sign challenge via native JNI bridge
    final sig = await NativeBlePlugin.sign(
      message: challenge,
      secretKey: sec,
    );
    print('✍️ Generated ML-DSA-44 signature: ${sig.length} bytes');

    return sig;
  }

  /// Verifies a signature with the stored public key.
  static Future<bool> verifySignature({
    required Uint8List signature,
    required Uint8List message,
  }) async {
    final b64Pub = await _storage.read(key: _publicKeyStorageKey);
    if (b64Pub == null) {
      throw StateError(
          'No ML-DSA-44 keypair found. Call generateAndStoreKeyPair() first.');
    }
    final pub = base64Decode(b64Pub);

    final fingerprint = pub.sublist(0, 8).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ');
    print('🔑 Public key fingerprint (verify): $fingerprint');

    final rc = await NativeBlePlugin.verify(
      signature: signature,
      message: message,
      publicKey: pub,
    );
    return rc == 0;
  }
}
