import 'package:flutter/material.dart';
import 'package:app/utils/key_utils.dart';
import 'package:app/screens/home_screen.dart';


class GenerateKeyScreen extends StatelessWidget {
  const GenerateKeyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            'No hardware security key found.',
            style: TextStyle(fontSize: 18),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () async {
              await KeyUtils.generateAndStoreKeyPair();
              Navigator.pushReplacement(
                context,
                MaterialPageRoute(builder: (context) => const HomeScreen()),
              );
            },
            child: const Text('Generate Hardware Security Key'),
          ),
        ],
      ),
    );
  }
}
