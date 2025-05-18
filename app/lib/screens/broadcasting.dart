import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:app/services/native_ble_plugin.dart';
import 'package:app/services/key_utils.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'dart:io';

class BroadcastingScreen extends StatefulWidget {
  const BroadcastingScreen({super.key});

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
      case 'connectionEstablished':
        _addLog('🔗 Phone connected');
        print('🟢 onMethodCall: connectionEstablished');
        return;

      case 'disconnected':
        _addLog('🔌 Phone disconnected');
        print('🟢 onMethodCall: disconnected');
        return;

      case 'subscribed':
        _addLog('✅ Client subscribed – now sending public key');
        print('🟢 onMethodCall: subscribed');

        final x = await KeyUtils.getPublicKeyX();
        final y = await KeyUtils.getPublicKeyY();
        print('📤 Dart has pubX=$x pubY=$y');

        if (x != null && y != null) {
          final jsonStr = jsonEncode({'x': x, 'y': y});
          print('📤 JSON public key: $jsonStr');
          await NativeBlePlugin.sendPublicKey(jsonStr);
          _addLog('🔑 Public key sent');

          // Fetch and send signed device name
          final deviceInfo = DeviceInfoPlugin();
          String deviceName;
          if (Platform.isAndroid) {
            deviceName = (await deviceInfo.androidInfo).model ?? 'Android';
          } else if (Platform.isIOS) {
            deviceName = (await deviceInfo.iosInfo).name ?? 'iPhone';
          } else {
            deviceName = 'Unknown';
          }

          await NativeBlePlugin.sendDeviceName(deviceName);
          _addLog('📛 Signed device name sent: $deviceName');
          print('🟢 sendDeviceName done: $deviceName');
        }
        return;

      case 'sendDeviceNameRequest':   // ← ADD THIS CASE
        _addLog('📣 Native asked for device-name now');
        print('🟢 onMethodCall: sendDeviceNameRequest');

        // figure out your name again (same logic you used before)
        final deviceInfo = DeviceInfoPlugin();
        String deviceName;
        if (Platform.isAndroid) {
          deviceName = (await deviceInfo.androidInfo).model ?? 'Android';
        } else if (Platform.isIOS) {
          deviceName = (await deviceInfo.iosInfo).name ?? 'iPhone';
        } else {
          deviceName = 'Unknown';
        }

        // send signed name back to the native side
        await NativeBlePlugin.sendDeviceName(deviceName);
        _addLog('📛 Device name sent: $deviceName');
        return;

      case 'challengeReceived':
        final b64Challenge = call.arguments as String;
        _addLog('📥 Challenge (base64): $b64Challenge');
        print('📥 onMethodCall: challengeReceived');

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
          return;
        }

        if (!didAuth) {
          _addLog('❌ Authentication failed');
          return;
        }

        _addLog('🔐 Authentication succeeded');
        print('🔵 Authentication succeeded');

        try {
          final signature = await KeyUtils.signChallenge(challengeBytes);
          final b64Sig = base64Encode(signature);
          _addLog('✍️ Signature (base64): $b64Sig');
          print('✍️ Signature created: $b64Sig');

          await NativeBlePlugin.sendSignature(b64Sig);
          _addLog('➡️ Signature sent');
          print('🟢 sendSignature completed');
        } catch (e) {
          _addLog('❌ Signing failed: $e');
          print('🔴 signChallenge error: $e');
        }
        return;

      default:
        print('⚠️ Unknown MethodCall: ${call.method}');
    }
  }

  void _addLog(String log) {
    setState(() {
      _logs.insert(0, log);
    });
  }

  @override
  void dispose() {
    // Tear down BLE when this screen is removed
    _stopAdvertising();
    _channel.setMethodCallHandler(null);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      // Ensure we stop advertising when the user navigates back
      onWillPop: () async {
        await _stopAdvertising();
        return true;
      },
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Broadcasting'),
          // Override the default back button so we can stop advertising first
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () async {
              await _stopAdvertising();
              Navigator.of(context).pop();
            },
          ),
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
      ),
    );
  }

}