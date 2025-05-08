import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

Uint8List bigIntToBytes(BigInt number) {
  final mask = BigInt.from(0xff);
  final bytes = <int>[];
  BigInt n = number;
  while (n > BigInt.zero) {
    bytes.insert(0, (n & mask).toInt());
    n = n >> 8;
  }
  return Uint8List.fromList(bytes.isEmpty ? [0] : bytes);
}

BigInt bytesToBigInt(Uint8List bytes) {
  BigInt result = BigInt.zero;
  for (final b in bytes) {
    result = (result << 8) | BigInt.from(b);
  }
  return result;
}

Uint8List _encodeSignatureDer(ECSignature sig) {
  Uint8List _pos(Uint8List bs) {
    if (bs.isNotEmpty && (bs[0] & 0x80) != 0) {
      return Uint8List.fromList([0] + bs);
    }
    return bs;
  }

  final r = _pos(bigIntToBytes(sig.r));
  final s = _pos(bigIntToBytes(sig.s));

  final body =
      BytesBuilder()
        ..addByte(0x02)
        ..addByte(r.length)
        ..add(r)
        ..addByte(0x02)
        ..addByte(s.length)
        ..add(s);
  final bdy = body.toBytes();

  final seq =
      BytesBuilder()
        ..addByte(0x30)
        ..addByte(bdy.length)
        ..add(bdy);

  return seq.toBytes();
}

class KeyUtils {
  static const _privateKey = 'privateKeyPem';
  static const _publicKeyX = 'publicKeyX';
  static const _publicKeyY = 'publicKeyY';
  static const MethodChannel _bleChannel = MethodChannel('native_ble_plugin');

  static final _storage = FlutterSecureStorage();

static Future<bool> isKeyGenerated() async {
    return await _storage.containsKey(key: _privateKey);
  }


  /// Generates a new P-256 keypair, stores scalar & coords in secure storage,
  /// and notifies native BLE of the uncompressed public key.
  static Future<void> generateAndStoreKeyPair() async {
    final params = ECKeyGeneratorParameters(ECCurve_prime256v1());
    final rng =
        FortunaRandom()..seed(
          KeyParameter(
            Uint8List.fromList(
              List.generate(32, (_) => DateTime.now().microsecond % 256),
            ),
          ),
        );
    final gen = ECKeyGenerator()..init(ParametersWithRandom(params, rng));
    final pair = gen.generateKeyPair();
    final priv = pair.privateKey as ECPrivateKey;
    final pub = pair.publicKey as ECPublicKey;

    final dB64 = base64Encode(bigIntToBytes(priv.d!));
    final xB64 = base64Encode(bigIntToBytes(pub.Q!.x!.toBigInteger()!));
    final yB64 = base64Encode(bigIntToBytes(pub.Q!.y!.toBigInteger()!));

    await _storage.write(key: _privateKey, value: dB64);
    await _storage.write(key: _publicKeyX, value: xB64);
    await _storage.write(key: _publicKeyY, value: yB64);

    // build uncompressed point 0x04||X||Y and send to native
    final xBytes = base64Decode(xB64);
    final yBytes = base64Decode(yB64);
    final uncompressed =
        Uint8List(1 + xBytes.length + yBytes.length)
          ..[0] = 0x04
          ..setRange(1, 1 + xBytes.length, xBytes)
          ..setRange(
            1 + xBytes.length,
            1 + xBytes.length + yBytes.length,
            yBytes,
          );

    await _bleChannel.invokeMethod(
      'updatePublicKey',
      base64Encode(uncompressed),
    );
  }

  /// Signs a 16-byte [challenge] with P-256 deterministic ECDSA, returns DER.
  static Future<Uint8List> signChallenge(Uint8List challenge) async {
    final dB64 = await _storage.read(key: _privateKey);
    if (dB64 == null) throw StateError('No private key.');
    final d = bytesToBigInt(Uint8List.fromList(base64Decode(dB64)));
    final domain = ECDomainParameters('prime256v1');
    final priv = ECPrivateKey(d, domain);

    final signer = Signer('SHA-256/DET-ECDSA');
    signer.init(true, PrivateKeyParameter(priv));

    // internally hashes challenge
    final sig = signer.generateSignature(challenge) as ECSignature;

    final der = _encodeSignatureDer(sig);
    return der;
  }

  static Future<String?> getPublicKeyX() => _storage.read(key: _publicKeyX);
  static Future<String?> getPublicKeyY() => _storage.read(key: _publicKeyY);
}
