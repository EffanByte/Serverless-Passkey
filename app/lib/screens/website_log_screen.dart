import 'package:flutter/material.dart';

class WebsiteLogScreen extends StatelessWidget {
  const WebsiteLogScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final List<Map<String, String>> logs = [
      {'title': 'Equinox Login Page', 'time': '14/05/2025 9:36'},
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('Website Log')),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child:
            logs.isEmpty
                ? const Center(child: Text('No logs available.'))
                : ListView.builder(
                  itemCount: logs.length,
                  itemBuilder: (context, index) {
                    final log = logs[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(vertical: 12),
                      color: Colors.blueGrey[900],
                      child: Padding(
                        padding: const EdgeInsets.all(16.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              log['title']!,
                              style: const TextStyle(
                                fontSize: 18,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              'Time: ${log['time']}',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.white.withOpacity(0.8),
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
      ),
    );
  }
}
