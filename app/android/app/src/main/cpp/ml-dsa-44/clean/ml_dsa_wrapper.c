#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "api.h"

__attribute__((used)) extern unsigned char __heap_base;
__attribute__((used)) extern unsigned char __data_end;

int verify(const uint8_t *pk, const uint8_t *msg, const uint8_t *sig) {
    return PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify(
            sig, PQCLEAN_MLDSA44_CLEAN_CRYPTO_BYTES,
            msg, 16,
            pk
    );
}

void* malloc_wrapper(size_t size) {
    return malloc(size);
}

void free_wrapper(void* ptr) {
    free(ptr);
}


//cd /Users/hamzariaz/VSCODE/IS/Serverless-Passkey/emsdk
// source ./emsdk_env.sh

// cd /Users/hamzariaz/VSCODE/IS/Serverless-Passkey/PQClean/crypto_sign/ml-dsa-44/clean

// emcc ml_dsa_wrapper.c $(ls *.c | grep -v ml_dsa_wrapper.c) \
//  -I. -Os \
//  -s WASM=1 \
//  -s MODULARIZE=0 \
//  -s EXPORT_NAME="Module" \
//  -s INITIAL_MEMORY=64MB \
//  -s ALLOW_MEMORY_GROWTH=1 \
//  -s EXPORTED_FUNCTIONS="['_verify','_malloc','_free']" \
//  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
//  --no-entry \
//  -o ml_dsa_original.js