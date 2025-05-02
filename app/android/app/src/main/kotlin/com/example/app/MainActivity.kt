package com.example.app

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.UUID

class MainActivity : FlutterFragmentActivity() {    
  // The channel name must match the one in Dart
  private val CHANNEL = "native_ble_plugin"
  private lateinit var methodChannel: MethodChannel

  // Bluetooth objects
  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var gattServer: BluetoothGattServer? = null

  // Your custom UUIDs – feel free to replace
  private val SERVICE_UUID = UUID.fromString("0000feed-0000-1000-8000-00805f9b34fb")
  private val CHARACTERISTIC_UUID =
    UUID.fromString("0000beef-0000-1000-8000-00805f9b34fb")

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)

    // 1) Initialize the MethodChannel
    methodChannel = MethodChannel(
      flutterEngine.dartExecutor.binaryMessenger,
      CHANNEL
    )

    // 2) Handle calls from Dart
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
        else -> result.notImplemented()
      }
    }
  }

  private fun startBleServer() {
    // 3) Get Bluetooth manager & adapter
    bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    bluetoothAdapter = bluetoothManager?.adapter
    advertiser = bluetoothAdapter?.bluetoothLeAdvertiser

    // 4) Build a writable GATT characteristic
    val characteristic = BluetoothGattCharacteristic(
      CHARACTERISTIC_UUID,
      BluetoothGattCharacteristic.PROPERTY_WRITE,
      BluetoothGattCharacteristic.PERMISSION_WRITE
    )

    // 5) Build a primary service & add the characteristic
    val service = BluetoothGattService(
      SERVICE_UUID,
      BluetoothGattService.SERVICE_TYPE_PRIMARY
    ).apply {
      addCharacteristic(characteristic)
    }

    gattServer = bluetoothManager?.openGattServer(this, object : BluetoothGattServerCallback() {
    override fun onCharacteristicWriteRequest(
        device: BluetoothDevice,
        requestId: Int,
        charac: BluetoothGattCharacteristic,
        preparedWrite: Boolean,
        responseNeeded: Boolean,
        offset: Int,
        value: ByteArray
    ) {
        // 1) Acknowledge the write immediately
        gattServer?.sendResponse(
        device,
        requestId,
        BluetoothGatt.GATT_SUCCESS,
        /*offset=*/0,
        /*value=*/null
        )

        // 2) Base64-encode the incoming bytes
        val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
        Log.i("BLE", "Received (base64): $b64")

        // 3) Now switch to the main (UI) thread before invoking Dart
        runOnUiThread {
        methodChannel.invokeMethod("challengeReceived", b64)
        }
    }
    })


    // 8) Add service to the server
    gattServer?.addService(service)

    // 9) Configure advertising settings
    val settings = AdvertiseSettings.Builder()
      .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
      .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
      .setConnectable(true)
      .build()

    // 10) Configure advertise data
    val data = AdvertiseData.Builder()
      .setIncludeDeviceName(true)
      .addServiceUuid(ParcelUuid(SERVICE_UUID))
      .build()

    // 11) Start advertising
    advertiser?.startAdvertising(settings, data, object : AdvertiseCallback() {
      override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
        Log.i("BLE", "Advertising started (service=$SERVICE_UUID)")
      }

      override fun onStartFailure(errorCode: Int) {
        Log.e("BLE", "Advertising failed: $errorCode")
      }
    })
  }

  private fun stopBleServer() {
    advertiser?.stopAdvertising(object : AdvertiseCallback() {})
    gattServer?.close()
    Log.i("BLE", "Advertising stopped")
  }
}
