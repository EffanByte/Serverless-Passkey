// app/lib/screens/home_screen.dart
import 'package:flutter/material.dart';
import 'package:local_auth/local_auth.dart';
import 'package:app/screens/broadcasting.dart';
import 'package:app/screens/generate_key_screen.dart';
import 'package:app/services/key_utils.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  Future<void> _deleteKeys(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Confirm Deletion'),
            content: const Text(
              'Are you sure? You will not be able to log into any website with this account again.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Delete'),
              ),
            ],
          ),
    );

    if (confirmed != true) return;

    final localAuth = LocalAuthentication();
    final didAuth = await localAuth.authenticate(
      localizedReason: 'Please authenticate to delete your private key',
      options: const AuthenticationOptions(
        biometricOnly: true,
        stickyAuth: false,
      ),
    );

    if (!didAuth) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Biometric authentication failed.')),
      );
      return;
    }

    await KeyUtils.deleteKeys();
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Keys deleted successfully.')));

    // Navigate to GenerateKeyScreen
    Navigator.pushAndRemoveUntil(
      context,
      MaterialPageRoute(builder: (_) => const GenerateKeyScreen()),
      (route) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passkey Auth App')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Image.asset('lib/assets/Equinox_1.png', height: 150, width: 150),
              const SizedBox(height: 32),

              /// --- Broadcasting Section ---
              Card(
                color: Colors.blueGrey[900],
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.bluetooth, size: 48, color: Colors.white),
                      const SizedBox(height: 16),
                      const Text(
                        'Ready to Broadcast',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Start broadcasting to authenticate nearby devices',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withOpacity(0.7)),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        icon: const Icon(Icons.bluetooth_searching),
                        label: const Text('Start Broadcasting'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.black,
                        ),
                        onPressed: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const BroadcastingScreen(),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              /// --- Delete Keys Section ---
              Card(
                color: Colors.red[900],
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.delete_forever, size: 48, color: Colors.white),
                      const SizedBox(height: 16),
                      const Text(
                        'Danger Zone',
                        style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w500,
                          color: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        'Delete your private key from this device. You won’t be able to authenticate anymore.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white.withOpacity(0.7)),
                      ),
                      const SizedBox(height: 24),
                      ElevatedButton.icon(
                        icon: const Icon(Icons.delete),
                        label: const Text('Delete Keys'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white,
                          foregroundColor: Colors.red,
                        ),
                        onPressed: () => _deleteKeys(context),
                      ),
                    ],
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
