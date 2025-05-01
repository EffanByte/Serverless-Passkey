import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';


class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String? _publicKeyX;
  String? _publicKeyY;

  @override
  void initState() {
    super.initState();
    _loadPublicKey();
  }

final _secureStorage = FlutterSecureStorage();

  Future<void> _loadPublicKey() async {
    final x = await _secureStorage.read(key: 'publicKeyX');
    final y = await _secureStorage.read(key: 'publicKeyY');
    setState(() {
      _publicKeyX = x;
      _publicKeyY = y;
    });
  }


  void _showPublicKeyDialog() {
    showDialog(
      context: context,
      builder:
          (context) => AlertDialog(
            title: const Text('Public Key'),
            content: SingleChildScrollView(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('X:\n$_publicKeyX'),
                  const SizedBox(height: 8),
                  Text('Y:\n$_publicKeyY'),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Close'),
              ),
            ],
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Passkey Device Home')),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Welcome! Your device is ready to act as a passkey authenticator.',
              style: TextStyle(fontSize: 18),
            ),
            const SizedBox(height: 32),
            ElevatedButton.icon(
              onPressed: _showPublicKeyDialog,
              icon: const Icon(Icons.key),
              label: const Text('View Public Key'),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                // TODO: Navigate to BLE broadcaster screen
              },
              icon: const Icon(Icons.bluetooth),
              label: const Text('Start Challenge Broadcaster'),
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: () {
                // TODO: Navigate to WebView passkey screen
              },
              icon: const Icon(Icons.security),
              label: const Text('Sign Challenge via WebView'),
            ),
          ],
        ),
      ),
    );
  }
}
