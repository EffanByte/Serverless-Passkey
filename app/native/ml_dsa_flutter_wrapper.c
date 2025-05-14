// native/ml_dsa_flutter_wrapper.c

#include <stdint.h>
#include <stdlib.h>
#include "api.h"    // from PQClean/crypto_sign/ml-dsa-44/clean/api.h

// 1) Seed→keypair
//    seed:     32 bytes
//    pk_out:   buffer of size PQCLEAN_MLDSA44_CLEAN_CRYPTO_PUBLICKEYBYTES
//    sk_out:   buffer of size PQCLEAN_MLDSA44_CLEAN_CRYPTO_SECRETKEYBYTES
void ml_dsa44_seed_keypair(
        const uint8_t *seed,
        uint8_t *pk_out,
        uint8_t *sk_out
) {
    PQCLEAN_MLDSA44_CLEAN_crypto_sign_seed_keypair(
            pk_out, sk_out, seed
    );
}

// 2) Sign
//    m:        pointer to message
//    mlen:     message length
//    sk:       secret key
//    sig_out:  buffer of size PQCLEAN_MLDSA44_CLEAN_CRYPTO_BYTES
// returns signature length on success (== CRYPTO_BYTES), or -1 on error.
int ml_dsa44_sign(
        const uint8_t *m,
        size_t mlen,
        const uint8_t *sk,
        uint8_t *sig_out
) {
    size_t siglen;
    int ret = PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature(
            sig_out, &siglen,
            m, mlen,
            sk
    );
    return ret == 0 ? (int)siglen : -1;
}

// 3) Verify
//    sig:      signature buffer
//    siglen:   signature length
//    m:        message buffer
//    mlen:     message length
//    pk:       public key
// returns 0 if valid, non-zero if invalid.
int ml_dsa44_verify(
        const uint8_t *sig,
        size_t siglen,
        const uint8_t *m,
        size_t mlen,
        const uint8_t *pk
) {
    return PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify(
            sig, siglen,
            m, mlen,
            pk
    );
}
