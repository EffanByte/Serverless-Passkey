import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:app/screens/generate_key_screen.dart';
import 'package:app/screens/home_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  Widget _initialScreen = const Center(child: CircularProgressIndicator());

  @override
  void initState() {
    super.initState();
    _checkForKey();
  }

  Future<void> _checkForKey() async {
    const secureStorage = FlutterSecureStorage();
    final hasKey = await secureStorage.containsKey(key: 'privateKeyPem');
    setState(() {
      _initialScreen = hasKey ? const HomeScreen() : const GenerateKeyScreen();
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Passkey Auth App',
      theme: ThemeData.dark(),
      home: _initialScreen,
    );
  }
}
