(() => {
  let dilithium = null;

  (async () => {
    console.log('⏳ Loading dilithium.wasm...');
    const wasmResponse = await fetch('/dilithium.wasm');
    const wasmBuffer = await wasmResponse.arrayBuffer();

    const module = await WebAssembly.instantiate(wasmBuffer, {
      env: {
        memory: new WebAssembly.Memory({ initial: 256 }),
        abort: () => {
          throw new Error('WASM abort called');
        }
      }
    });

    dilithium = module.instance.exports;
    console.log('✅ dilithium.wasm loaded');

    window.ml_dsa44 = {
      deserializePublicKey: async (rawBytes) => {
        if (!(rawBytes instanceof Uint8Array)) {
          throw new Error('Expected Uint8Array for deserializePublicKey');
        }
        return rawBytes;
      },

      verify: async (publicKey, message, signature) => {
        if (!dilithium) throw new Error('WASM module not initialized');

        const pubKeyPtr = dilithium.malloc(1312);
        const msgPtr    = dilithium.malloc(message.length);
        const sigPtr    = dilithium.malloc(signature.length);

        const mem = new Uint8Array(dilithium.memory.buffer);
        mem.set(publicKey, pubKeyPtr);
        mem.set(message, msgPtr);
        mem.set(signature, sigPtr);

        const result = dilithium.verify(
          msgPtr,
          message.length,
          sigPtr,
          signature.length,
          pubKeyPtr
        );

        dilithium.free(pubKeyPtr);
        dilithium.free(msgPtr);
        dilithium.free(sigPtr);

        return result === 1;
      }
    };

    console.log('✅ ml-dsa.js loaded and ml_dsa44 API ready');
  })();
})();
