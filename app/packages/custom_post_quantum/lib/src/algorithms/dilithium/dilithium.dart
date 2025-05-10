// packages/custom_post_quantum/lib/src/algorithms/dilithium/dilithium.dart

import 'dart:typed_data';
import 'dart:math';

import 'package:custom_post_quantum/src/algorithms/dilithium/abstractions/dilithium_private_key.dart';
import 'package:custom_post_quantum/src/algorithms/dilithium/abstractions/dilithium_public_key.dart';
import 'package:custom_post_quantum/src/algorithms/dilithium/abstractions/dilithium_signature.dart';
import 'package:custom_post_quantum/src/algorithms/dilithium/generators/dilithium_key_generator.dart';
import 'package:custom_post_quantum/src/core/factories/polynomial_factory.dart';
import 'package:custom_post_quantum/src/core/ntt/ntt_helper_dilithium.dart';
import 'package:custom_post_quantum/src/core/observer/null_step_observer.dart';
import 'package:custom_post_quantum/src/core/observer/step_observer.dart';
import 'package:custom_post_quantum/src/core/polynomials/polynomial_ring.dart';
import 'package:custom_post_quantum/src/core/polynomials/polynomial_ring_matrix.dart';
import 'package:hashlib/hashlib.dart';

/// Fills a buffer with cryptographically‐secure random bytes.
Uint8List randomBytes(int length) {
  final rnd = Random.secure();
  return Uint8List.fromList(
      List<int>.generate(length, (_) => rnd.nextInt(256))
  );
}

class Dilithium {
  int n, q, d, k, l, omega, gamma1, gamma2, beta;
  final DilithiumKeyGenerator keyGenerator;
  final PolynomialFactory polyFactory;

  Dilithium({
    required this.n,
    required this.q,
    required this.d,
    required this.k,
    required this.l,
    required int eta,
    required int etaBound,
    required int tau,
    required this.omega,
    required this.gamma1,
    required this.gamma2,
  })  : beta = tau * eta,
        polyFactory = PolynomialFactory(n: n, q: q, helper: DilithiumNTTHelper()),
        keyGenerator = DilithiumKeyGenerator(
          n: n,
          q: q,
          d: d,
          k: k,
          l: l,
          eta: eta,
          etaBound: etaBound,
          tau: tau,
          gamma1: gamma1,
        );

  factory Dilithium.level2() => Dilithium(
    n: 256,
    q: 8380417,
    d: 13,
    k: 4,
    l: 4,
    eta: 2,
    etaBound: 15,
    tau: 39,
    omega: 80,
    gamma1: 131072,
    gamma2: 95232,
  );
  factory Dilithium.level3() => Dilithium(
    n: 256,
    q: 8380417,
    d: 13,
    k: 6,
    l: 5,
    eta: 4,
    etaBound: 9,
    tau: 49,
    omega: 55,
    gamma1: 524288,
    gamma2: 261888,
  );
  factory Dilithium.level5() => Dilithium(
    n: 256,
    q: 8380417,
    d: 13,
    k: 8,
    l: 7,
    eta: 2,
    etaBound: 15,
    tau: 60,
    omega: 75,
    gamma1: 524288,
    gamma2: 261888,
  );

  Uint8List _h(Uint8List msg, int out) => shake256.of(out).convert(msg).bytes;

  Uint8List _join(Uint8List A, Uint8List B) {
    final b = BytesBuilder();
    b.add(A);
    b.add(B);
    return b.toBytes();
  }

  int _reduceModulus(int x, int a) {
    var r = x % a;
    if (r > (a >> 1)) r -= a;
    return r;
  }

  (int, int) _decompose(int r, int alpha, int q) {
    r %= q;
    final r0 = _reduceModulus(r, alpha);
    var r1 = r - r0;
    if (r1 == q - 1) return (0, r0 - 1);
    r1 ~/= alpha;
    return (r1, r0);
  }

  PolynomialMatrix _makeHint(
      PolynomialMatrix v1, PolynomialMatrix v2, int alpha) {
    if (v1.shape != v2.shape) throw ArgumentError('Shape mismatch');
    final rows = v1.rows, cols = v1.columns;
    final hints = <PolynomialRing>[];
    for (var i = 0; i < rows * cols; i++) {
      final p1 = v1.polynomials[i], p2 = v2.polynomials[i];
      if (p1.n != p2.n) throw StateError('n mismatch');
      final coefs = <int>[];
      for (var j = 0; j < p1.n; j++) {
        final z0 = p1.coefficients[j], r1 = p2.coefficients[j];
        final half = alpha >> 1;
        final hint = (z0 <= half || z0 > q - half || (z0 == q - half && r1 == 0)) ? 0 : 1;
        coefs.add(hint);
      }
      hints.add(polyFactory.ring(coefs));
    }
    return polyFactory.matrix(hints, rows, cols);
  }

  int _sumHint(PolynomialMatrix hint) =>
      hint.polynomials.fold(0, (sum, poly) => sum + poly.coefficients.fold(0, (s, c) => s + c));

  PolynomialMatrix _useHint(
      PolynomialMatrix v1, PolynomialMatrix v2, int alpha) {
    if (v1.shape != v2.shape) throw ArgumentError('Shape mismatch');
    final rows = v1.rows, cols = v1.columns;
    final out = <PolynomialRing>[];
    for (var i = 0; i < rows * cols; i++) {
      final p1 = v1.polynomials[i], p2 = v2.polynomials[i];
      if (p1.n != p2.n) throw StateError('n mismatch');
      final coefs = <int>[];
      for (var j = 0; j < p1.n; j++) {
        final h = p1.coefficients[j], r = p2.coefficients[j];
        final (r1, r0) = _decompose(r, alpha, q);
        final m = (q - 1) ~/ alpha;
        coefs.add(h != 1 ? r1 : (r0 <= 0 ? (r1 - 1) % m : (r1 + 1) % m));
      }
      out.add(polyFactory.ring(coefs));
    }
    return polyFactory.matrix(out, rows, cols);
  }

  (DilithiumPublicKey, DilithiumPrivateKey) generateKeys(Uint8List seed,
      {StepObserver observer = const NullStepObserver()}) {
    if (seed.length != 32) throw ArgumentError('Seed must be 32 bytes');
    final sb = _h(seed, 128);
    final rho = sb.sublist(0, 32),
        rhoP = sb.sublist(32, 96),
        K = sb.sublist(96);
    final A = keyGenerator.expandA(rho, isNtt: true);
    final (s1, s2) = keyGenerator.expandS(rhoP);
    final t = A.multiply(s1.copy().toNtt()).fromNtt().plus(s2);
    final (t1, t0) = t.power2Round(d);
    final pk = DilithiumPublicKey(rho, t1), tr = _h(pk.serialize(), 32);
    return (pk, DilithiumPrivateKey(rho, K, tr, s1, s2, t0));
  }

  Uint8List sign(DilithiumPrivateKey sk, Uint8List msg,
      {bool randomized = false, StepObserver observer = const NullStepObserver()}) {
    final A = keyGenerator.expandA(sk.rho, isNtt: true);
    final mu = _h(_join(sk.tr, msg), 64);
    var kappa = 0;
    final rhoP = randomized ? randomBytes(64) : _h(_join(sk.K, mu), 64);

    // yHat in NTT
    final yHat = keyGenerator.expandMask(rhoP, kappa).copy().toNtt();
    kappa += l;

    // Compute w
    final w = A.multiply(yHat).fromNtt();
    final (w1, w0) = w.decompose(gamma2 << 1);

    final w1Bytes = _serializeW(w1);
    final cTilde = _h(_join(mu, w1Bytes), 32);
    final c = keyGenerator.sampleInBall(cTilde)..toNtt();

    // z: ensure addition in NTT, then back to normal
    final s1Hat = sk.s1.copy().toNtt();
    final zNtt = yHat.plus(s1Hat.scale(c)); // both NTT
    final z = zNtt.fromNtt();               // normal
    if (z.checkNormBound(gamma1 - beta)) {
      // retry loop would continue here…
    }

    // hint: subtraction and addition in normal domain
    final s2Scaled = sk.s2.copy().toNtt().scale(c).fromNtt();
    final t0Scaled = sk.t0.copy().toNtt().scale(c).fromNtt();
    final diff = w0.minus(s2Scaled).plus(t0Scaled);
    final hint = _makeHint(diff, w1, gamma2 << 1);

    return DilithiumSignature(cTilde, z, hint).serialize();
  }

  bool verify(DilithiumPublicKey pk, Uint8List msg, Uint8List sigBytes,
      {StepObserver observer = const NullStepObserver()}) {
    final sig = DilithiumSignature.deserialize(sigBytes, 2);
    if (_sumHint(sig.h) > omega) return false;
    if (sig.z.checkNormBound(gamma1 - beta)) return false;

    final A = keyGenerator.expandA(pk.rho, isNtt: true);
    final tr = _h(pk.serialize(), 32);
    final mu = _h(_join(tr, msg), 64);
    final c = keyGenerator.sampleInBall(sig.cTilde)..toNtt();
    final zHat = sig.z.copy().toNtt();
    final t1Hat = pk.t1.copy().scaleInt(1 << d)..toNtt();

    final wPrime = A.multiply(zHat).minus(t1Hat.scale(c)).fromNtt();
    final wBytes = _serializeW(wPrime);
    return _hashesMatch(sig.cTilde, _h(_join(mu, wBytes), 32));
  }

  Uint8List _serializeW(PolynomialMatrix w) {
    if (gamma2 == 95232) return w.serialize(6);
    if (gamma2 == 261888) return w.serialize(4);
    throw ArgumentError('Unexpected gamma2');
  }

  bool _hashesMatch(Uint8List h1, Uint8List h2) {
    if (h1.length != h2.length) return false;
    for (var i = 0; i < h1.length; i++) if (h1[i] != h2[i]) return false;
    return true;
  }
}
