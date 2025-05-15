// app/lib/screens/broadcasting_screen.dart

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
  final MethodChannel _channel = NativeBlePlugin.channel;
  final LocalAuthentication _localAuth = LocalAuthentication();
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();
    KeyUtils.getPublicKey().then((b64) {
  final pub = base64Decode(b64);
  final fp = pub.sublist(0,8)
    .map((b) => b.toRadixString(16).padLeft(2,'0'))
    .join(' ');
  print('🔍 [STARTUP] loaded pubkey fingerprint: $fp');
});
    _channel.setMethodCallHandler(_onMethodCall);
    _startAdvertising();
  }

  Future<void> _startAdvertising() async {
    try {
      await NativeBlePlugin.startAdvertising();
      _addLog('✅ Advertising started');
    } catch (e) {
      _addLog('❌ Failed to start advertising: $e');
    }
  }

  Future<void> _stopAdvertising() async {
    try {
      await NativeBlePlugin.stopAdvertising();
      _addLog('⏹️ Advertising stopped');
    } catch (e) {
      _addLog('❌ Failed to stop advertising: $e');
    }
  }

  Future<void> _onMethodCall(MethodCall call) async {
    switch (call.method) {
      case 'subscribed':
        _addLog('✅ Client subscribed – sending public key');
        try {
          // Web side expects the key under "sigPub"
          final sigPub = await KeyUtils.getPublicKey();
          final pubBytes = base64Decode(sigPub);
          final fingerprint = pubBytes.sublist(0, 8).map((b) => b.toRadixString(16).padLeft(2, '0')).join(' ');
          print('🔑 Flutter public key fingerprint: $fingerprint');
          final jsonStr = jsonEncode({'sigPub': sigPub});
          await NativeBlePlugin.sendPublicKey(jsonStr);
          _addLog('🔑 Public key sent');
        } catch (e) {
          _addLog('❌ Failed to send public key: $e');
        }
        break;

      case 'challengeReceived':
        final String b64Challenge = call.arguments as String;
        _addLog('📥 Challenge received (base64): $b64Challenge');

        late Uint8List challengeBytes;
        try {
          challengeBytes = base64Decode(b64Challenge);
          _addLog('🔍 Decoded challenge: ${challengeBytes.length} bytes');
        } catch (e) {
          _addLog('❌ Invalid challenge data: $e');
          return;
        }
        if (challengeBytes.length != 16) {
          _addLog('⚠️ Unexpected challenge size: ${challengeBytes.length}');
          return;
        }

        bool authenticated = false;
        try {
          authenticated = await _localAuth.authenticate(
            localizedReason: 'Authenticate to sign challenge',
            options: const AuthenticationOptions(
              biometricOnly: true,
              stickyAuth: false,
            ),
          );
        } catch (e) {
          _addLog('⚠️ Auth error: $e');
        }
        if (!authenticated) {
          _addLog('❌ Authentication failed');
          return;
        }
        _addLog('🔐 Authentication succeeded');

        try {
          final sig = await KeyUtils.signChallenge(challengeBytes);
          const chunkSize = 512;
          for (var offset = 0; offset < sig.length; offset += chunkSize) {
            final end = (offset + chunkSize).clamp(0, sig.length);
            final chunk = sig.sublist(offset, end);
            await NativeBlePlugin.sendRawBytes(chunk);
          }
          _addLog('➡️ Signature sent (${sig.length} bytes)');
        } catch (e) {
          _addLog('❌ Signing failed: $e');
        }
        break;

      case 'challengeReceivedRaw':
        final Uint8List challengeBytes = call.arguments as Uint8List;
        _addLog('📥 Challenge received (raw): ${challengeBytes.length} bytes');

        if (challengeBytes.length != 16) {
          _addLog('⚠️ Unexpected challenge size: ${challengeBytes.length}');
          return;
        }

        bool authenticated = false;
        try {
          authenticated = await _localAuth.authenticate(
            localizedReason: 'Authenticate to sign challenge',
            options: const AuthenticationOptions(
              biometricOnly: true,
              stickyAuth: false,
            ),
          );
        } catch (e) {
          _addLog('⚠️ Auth error: $e');
        }

        if (!authenticated) {
          _addLog('❌ Authentication failed');
          return;
        }
        _addLog('🔐 Authentication succeeded');

        try {
          final sig = await KeyUtils.signChallenge(challengeBytes);
          const chunkSize = 512;
          for (var offset = 0; offset < sig.length; offset += chunkSize) {
            final end = (offset + chunkSize).clamp(0, sig.length);
            final chunk = sig.sublist(offset, end);
            await NativeBlePlugin.sendRawBytes(chunk);
          }
          _addLog('➡️ Signature sent (${sig.length} bytes)');
        } catch (e) {
          _addLog('❌ Signing failed: $e');
        }
        break;


      default:
        _addLog('⚠️ Unknown method: ${call.method}');
        break;
    }
  }

  void _addLog(String entry) {
    setState(() {
      _logs.insert(0, entry);
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
                        Text('No events yet', style: TextStyle(color: Colors.grey[600])),
                      ],
                    ),
                  )
                      : ListView.builder(
                    itemCount: _logs.length,
                    itemBuilder: (context, i) => Padding(
                      padding: const EdgeInsets.symmetric(vertical: 2),
                      child: Text(
                        _logs[i],
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

