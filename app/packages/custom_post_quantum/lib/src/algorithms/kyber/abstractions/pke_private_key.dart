import 'dart:convert';
import 'dart:typed_data';

import 'package:custom_post_quantum/src/core/ntt/ntt_helper_kyber.dart';
import 'package:custom_post_quantum/src/core/polynomials/polynomial_ring.dart';
import 'package:custom_post_quantum/src/core/polynomials/polynomial_ring_matrix.dart';

class PKEPrivateKey {

  // ------------ CONSTRUCTORS ------------
  factory PKEPrivateKey(PolynomialMatrix s){
    return PKEPrivateKey._internal(s);
  }

  factory PKEPrivateKey.deserialize(Uint8List byteArray, int kyberVersion) {
    var s = PolynomialMatrix.deserialize(
        byteArray, kyberVersion, 1, 12, 256, 3329,
        isNtt: true, helper: KyberNTTHelper(), modulusType: Modulus.centered);
    return PKEPrivateKey._internal(s);
  }

  PKEPrivateKey._internal(this.s);



  // ------------ INSTANCE VARIABLES ------------
  PolynomialMatrix s;



  // ------------ PUBLIC API ------------

  String get base64 => base64Encode(serialize());

  Uint8List serialize() {
    return s.serialize(12);
  }

  @override
  bool operator ==(covariant PKEPrivateKey other) {
    return s == other.s;
  }
}