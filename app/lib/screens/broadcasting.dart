import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:app/services/native_ble_plugin.dart';
import 'package:app/services/key_utils.dart';

class BroadcastingScreen extends StatefulWidget {
  const BroadcastingScreen({Key? key}) : super(key: key);

  @override
  _BroadcastingScreenState createState() => _BroadcastingScreenState();
}

class _BroadcastingScreenState extends State<BroadcastingScreen> {
  /// The MethodChannel used by MainActivity
  final MethodChannel _channel = NativeBlePlugin.channel;
  final LocalAuthentication _localAuth = LocalAuthentication();
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();
    // Handle incoming method calls (subscription & challenges)
    _channel.setMethodCallHandler(_onMethodCall);
    _startAdvertising();
  }

  Future<void> _startAdvertising() async {
    try {
      await NativeBlePlugin.startAdvertising();
      _addLog('✅ Advertising started');
      print('🔵 BLE advertising started');
    } catch (e) {
      _addLog('❌ Failed to start advertising: $e');
      print('🔴 startAdvertising error: $e');
    }
  }

  Future<void> _stopAdvertising() async {
    try {
      await NativeBlePlugin.stopAdvertising();
      _addLog('⏹️ Advertising stopped');
      print('🛑 BLE advertising stopped');
    } catch (e) {
      _addLog('❌ Failed to stop advertising: $e');
      print('🔴 stopAdvertising error: $e');
    }
  }

  Future<void> _onMethodCall(MethodCall call) async {
    switch (call.method) {
      case 'subscribed':
      // The client has subscribed to notifications (wrote CCC descriptor)
        _addLog('✅ Client subscribed – now sending public key');
        print('🟢 onMethodCall: subscribed');

        final String? x = await KeyUtils.getPublicKeyX();
        final String? y = await KeyUtils.getPublicKeyY();
        print('📤 Dart has pubX=$x pubY=$y');
        if (x != null && y != null) {
          final jsonStr = jsonEncode({'x': x, 'y': y});
          print('📤 JSON public key: $jsonStr');
          await NativeBlePlugin.sendPublicKey(jsonStr);
          _addLog('🔑 Public key sent');
          print('🟢 sendPublicKey done');
        }
        break;

      case 'challengeReceived':
        final String b64Challenge = call.arguments as String;
        _addLog('📥 Challenge (base64): $b64Challenge');
        print('📥 challengeReceived: $b64Challenge');

        Uint8List challengeBytes;
        try {
          challengeBytes = base64Decode(b64Challenge);
          _addLog('🔍 Decoded challenge: ${challengeBytes.length} bytes');
        } catch (e) {
          _addLog('❌ Failed to decode challenge: $e');
          return;
        }

        if (challengeBytes.length != 16) {
          _addLog('⚠️ Ignoring non-challenge write (${challengeBytes.length} bytes)');
          return;
        }

        bool didAuth = false;
        try {
          didAuth = await _localAuth.authenticate(
            localizedReason: 'Authenticate to sign the challenge',
            options: const AuthenticationOptions(
              biometricOnly: true,
              stickyAuth: false,
            ),
          );
        } on PlatformException catch (e) {
          _addLog('⚠️ Biometric auth error: ${e.message}');
          print('⚠️ Biometric error: ${e.message}');
        }
        if (!didAuth) {
          _addLog('❌ Authentication failed');
          print('🔴 Authentication failed');
          return;
        }
        _addLog('🔐 Authentication succeeded');
        print('🔵 Authentication succeeded');

        try {
          final signature = await KeyUtils.signChallenge(challengeBytes);
          final String b64Sig = base64Encode(signature);
          _addLog('✍️ Signature (base64): $b64Sig');
          print('✍️ Signature created: $b64Sig');

          await NativeBlePlugin.sendSignature(b64Sig);
          _addLog('➡️ Signature sent');
          print('🟢 sendSignature() completed');
        } catch (e) {
          _addLog('❌ Signing failed: $e');
          print('🔴 signChallenge error: $e');
        }
        break;

      default:
        print('⚠️ Unknown MethodCall: ${call.method}');
        break;
    }
  }

  void _addLog(String log) {
    setState(() {
      _logs.insert(0, log);
    });
  }

  @override
  void dispose() {
    _channel.setMethodCallHandler(null);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Broadcasting'),
        actions: [
          IconButton(
            icon: const Icon(Icons.stop_circle),
            tooltip: 'Stop Advertising',
            onPressed: _stopAdvertising,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.bluetooth_searching, color: Colors.blue),
                title: const Text('Broadcasting Active'),
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: _logs.isEmpty
                      ? Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.history, size: 48, color: Colors.grey[600]),
                        const SizedBox(height: 8),
                        Text(
                          'No events yet',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      ],
                    ),
                  )
                      : ListView.builder(
                    reverse: true,
                    itemCount: _logs.length,
                    itemBuilder: (context, index) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        _logs[index],
                        style: const TextStyle(fontFamily: 'monospace'),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}