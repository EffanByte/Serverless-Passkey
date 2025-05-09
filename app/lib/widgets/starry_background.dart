import 'dart:math';
import 'package:flutter/material.dart';

class StarryBackground extends StatefulWidget {
  final Widget child;
  final Color starColor;
  final int numberOfStars;

  const StarryBackground({
    super.key,
    required this.child,
    this.starColor = Colors.white,
    this.numberOfStars = 100,
  });

  @override
  State<StarryBackground> createState() => _StarryBackgroundState();
}

class _StarryBackgroundState extends State<StarryBackground>
    with SingleTickerProviderStateMixin {
  late List<Star> _stars;
  late AnimationController _controller;
  final Random _random = Random();

  @override
  void initState() {
    super.initState();
    _stars = List.generate(
      widget.numberOfStars,
      (index) => Star(
        x: _random.nextDouble(),
        y: _random.nextDouble(),
        size: _random.nextDouble() * 2 + 1,
        opacity: _random.nextDouble() * 0.5 + 0.5,
      ),
    );

    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return CustomPaint(
              painter: StarryPainter(
                stars: _stars,
                starColor: widget.starColor,
                animationValue: _controller.value,
              ),
              size: Size.infinite,
            );
          },
        ),
        widget.child,
      ],
    );
  }
}

class Star {
  final double x;
  final double y;
  final double size;
  final double opacity;

  Star({
    required this.x,
    required this.y,
    required this.size,
    required this.opacity,
  });
}

class StarryPainter extends CustomPainter {
  final List<Star> stars;
  final Color starColor;
  final double animationValue;

  StarryPainter({
    required this.stars,
    required this.starColor,
    required this.animationValue,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint =
        Paint()
          ..color = starColor
          ..style = PaintingStyle.fill;

    for (var star in stars) {
      final opacity = star.opacity * (0.5 + 0.5 * sin(animationValue * 2 * pi));
      paint.color = starColor.withOpacity(opacity);

      canvas.drawCircle(
        Offset(star.x * size.width, star.y * size.height),
        star.size,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(StarryPainter oldDelegate) {
    return oldDelegate.animationValue != animationValue;
  }
}
