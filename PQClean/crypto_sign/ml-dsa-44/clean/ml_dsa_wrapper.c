// ml_dsa_wrapper.c

#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "api.h"  // from PQClean/crypto_sign/ml-dsa-44/clean/api.h

// these externs ensure the wasm heap symbols get pulled in
__attribute__((used)) extern unsigned char __heap_base;
__attribute__((used)) extern unsigned char __data_end;

// This is the function you’ll call as Module._verify(ptrPub, ptrMsg, ptrSig)
int verify(const uint8_t *pk,
           const uint8_t *msg,
           const uint8_t *sig)
{
    // PQCLEAN_MLDSA44_CLEAN_CRYPTO_BYTES is the fixed signature length
    return PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify(
            sig,
            PQCLEAN_MLDSA44_CLEAN_CRYPTO_BYTES,
            msg,
            16,            // our challenge is always 16 bytes
            pk
    );
}

// simple wrappers so you can malloc/free from JS
void* malloc_wrapper(size_t size) {
    return malloc(size);
}

void free_wrapper(void* ptr) {
    free(ptr);
}


// TO COMPILE:
/*
# 1) Enter your emsdk install and activate it
        cd ~/Serverless-Passkey/emsdk
        source ./emsdk_env.sh

# 2) Go to the PQClean ML-DSA44 “clean” folder
        cd ~/Serverless-Passkey/PQClean/crypto_sign/ml-dsa-44/clean

# 3) Compile all of the .c files (except your wrapper) plus your ml_dsa_wrapper.c into JS+WASM
        emcc ml_dsa_wrapper.c $(ls *.c | grep -v ml_dsa_wrapper.c) \
  -I. -Os \
  -s WASM=1 \
  -s MODULARIZE=0 \
  -s EXPORT_NAME="Module" \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s EXPORTED_FUNCTIONS="['_verify','_malloc','_free']" \
  -s EXPORTED_RUNTIME_METHODS="['ccall','cwrap']" \
  --no-entry \
  -o ml_dsa.js

# 4) Copy the outputs into your React app’s public folder so the browser can load them
        cp ml_dsa.js /path/to/your/react-app/public/ml_dsa.js
        cp ml_dsa.wasm /path/to/your/react-app/public/ml_dsa.wasm
*/