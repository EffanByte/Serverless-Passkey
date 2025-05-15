#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include "ml-dsa-44/clean/api.h"

// 0) Cleanup stub (no persistent state in PQClean)
JNIEXPORT void JNICALL
Java_com_example_app_MainActivity_mlDsa44Cleanup(JNIEnv *env, jclass clazz) {
    // No-op: PQClean ML-DSA-44 is stateless
}


// 1) generateKeypair
JNIEXPORT void JNICALL
Java_com_example_app_MainActivity_mlDsa44GenerateKeypair(
        JNIEnv *env,
        jclass clazz,
        jbyteArray pkArr,
        jbyteArray skArr
) {
    jbyte *pk = (*env)->GetByteArrayElements(env, pkArr, NULL);
    jbyte *sk = (*env)->GetByteArrayElements(env, skArr, NULL);

    // <-- Corrected function name here:
    PQCLEAN_MLDSA44_CLEAN_crypto_sign_keypair(
        (uint8_t*)pk,
        (uint8_t*)sk
    );

    (*env)->ReleaseByteArrayElements(env, pkArr, pk, 0);
    (*env)->ReleaseByteArrayElements(env, skArr, sk, 0);
}

// 2) sign
JNIEXPORT jint JNICALL
Java_com_example_app_MainActivity_mlDsa44Sign(
        JNIEnv *env, jclass clazz,
        jbyteArray msgArr, jint mlen,
        jbyteArray skArr, jbyteArray sigArr
) {
    jbyte *msg = (*env)->GetByteArrayElements(env, msgArr, NULL);
    jbyte *sk  = (*env)->GetByteArrayElements(env, skArr,  NULL);
    jbyte *sig = (*env)->GetByteArrayElements(env, sigArr, NULL);

    size_t siglen;
    int ret = PQCLEAN_MLDSA44_CLEAN_crypto_sign_signature(
        (uint8_t*)sig, &siglen,
        (const uint8_t*)msg, (size_t)mlen,
        (const uint8_t*)sk
    );

    (*env)->ReleaseByteArrayElements(env, msgArr, msg, JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, skArr,  sk,  JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, sigArr, sig, 0);

    return ret == 0 ? (jint)siglen : (jint)-1;
}

// 3) verify
JNIEXPORT jint JNICALL
Java_com_example_app_MainActivity_mlDsa44Verify(
        JNIEnv *env, jclass clazz,
        jbyteArray sigArr, jint siglen,
        jbyteArray msgArr, jint mlen,
        jbyteArray pkArr
) {
    jbyte *sig = (*env)->GetByteArrayElements(env, sigArr, NULL);
    jbyte *msg = (*env)->GetByteArrayElements(env, msgArr, NULL);
    jbyte *pk  = (*env)->GetByteArrayElements(env, pkArr,  NULL);

    int ok = PQCLEAN_MLDSA44_CLEAN_crypto_sign_verify(
        (const uint8_t*)sig, (size_t)siglen,
        (const uint8_t*)msg, (size_t)mlen,
        (const uint8_t*)pk
    );

    (*env)->ReleaseByteArrayElements(env, sigArr, sig, JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, msgArr, msg, JNI_ABORT);
    (*env)->ReleaseByteArrayElements(env, pkArr,  pk,  JNI_ABORT);

    return (jint)ok;
}
