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

  Future<void> _stopAdvertising() async {
    await NativeBlePlugin.stopAdvertising();
    setState(() => _logs.insert(0, '⏹️ Advertising stopped'));
  }

  Future<void> _handleIncoming(MethodCall call) async {
    if (call.method != 'challengeReceived') return;
    final b64 = call.arguments as String;

    // 1) Show raw Base64 immediately
    setState(() => _logs.insert(0, '📥 Raw Base64: $b64'));

    // 2) Decode bytes
    final bytes = base64Decode(b64);
    setState(() => _logs.insert(0, '🔍 Decoded ${bytes.length} bytes'));

    // 3) Biometric auth
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
    }

    if (!didAuth) {
      setState(() => _logs.insert(0, '❌ Authentication failed'));
      return;
    }
    setState(() => _logs.insert(0, '🔐 Authentication succeeded'));

    // 4) Sign challenge
    final sig = await KeyUtils.signChallenge(bytes);
    final sigB64 = base64Encode(sig);
    setState(() => _logs.insert(0, '✍️ Signature: $sigB64'));

    // TODO: write signature back over BLE if needed
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('BLE Broadcasting')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Stop button
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.stop_circle),
                label: const Text('Stop Broadcasting'),
                onPressed: _stopAdvertising,
              ),
            ),
            const SizedBox(height: 8),
            const Divider(),
            // Event log
            Expanded(
              child:
                  _logs.isEmpty
                      ? const Center(child: Text('No events yet'))
                      : ListView.builder(
                        reverse: true,
                        itemCount: _logs.length,
                        itemBuilder:
                            (ctx, i) => Padding(
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
  