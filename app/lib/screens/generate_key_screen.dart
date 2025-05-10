// app/lib/screens/generate_key_screen.dart
import 'package:flutter/material.dart';
import 'package:app/services/key_utils.dart';
import 'package:app/screens/home_screen.dart';

class GenerateKeyScreen extends StatelessWidget {
  const GenerateKeyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passkey Auth App')),
      body: Center(
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.key, size: 48, color: Colors.white),
                const SizedBox(height: 16),
                const Text(
                  'Generate Security Key',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.w500,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Create a new hardware security key to get started',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.white.withOpacity(0.7)),
                ),
                const SizedBox(height: 24),
                ElevatedButton.icon(
                  icon: const Icon(Icons.add_circle_outline),
                  label: const Text('Generate Key'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: Colors.black,
                  ),
                  onPressed: () async {
                    await KeyUtils.generateAndStoreKeyPair();
                    if (context.mounted) {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                          builder: (context) => const HomeScreen(),
                        ),
                      );
                    }
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
