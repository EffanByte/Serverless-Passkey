import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

Uint8List bigIntToBytes(BigInt number) {
  final byteMask = BigInt.from(0xff);
  final bytes = <int>[];
  BigInt n = number;

  while (n > BigInt.zero) {
    bytes.insert(0, (n & byteMask).toInt());
    n = n >> 8;
  }

  // Ensure at least one byte
  return Uint8List.fromList(bytes.isEmpty ? [0] : bytes);
}

class KeyUtils {
  static const _privateKeyKey = 'privateKeyPem';
  static const _publicKeyX = 'publicKeyX';
  static const _publicKeyY = 'publicKeyY';

  static final FlutterSecureStorage _secureStorage = FlutterSecureStorage();

  static Future<void> generateAndStoreKeyPair() async {
    final keyParams = ECKeyGeneratorParameters(ECCurve_prime256v1());
    final random = FortunaRandom();

    final seed = Uint8List.fromList(
      List.generate(32, (_) => DateTime.now().microsecond % 256),
    );
    random.seed(KeyParameter(seed));

    final generator =
        ECKeyGenerator()..init(ParametersWithRandom(keyParams, random));

    final keyPair = generator.generateKeyPair();

    final privKey = keyPair.privateKey as ECPrivateKey;
    final pubKey = keyPair.publicKey as ECPublicKey;

    // Encode values
    final privPem = base64Encode(bigIntToBytes(privKey.d!));
    final pubX = base64Encode(bigIntToBytes(pubKey.Q!.x!.toBigInteger()!));
    final pubY = base64Encode(bigIntToBytes(pubKey.Q!.y!.toBigInteger()!));

    // Store private key securely
    await _secureStorage.write(key: _privateKeyKey, value: privPem);

    // Store public key (can be exposed)
    await _secureStorage.write(key: _publicKeyX, value: pubX);
    await _secureStorage.write(key: _publicKeyY, value: pubY);
  }

  static Future<bool> isKeyGenerated() async {
    final exists = await _secureStorage.containsKey(key: _privateKeyKey);
    return exists;
  }

  static Future<String?> getPublicKeyX() async =>
      await _secureStorage.read(key: _publicKeyX);

  static Future<String?> getPublicKeyY() async =>
      await _secureStorage.read(key: _publicKeyY);

  static Future<String?> getPrivateKeyPem() async =>
      await _secureStorage.read(key: _privateKeyKey);
}
