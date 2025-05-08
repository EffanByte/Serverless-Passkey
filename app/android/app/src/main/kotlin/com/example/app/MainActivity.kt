package com.example.app

import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.*

class MainActivity : FlutterFragmentActivity() {
  private val CHANNEL = "native_ble_plugin"
  private lateinit var methodChannel: MethodChannel

  private var bluetoothManager: BluetoothManager? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var advertiseCallback: AdvertiseCallback? = null
  private var gattServer: BluetoothGattServer? = null
  private var lastDevice: BluetoothDevice? = null

  private val SERVICE_UUID     = UUID.fromString("0000feed-0000-1000-8000-00805f9b34fb")
  private val WRITE_CHAR_UUID  = UUID.fromString("0000beef-0000-1000-8000-00805f9b34fb")
  private val NOTIFY_CHAR_UUID = UUID.fromString("0000cafe-0000-1000-8000-00805f9b34fb")
  private val PUBKEY_CHAR_UUID = UUID.fromString("0000f00d-0000-1000-8000-00805f9b34fb")
  private var latestUncompressedPubKey: ByteArray? = null

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)

    methodChannel.setMethodCallHandler { call, result ->
      when (call.method) {
        "startAdvertising" -> {
          startBleServer()
          result.success(null)
        }
        "stopAdvertising" -> {
          stopBleServer()
          result.success(null)
        }
        "sendSignature" -> {
          val b64sig = call.arguments as String
          sendSignatureToCentral(b64sig)
          result.success(null)
        }
        "updatePublicKey" -> {
          val base64 = call.arguments as? String
          if (base64.isNullOrBlank()) {
            Log.e("BLE", "⚠️ updatePublicKey: Empty or null base64 string")
            result.error("InvalidBase64", "Base64 string was null or empty", null)
          } else {
            try {
              latestUncompressedPubKey = Base64.decode(base64, Base64.NO_WRAP)
              Log.i("BLE", "🔐 Public key updated (${latestUncompressedPubKey?.size ?: 0} bytes)")
              result.success(null)
            } catch (e: IllegalArgumentException) {
              Log.e("BLE", "Base64 decode failed: $e")
              result.error("InvalidBase64", "Failed to decode public key: ${e.message}", null)
            }
          }
        }
        else -> result.notImplemented()
      }
    }
  }

  private fun startBleServer() {
    bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    val adapter = bluetoothManager!!.adapter
    advertiser = adapter.bluetoothLeAdvertiser

    val writeChar = BluetoothGattCharacteristic(
      WRITE_CHAR_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    )

    val notifyChar = BluetoothGattCharacteristic(
      NOTIFY_CHAR_UUID,
      BluetoothGattCharacteristic.PROPERTY_NOTIFY,
      BluetoothGattCharacteristic.PERMISSION_READ
    ).apply {
      addDescriptor(
        BluetoothGattDescriptor(
          UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
          BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
        )
      )
    }

    val pubKeyChar = BluetoothGattCharacteristic(
      PUBKEY_CHAR_UUID,
      BluetoothGattCharacteristic.PROPERTY_READ,
      BluetoothGattCharacteristic.PERMISSION_READ
    )

    val service = BluetoothGattService(
      SERVICE_UUID,
      BluetoothGattService.SERVICE_TYPE_PRIMARY
    ).apply {
      addCharacteristic(writeChar)
      addCharacteristic(notifyChar)
      addCharacteristic(pubKeyChar)
    }

    gattServer = bluetoothManager!!.openGattServer(this, object : BluetoothGattServerCallback() {
      override fun onCharacteristicWriteRequest(
        device: BluetoothDevice,
        requestId: Int,
        characteristic: BluetoothGattCharacteristic,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray
      ) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
        lastDevice = device
        val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
        runOnUiThread {
          methodChannel.invokeMethod("challengeReceived", b64)
        }
      }

      override fun onDescriptorWriteRequest(
        device: BluetoothDevice,
        requestId: Int,
        descriptor: BluetoothGattDescriptor,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray
      ) {
        gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
      }

      override fun onCharacteristicReadRequest(
        device: BluetoothDevice,
        requestId: Int,
        offset: Int,
        characteristic: BluetoothGattCharacteristic
      ) {
        if (characteristic.uuid == PUBKEY_CHAR_UUID) {
          val payload = latestUncompressedPubKey ?: ByteArray(0)
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, payload)
          Log.i("BLE", "Replied public key to central")
        } else {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
        }
      }
    })

    gattServer?.addService(service)

    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .setConnectable(true)
      .build()

    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(true)
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .build()

    advertiseCallback = object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
        Log.i("BLE", "Advertising started")
      }

      override fun onStartFailure(errorCode: Int) {
        Log.e("BLE", "Advertising failed: $errorCode")
      }
    }

    advertiser?.startAdvertising(settings, data, advertiseCallback)
  }

  private fun stopBleServer() {
    advertiseCallback?.let {
      advertiser?.stopAdvertising(it)
      advertiseCallback = null
    }
    gattServer?.close()
    gattServer = null
    Log.i("BLE", "BLE server stopped")
  }

  private fun sendSignatureToCentral(b64sig: String) {
    val sigBytes = Base64.decode(b64sig, Base64.NO_WRAP)
    lastDevice?.let { device ->
      Handler(Looper.getMainLooper()).post {
        val charac = gattServer
          ?.getService(SERVICE_UUID)
          ?.getCharacteristic(NOTIFY_CHAR_UUID)
        charac?.value = sigBytes
        gattServer?.notifyCharacteristicChanged(device, charac, false)
        Log.i("BLE", "Signature notified to central")
      }
    }
  }
}
