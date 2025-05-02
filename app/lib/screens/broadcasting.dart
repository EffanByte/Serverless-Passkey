// lib/screens/broadcasting.dart

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:app/services/native_ble_plugin.dart';
import 'package:app/services/key_utils.dart';

class BroadcastingScreen extends StatefulWidget {
  const BroadcastingScreen({super.key});
  @override
  State<BroadcastingScreen> createState() => _BroadcastingScreenState();
}

class _BroadcastingScreenState extends State<BroadcastingScreen> {
  static const _channel = MethodChannel('native_ble_plugin');
  final _auth = LocalAuthentication();
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();
    _startAdvertising();
    _channel.setMethodCallHandler(_handleIncoming);
  }

  Future<void> _startAdvertising() async {
    await NativeBlePlugin.startAdvertising();
    setState(() => _logs.insert(0, '✅ Advertising started'));
  }

  @override
  void dispose() {
    NativeBlePlugin.stopAdvertising();
    super.dispose();
  }

  Future<void> _handleIncoming(MethodCall call) async {
    if (call.method != 'challengeReceived') return;
    final b64challenge = call.arguments as String;

    // 1) Log raw challenge
    setState(() => _logs.insert(0, '📥 Challenge (Base64): $b64challenge'));

    // 2) Decode to bytes
    final challengeBytes = base64Decode(b64challenge);
    setState(
      () => _logs.insert(0, '🔍 Decoded ${challengeBytes.length} bytes'),
    );

    // 3) Biometric authentication
    bool didAuth = false;
    try {
      didAuth = await _auth.authenticate(
        localizedReason: 'Authenticate to sign the challenge',
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: false,
        ),
      );
    } on PlatformException catch (e) {
      setState(() => _logs.insert(0, '⚠️ Auth error: ${e.message}'));
      return;
    }

    if (!didAuth) {
      setState(() => _logs.insert(0, '❌ Authentication failed'));
      return;
    }
    setState(() => _logs.insert(0, '✅ Authentication succeeded'));

    // 4) Sign the challenge
    final sigBytes = await KeyUtils.signChallenge(challengeBytes);
    final b64sig = base64Encode(sigBytes);
    setState(() => _logs.insert(0, '✍️ Signature (Base64): $b64sig'));

    // 5) Send the signature back to the browser over BLE
    await NativeBlePlugin.sendSignature(b64sig);
    setState(() => _logs.insert(0, '📤 Signature sent to browser'));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('BLE Broadcasting')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.stop_circle),
                label: const Text('Stop Broadcasting'),
                onPressed: () async {
                  await NativeBlePlugin.stopAdvertising();
                  setState(() => _logs.insert(0, '⏹️ Advertising stopped'));
                },
              ),
            ),
            const Divider(),
            Expanded(
              child:
                  _logs.isEmpty
                      ? const Center(child: Text('No events yet'))
                      : ListView.builder(
                        reverse: true,
                        itemCount: _logs.length,
                        itemBuilder:
                            (_, i) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: Text(_logs[i]),
                            ),
                      ),
            ),
          ],
        ),
      ),
    );
  }
}
