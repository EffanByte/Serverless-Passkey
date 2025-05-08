import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:app/services/native_ble_plugin.dart';
import 'package:app/services/key_utils.dart';

class BroadcastingScreen extends StatefulWidget {
  const BroadcastingScreen({Key? key}) : super(key: key);
  @override
  State<BroadcastingScreen> createState() => _BroadcastingScreenState();
}

class _BroadcastingScreenState extends State<BroadcastingScreen> {
  static const _bleCh = MethodChannel('native_ble_plugin');
  final _auth = LocalAuthentication();
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();
    _configurePubKey(); // 1) generate if needed & send pubkey
    _startAdvertising(); // 2) start BLE
    _bleCh.setMethodCallHandler(_onBleCall);
  }

  Future<void> _configurePubKey() async {
    final exists = await KeyUtils.isKeyGenerated();
    if (!exists) {
      await KeyUtils.generateAndStoreKeyPair();
      _logs.insert(0, '🔑 New key generated');
    } else {
      _logs.insert(0, '🔐 Key already present');
    }

    try {
      // Build uncompressed key
      final x = await KeyUtils.getPublicKeyX();
      final y = await KeyUtils.getPublicKeyY();

      if (x == null || y == null) throw Exception("X or Y missing");

      final xBytes = base64Decode(x);
      final yBytes = base64Decode(y);
      final raw =
          Uint8List(1 + xBytes.length + yBytes.length)
            ..[0] = 0x04
            ..setAll(1, xBytes)
            ..setAll(1 + xBytes.length, yBytes);

      await _bleCh.invokeMethod('updatePublicKey', base64Encode(raw));
      _logs.insert(0, '🗝️ Public key sent to native');
    } catch (e) {
      _logs.insert(0, '❌ Failed to send public key: $e');
    }

    setState(() {});
  }


  Future<void> _startAdvertising() async {
    await NativeBlePlugin.startAdvertising();
    setState(() => _logs.insert(0, '✅ Advertising started'));
  }

  Future<void> _onBleCall(MethodCall call) async {
    if (call.method != 'challengeReceived') return;
    final chB64 = call.arguments as String;
    setState(() => _logs.insert(0, '📥 Challenge: $chB64'));

    final challenge = base64Decode(chB64);
    setState(() => _logs.insert(0, '🔍 Decoded ${challenge.length} bytes'));

    bool ok = false;
    try {
      ok = await _auth.authenticate(
        localizedReason: 'Authenticate to sign challenge',
      );
    } catch (e) {
      setState(() => _logs.insert(0, '⚠️ Auth error: $e'));
      return;
    }

    if (!ok) {
      setState(() => _logs.insert(0, '❌ Authentication failed'));
      return;
    }

    setState(() => _logs.insert(0, '✅ Biometric OK'));

    final sigDer = await KeyUtils.signChallenge(challenge);
    final sB64 = base64Encode(sigDer);
    setState(() => _logs.insert(0, '✍️ Signature: $sB64'));

    await NativeBlePlugin.sendSignature(sB64);
    setState(() => _logs.insert(0, '📤 Signature sent'));
  }

  @override
  void dispose() {
    NativeBlePlugin.stopAdvertising();
    super.dispose();
  }

  @override
  Widget build(BuildContext c) {
    return Scaffold(
      appBar: AppBar(title: const Text('BLE Broadcaster')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Expanded(
              child: ListView(
                reverse: true,
                children:
                    _logs
                        .map(
                          (l) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Text(l),
                          ),
                        )
                        .toList(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
