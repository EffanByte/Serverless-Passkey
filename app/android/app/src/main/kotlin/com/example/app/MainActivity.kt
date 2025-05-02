package com.example.app

import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.UUID

class MainActivity : FlutterFragmentActivity() {
  private val CHANNEL = "native_ble_plugin"
  private lateinit var methodChannel: MethodChannel

  // BLE objects
  private var bluetoothManager: BluetoothManager?       = null
  private var bluetoothAdapter: BluetoothAdapter?       = null
  private var advertiser: BluetoothLeAdvertiser?        = null
  private var advertiseCallback: AdvertiseCallback?     = null
  private var gattServer: BluetoothGattServer?          = null
  private var lastDevice: BluetoothDevice?              = null

  // UUIDs
  private val SERVICE_UUID       = UUID.fromString("0000feed-0000-1000-8000-00805f9b34fb")
  private val WRITE_CHAR_UUID    = UUID.fromString("0000beef-0000-1000-8000-00805f9b34fb")
  private val NOTIFY_CHAR_UUID   = UUID.fromString("0000cafe-0000-1000-8000-00805f9b34fb")

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
          // Dart will pass us the Base64 signature string
          val b64sig = call.arguments as String
          sendSignatureToCentral(b64sig)
          result.success(null)
        }
        else -> result.notImplemented()
      }
    }
  }

private fun startBleServer() {
  // 1) Initialize Bluetooth
  bluetoothManager   = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
  bluetoothAdapter   = bluetoothManager?.adapter
  advertiser         = bluetoothAdapter?.bluetoothLeAdvertiser

  // 2) Define the “challenge” write-only characteristic
  val writeChar = BluetoothGattCharacteristic(
    WRITE_CHAR_UUID,
    BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
    BluetoothGattCharacteristic.PERMISSION_WRITE
  )

  // 3) Define the “signature” notify-only characteristic
  val notifyChar = BluetoothGattCharacteristic(
    NOTIFY_CHAR_UUID,
    BluetoothGattCharacteristic.PROPERTY_NOTIFY,
    BluetoothGattCharacteristic.PERMISSION_READ
  )

  // 4) Add the Client Characteristic Configuration descriptor (0x2902)
  val cccDesc = BluetoothGattDescriptor(
    UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
    BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
  )
  notifyChar.addDescriptor(cccDesc)

  // 5) Build a primary service and attach both characteristics
  val service = BluetoothGattService(
    SERVICE_UUID,
    BluetoothGattService.SERVICE_TYPE_PRIMARY
  ).apply {
    addCharacteristic(writeChar)
    addCharacteristic(notifyChar)
  }

  // 6) Open the GATT server and implement both callbacks
  gattServer = bluetoothManager?.openGattServer(this, object : BluetoothGattServerCallback() {

    /** Called when the central writes the challenge */
    override fun onCharacteristicWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      charac: BluetoothGattCharacteristic,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray
    ) {
      // ACK the write immediately
      gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
      lastDevice = device

      // Forward Base64 challenge into Flutter
      val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
      Log.i("BLE", "Received (base64 challenge): $b64")
      runOnUiThread {
        methodChannel.invokeMethod("challengeReceived", b64)
      }
    }

    /** Called when the central enables/disables notifications (writes to CCC) */
    override fun onDescriptorWriteRequest(
      device: BluetoothDevice,
      requestId: Int,
      descriptor: BluetoothGattDescriptor,
      preparedWrite: Boolean,
      responseNeeded: Boolean,
      offset: Int,
      value: ByteArray
    ) {
      // Always ACK the descriptor write (enable or disable)
      gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
      val enabled = value.contentEquals(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
      Log.i("BLE", "Notifications ${if (enabled) "enabled" else "disabled"} by central")
    }
  })

  // 7) Add the service into the GATT server
  gattServer?.addService(service)

  // 8) Prepare advertising settings & data
  val settings = AdvertiseSettings.Builder()
    .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
    .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
    .setConnectable(true)
    .build()

  val data = AdvertiseData.Builder()
    .setIncludeDeviceName(true)
    .addServiceUuid(ParcelUuid(SERVICE_UUID))
    .build()

  // 9) Create and store a single AdvertiseCallback
  advertiseCallback = object : AdvertiseCallback() {
    override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
      Log.i("BLE", "Advertising started")
    }
    override fun onStartFailure(errorCode: Int) {
      Log.e("BLE", "Advertising failed: $errorCode")
    }
  }

  // 10) Start advertising with that callback
  advertiser?.startAdvertising(settings, data, advertiseCallback)
}

  private fun stopBleServer() {
    // Stop the advertisement with the same callback
    advertiseCallback?.let {
      advertiser?.stopAdvertising(it)
      Log.i("BLE", "stopAdvertising() called")
      advertiseCallback = null
    }
    // Tear down GATT server
    gattServer?.close()
    gattServer = null
    Log.i("BLE", "GATT server closed")
  }

  /**
   * After Flutter signs the challenge, it calls `sendSignature`,
   * passing us Base64. We decode it and notify the central.
   */
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
