package com.example.app

import android.Manifest
import android.bluetooth.*
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.util.UUID
import org.json.JSONObject
import java.nio.ByteBuffer


class MainActivity : FlutterFragmentActivity() {
  companion object {
    private const val CHANNEL = "native_ble_plugin"
    private const val REQ_PERMS = 100
  }

  private lateinit var advertiseSettings: AdvertiseSettings
  private lateinit var advertiseData: AdvertiseData
  private lateinit var methodChannel: MethodChannel
  private lateinit var advertiseCallback: AdvertiseCallback


  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var gattServer: BluetoothGattServer? = null
  private var pkcsChar: BluetoothGattCharacteristic? = null
  private var lastDevice: BluetoothDevice? = null

  // Service and characteristic UUID
  private val SERVICE_UUID = UUID.fromString("0000feed-0000-1000-8000-00805f9b34fb")
  private val CHARACTERISTIC_UUID = UUID.fromString("0000beef-0000-1000-8000-00805f9b34fb")

  override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
    super.configureFlutterEngine(flutterEngine)
    methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)

    methodChannel.setMethodCallHandler { call, result ->
      when (call.method) {
        "startAdvertising" -> {
          requestBlePermissions()
          result.success(null)
        }

        "stopAdvertising" -> {
          stopBleServer()
          result.success(null)
        }

        "sendSignature" -> {
          val b64Sig = call.arguments as String
          val sigBytes = Base64.decode(b64Sig, Base64.NO_WRAP)
          lastDevice?.let { device ->
            pkcsChar?.let { charac ->
              gattServer?.notifyCharacteristicChanged(device, charac, false, sigBytes)
              Log.i("BLE", "Signature notified (${sigBytes.size} bytes)")
            }
          }
          // 2) Immediately stop advertising & close GATT
          stopBleServer()
          // 3) Tell Flutter we’ve disconnected
          runOnUiThread {
            methodChannel.invokeMethod("disconnected", null)
          }
          result.success(null)
        }

        "sendPublicKey" -> {
          val json = call.arguments as String
          val jsonBytes = json.toByteArray(Charsets.UTF_8)
          lastDevice?.let { device ->
            pkcsChar?.let { charac ->
              gattServer?.notifyCharacteristicChanged(device, charac, false, jsonBytes)
              Log.i("BLE", "Public key JSON notified (${jsonBytes.size} bytes)")
            }
          }

          // NEW: Immediately tell Flutter to send device name
          val deviceName = bluetoothAdapter?.name ?: Build.MODEL ?: "Unknown"
          runOnUiThread {
            methodChannel.invokeMethod("sendDeviceNameRequest", deviceName)
          }

          result.success(null)
        }


        "sendDeviceName" -> {
          val jsonStr = call.arguments as String
          val jsonObj = JSONObject(jsonStr)
          val nameBytes = jsonObj.getString("name").toByteArray(Charsets.UTF_8)
          val sigBytes = Base64.decode(jsonObj.getString("signature"), Base64.NO_WRAP)

          val full = ByteBuffer.allocate(nameBytes.size + sigBytes.size)
            .put(nameBytes)
            .put(sigBytes)
            .array()

          lastDevice?.let { device ->
            pkcsChar?.let { charac ->
              gattServer?.notifyCharacteristicChanged(device, charac, false, full)
              Log.i("BLE", "Device name + signature sent (${full.size} bytes)")
            }
          }
          result.success(null)
        }


        else -> result.notImplemented()
      }
    }
  }

  private fun requiredBlePerms(): Array<String> =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT
      )
    } else {
      emptyArray()
    }

  private fun hasBlePerms(): Boolean =
    requiredBlePerms().all {
      ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
    }

  private fun requestBlePermissions() {
    val missing = requiredBlePerms().filter {
      ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    if (missing.isEmpty()) {
      startBleServer()
    } else {
      ActivityCompat.requestPermissions(this, missing.toTypedArray(), REQ_PERMS)
    }
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQ_PERMS && hasBlePerms()) {
      startBleServer()
    } else {
      Toast.makeText(
        this,
        "BLE permissions are required to advertise. Please enable them in Settings.",
        Toast.LENGTH_LONG
      ).show()
    }
  }

  private fun startBleServer() {
    try {
      // 1) Grab BLE manager, adapter, advertiser
      bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      bluetoothAdapter = bluetoothManager?.adapter
      advertiser = bluetoothAdapter?.bluetoothLeAdvertiser

      if (advertiser == null) {
        Log.e("BLE", "This device does not support BLE advertising")
        return
      }

      // 2) Build characteristic + CCC descriptor
      pkcsChar = BluetoothGattCharacteristic(
        CHARACTERISTIC_UUID,
        BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
        BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
      )
      val cccd = BluetoothGattDescriptor(
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
        BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
      )
      pkcsChar?.addDescriptor(cccd)

      // 3) Create and add the primary service
      val service = BluetoothGattService(
        SERVICE_UUID,
        BluetoothGattService.SERVICE_TYPE_PRIMARY
      ).apply {
        addCharacteristic(pkcsChar)
      }
      gattServer = bluetoothManager?.openGattServer(this, object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
          super.onConnectionStateChange(device, status, newState)
          when (newState) {
            BluetoothProfile.STATE_CONNECTED -> {
              lastDevice = device
              Log.i("BLE", "Device connected: ${device.address}")
              runOnUiThread { methodChannel.invokeMethod("connectionEstablished", null) }
            }

            BluetoothProfile.STATE_DISCONNECTED -> {
              Log.i("BLE", "Device disconnected: ${device.address}")
              lastDevice = null
              // Restart advertising so we remain discoverable
              //advertiser?.startAdvertising(advertiseSettings, advertiseData, advertiseCallback)
              runOnUiThread { methodChannel.invokeMethod("disconnected", null) }
            }
          }
        }

        override fun onCharacteristicWriteRequest(
          device: BluetoothDevice,
          requestId: Int,
          charac: BluetoothGattCharacteristic,
          preparedWrite: Boolean,
          responseNeeded: Boolean,
          offset: Int,
          value: ByteArray
        ) {
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
          lastDevice = device
          val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
          Log.i("BLE", "Challenge received: $b64")
          runOnUiThread { methodChannel.invokeMethod("challengeReceived", b64) }
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
          if (descriptor.uuid == UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")) {
            descriptor.value = value
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            Log.i("BLE", "CCCD written: ${value.contentToString()}")
            runOnUiThread { methodChannel.invokeMethod("subscribed", null) }
          } else {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
          }
        }
      })
      gattServer?.addService(service)

      // 4) Prepare advertising parameters once
      advertiseSettings = AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
        .setConnectable(true)
        .build()

      advertiseData = AdvertiseData.Builder()
        .setIncludeDeviceName(true)
        .addServiceUuid(ParcelUuid(SERVICE_UUID))
        .build()

      advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
          Log.i("BLE", "Advertising started (service=$SERVICE_UUID)")
        }

        override fun onStartFailure(errorCode: Int) {
          Log.e("BLE", "Advertising failed: $errorCode")
        }
      }

      // 5) Start advertising
      advertiser?.startAdvertising(advertiseSettings, advertiseData, advertiseCallback)

    } catch (e: SecurityException) {
      Log.e("BLE", "Missing BLE permission", e)
      requestBlePermissions()
    } catch (e: Exception) {
      Log.e("BLE", "startBleServer error", e)
    }
  }

  private fun stopBleServer() {
    try {
      advertiser?.stopAdvertising(advertiseCallback)
      gattServer?.close()
      Log.i("BLE", "Advertising & GATT server stopped")
    } catch (e: Exception) {
      Log.e("BLE", "stopBleServer error", e)
    }
  }

  override fun onDestroy() {
    // Clean up BLE when the Activity is destroyed
    stopBleServer()
    super.onDestroy()
  }

  override fun onPause() {
    super.onPause()
    Log.i("BLE", "Activity paused — stopping BLE server")
    stopBleServer()
    // Tell Flutter we’ve disconnected
    runOnUiThread {
      methodChannel.invokeMethod("disconnected", null)
    }
  }
}