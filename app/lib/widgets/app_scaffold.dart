import 'package:flutter/material.dart';
import 'package:app/widgets/starry_background.dart';

class AppScaffold extends StatelessWidget {
  final Widget child;
  final PreferredSizeWidget? appBar;

  const AppScaffold({super.key, required this.child, this.appBar});

  @override
  Widget build(BuildContext context) {
    return StarryBackground(
      starColor: Colors.white.withOpacity(0.5),
      numberOfStars: 150,
      child: Scaffold(
        appBar: appBar,
        backgroundColor: Colors.transparent,
        body: child,
      ),
    );
  }
}
