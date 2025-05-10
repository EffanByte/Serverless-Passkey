// app/lib/services/key_utils.dart

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:custom_post_quantum/custom_post_quantum.dart';

/// Helper to get 32 cryptographically-secure random bytes.
Uint8List _randomSeed() {
  final rnd = Random.secure();
  return Uint8List.fromList(List<int>.generate(32, (_) => rnd.nextInt(256)));
}

class KeyUtils {
  static const _kemSeedKey = 'kemSeed';   // (not used in broadcasting, but kept)
  static const _sigSeedKey = 'sigSeed';
  static final _storage    = FlutterSecureStorage();

  /// Generates two 32-byte seeds (one for Kyber, one for Dilithium) and stores them.
  static Future<void> generateAndStoreKeyPair() async {
    final kemSeed = _randomSeed();
    final sigSeed = _randomSeed();

    await _storage.write(key: _kemSeedKey, value: base64Encode(kemSeed));
    await _storage.write(key: _sigSeedKey, value: base64Encode(sigSeed));

    print('🔑 Seeds generated & stored');
  }

  /// Returns true if you’ve already generated & stored those seeds.
  static Future<bool> isKeyGenerated() =>
      _storage.containsKey(key: _kemSeedKey);

  /// **Returns the Dilithium-2 public key** (Base64) derived from its seed.
  /// This is what the Flutter side will broadcast under `"sigPub"`.
  static Future<String> getPublicKey() async {
    final sigSeedB64 = await _storage.read(key: _sigSeedKey);
    if (sigSeedB64 == null) {
      throw StateError(
          'No Dilithium seed found. Call generateAndStoreKeyPair() first.'
      );
    }
    final sigSeed = base64Decode(sigSeedB64);

    final dil = Dilithium.level2();
    final (pkObj, _) = dil.generateKeys(sigSeed);

    final rawPub = pkObj.serialize();
    final b64Pub = base64Encode(rawPub);

    print('🔑 Generated Dilithium public key: '
        '${rawPub.length} bytes → Base64 length ${b64Pub.length}');
    // Optionally print a short prefix for sanity:
    print('   pub key (base64) prefix: ${b64Pub.substring(0, 16)}…');

    return b64Pub;
  }

  /// Signs a 16-byte challenge using Dilithium-2 derived from its seed.
  /// Returns the raw signature bytes (to be chunked and sent over BLE).
  static Future<Uint8List> signChallenge(Uint8List challenge) async {
    print('📥 Received challenge to sign: ${challenge.length} bytes');
    final sigSeedB64 = await _storage.read(key: _sigSeedKey);
    if (sigSeedB64 == null) {
      throw StateError(
          'No Dilithium seed found. Call generateAndStoreKeyPair() first.'
      );
    }
    final sigSeed = base64Decode(sigSeedB64);

    final dil = Dilithium.level2();
    final (_, skObj) = dil.generateKeys(sigSeed);

    final sig = dil.sign(skObj, challenge);
    print('✍️ Generated signature: ${sig.length} bytes');

    // Optionally, show a short hex snippet:
    final snippet = sig.take(8).map((b) => b.toRadixString(16).padLeft(2,'0')).join();
    print('   signature prefix (hex): $snippet…');

    return sig;
  }
}
