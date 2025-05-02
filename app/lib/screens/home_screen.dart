import 'package:flutter/material.dart';
import 'package:app/screens/broadcasting.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passkey Auth App')),
      body: Center(
        child: ElevatedButton.icon(
          icon: const Icon(Icons.bluetooth),
          label: const Text('Start BLE Peripheral'),
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => const BroadcastingScreen()),
            );
          },
        ),
      ),
    );
  }
}
