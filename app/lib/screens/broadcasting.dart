// app/lib/screens/broadcasting.dart

import 'dart:convert';
import 'dart:typed_data';
import 'dart:math';

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
        _addLog('✅ Client subscribed – now sending Dilithium public key');
        print('🟢 onMethodCall: subscribed');

        // Send Dilithium-2 public key as {"sigPub":"<base64>"}
        final String sigPub = await KeyUtils.getPublicKey();
        final String jsonStr = jsonEncode({'sigPub': sigPub});

        // extra logs:
        print('📤 JSON public key payload length: ${jsonStr.length} chars');
        print('   pub JSON prefix: ${jsonStr.substring(0, min(32, jsonStr.length))}…');

        await NativeBlePlugin.sendPublicKey(jsonStr);
        _addLog('🔑 Dilithium public key sent');
        print('🟢 sendPublicKey done');
        break;

      case 'challengeReceived':
        final String b64Challenge = call.arguments as String;
        _addLog('📥 Challenge (base64): $b64Challenge');
        print('📥 challengeReceived: $b64Challenge');

        Uint8List challengeBytes;
        try {
          challengeBytes = base64Decode(b64Challenge);
          _addLog('🔍 Decoded challenge: ${challengeBytes.length} bytes');
          // log first few bytes in hex
          final hexSnippet = challengeBytes
              .take(8)
              .map((b) => b.toRadixString(16).padLeft(2, '0'))
              .join();
          print('   challenge bytes (hex prefix): $hexSnippet…');
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

        // Sign and chunk
        try {
          final Uint8List signature = await KeyUtils.signChallenge(challengeBytes);
          final String b64Sig = base64Encode(signature);

          // extra logs:
          _addLog('✍️ Signature created: ${signature.length} bytes');
          print('✍️ Signature raw length: ${signature.length} bytes');
          final sigHexSnippet = signature
              .take(8)
              .map((b) => b.toRadixString(16).padLeft(2, '0'))
              .join();
          print('   signature bytes (hex prefix): $sigHexSnippet…');
          print('   signature (base64) length: ${b64Sig.length} chars');

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
