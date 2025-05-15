import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

/// Converts a BigInt into a big-endian byte array.
Uint8List bigIntToBytes(BigInt number) {
  final byteMask = BigInt.from(0xff);
  final bytes = <int>[];
  BigInt n = number;
  while (n > BigInt.zero) {
    bytes.insert(0, (n & byteMask).toInt());
    n = n >> 8;
  }
  return Uint8List.fromList(bytes.isEmpty ? [0] : bytes);
}

/// Converts a big-endian byte array into a BigInt.
BigInt bytesToBigInt(Uint8List bytes) {
  BigInt result = BigInt.zero;
  for (final b in bytes) {
    result = (result << 8) | BigInt.from(b);
  }
  return result;
}

/// Encodes an [ECSignature] as 64-byte r∥s.
Uint8List _encodeSignature(ECSignature sig) {
  final rBytes = bigIntToBytes(sig.r);
  final sBytes = bigIntToBytes(sig.s);
  final out = Uint8List(64);
  final rPad = 32 - rBytes.length;
  final sPad = 32 - sBytes.length;
  for (var i = 0; i < rBytes.length; i++) {
    out[rPad + i] = rBytes[i];
  }
  for (var i = 0; i < sBytes.length; i++) {
    out[32 + sPad + i] = sBytes[i];
  }
  return out;
}

class KeyUtils {
  static const _privateKeyKey = 'privateKeyPem';
  static const _publicKeyX = 'publicKeyX';
  static const _publicKeyY = 'publicKeyY';

  static const _secureStorage = FlutterSecureStorage();

  static Future<void> deleteKeys() async {
    await _secureStorage.delete(key: _privateKeyKey);
    await _secureStorage.delete(key: _publicKeyX);
    await _secureStorage.delete(key: _publicKeyY);
  }
  /// Signs the given [challenge] (raw 16 bytes) with the stored P-256 private key,
  /// using deterministic ECDSA (RFC6979). Returns a 64-byte r∥s signature.
  /// Signs the given [challenge] with the stored P-256 EC private key,
  /// using SHA-256 and deterministic ECDSA (RFC6979). Returns a 64-byte signature.
  static Future<Uint8List> signChallenge(Uint8List challenge) async {
    // 1. Read and decode the private scalar (d)
    final privB64 = await _secureStorage.read(key: _privateKeyKey);
    if (privB64 == null) {
      throw StateError('No private key found.');
    }
    final dBytes = base64Decode(privB64);
    final d = bytesToBigInt(dBytes);

    // 2. Reconstruct the ECPrivateKey on curve P-256
    final domain = ECDomainParameters('prime256v1');
    final privateKey = ECPrivateKey(d, domain);

    // 3. Create a deterministic ECDSA signer that *internally* does SHA-256
    final signer = Signer('SHA-256/DET-ECDSA')
      ..init(true, PrivateKeyParameter<ECPrivateKey>(privateKey));

    // 4. Pass the *raw* 16-byte challenge in — the signer will hash it once.
    final sig = signer.generateSignature(challenge) as ECSignature;

    // 5. Encode as 64-byte r||s
    return _encodeSignature(sig);
  }

  /// Generates a P-256 keypair, stores the private scalar (d) in secure storage
  /// and the public key coords (x,y) in Base64.
  static Future<void> generateAndStoreKeyPair() async {
    final keyParams = ECKeyGeneratorParameters(ECCurve_prime256v1());
    final random =
        FortunaRandom()..seed(
          KeyParameter(
            Uint8List.fromList(
              List.generate(32, (_) => DateTime.now().microsecond % 256),
            ),
          ),
        );
    final generator =
        ECKeyGenerator()..init(ParametersWithRandom(keyParams, random));
    final pair = generator.generateKeyPair();
    final privKey = pair.privateKey;
    final pubKey = pair.publicKey;

    final privPem = base64Encode(bigIntToBytes(privKey.d!));
    final pubX = base64Encode(bigIntToBytes(pubKey.Q!.x!.toBigInteger()!));
    final pubY = base64Encode(bigIntToBytes(pubKey.Q!.y!.toBigInteger()!));

    await _secureStorage.write(key: _privateKeyKey, value: privPem);
    await _secureStorage.write(key: _publicKeyX, value: pubX);
    await _secureStorage.write(key: _publicKeyY, value: pubY);
  }

  static Future<bool> isKeyGenerated() async =>
      _secureStorage.containsKey(key: _privateKeyKey);

  static Future<String?> getPublicKeyX() async =>
      _secureStorage.read(key: _publicKeyX);

  static Future<String?> getPublicKeyY() async =>
      _secureStorage.read(key: _publicKeyY);

  static Future<String?> getPrivateKeyPem() async =>
      _secureStorage.read(key: _privateKeyKey);
}
