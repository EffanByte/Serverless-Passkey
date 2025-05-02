import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:app/services/native_ble_plugin.dart';
import 'package:app/utils/key_utils.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const _channel = MethodChannel('native_ble_plugin');

  /// Holds the log of BLE events to display in the UI.
  final List<String> _logs = [];

  @override
  void initState() {
    super.initState();

    // 1️⃣ Wire up the MethodChannel handler
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'challengeReceived') {
        final b64 = call.arguments as String;
        final bytes = base64Decode(b64);

        // Distinguish challenge vs. reply by length or content
        final kind = bytes.length == 16 ? 'Challenge' : 'Reply';

        final entry =
            '$kind received (${bytes.length} bytes): '
            '${kind == "Challenge" ? b64 : utf8.decode(bytes)}';

        setState(() {
          _logs.insert(0, entry); // newest at top
        });

        if (kind == 'Challenge') {
          // 2️⃣ Automatically sign the challenge
          final sig = await KeyUtils.signChallenge(bytes);
          setState(() {
            _logs.insert(
              0,
              'Signed challenge (${sig.length} bytes): ${base64Encode(sig)}',
            );
          });
          // TODO: send `sig` back over BLE or via another channel
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passkey Device Home')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            // Buttons to start/stop BLE advertising
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    icon: const Icon(Icons.bluetooth),
                    label: const Text('Start BLE Peripheral'),
                    onPressed: () async {
                      await NativeBlePlugin.startAdvertising();
                      setState(() => _logs.insert(0, 'Started advertising'));
                    },
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton.icon(
                  icon: const Icon(Icons.stop),
                  label: const Text('Stop'),
                  onPressed: () async {
                    await NativeBlePlugin.stopAdvertising();
                    setState(() => _logs.insert(0, 'Stopped advertising'));
                  },
                ),
              ],
            ),

            const SizedBox(height: 16),
            const Divider(),

            // Log display area
            const Align(
              alignment: Alignment.centerLeft,
              child: Text(
                'Event log:',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ),
            const SizedBox(height: 8),

            // Expanded ListView to show _logs
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white24),
                  borderRadius: BorderRadius.circular(4),
                ),
                padding: const EdgeInsets.all(8),
                child:
                    _logs.isEmpty
                        ? const Center(
                          child: Text(
                            'No events yet',
                            style: TextStyle(color: Colors.white54),
                          ),
                        )
                        : ListView.builder(
                          reverse: true,
                          itemCount: _logs.length,
                          itemBuilder:
                              (context, i) => Text(
                                _logs[i],
                                style: const TextStyle(fontSize: 14),
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
