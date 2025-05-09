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
import android.os.Bundle
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import android.widget.Toast
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.UUID

class MainActivity : FlutterFragmentActivity() {
  companion object {
    private const val CHANNEL = "native_ble_plugin"
    private const val REQ_PERMS = 100
  }

  private lateinit var methodChannel: MethodChannel
  private var bluetoothManager: BluetoothManager?    = null
  private var bluetoothAdapter: BluetoothAdapter?    = null
  private var advertiser: BluetoothLeAdvertiser?     = null
  private var gattServer: BluetoothGattServer?       = null

  // your service & characteristic UUIDs
  private val SERVICE_UUID        = UUID.fromString("0000feed-0000-1000-8000-00805f9b34fb")
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
        else -> result.notImplemented()
      }
    }
  }

  private fun requiredBlePerms(): Array<String> {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      arrayOf(
        Manifest.permission.BLUETOOTH_ADVERTISE,
        Manifest.permission.BLUETOOTH_CONNECT
      )
    } else {
      emptyArray()
    }
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
      // already have them
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
    if (requestCode == REQ_PERMS) {
      if (hasBlePerms()) {
        startBleServer()
      } else {
        Toast.makeText(
          this,
          "BLE permissions are required to advertise. Please enable them in Settings.",
          Toast.LENGTH_LONG
        ).show()
      }
    }
  }

  private fun startBleServer() {
    try {
      bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      bluetoothAdapter = bluetoothManager?.adapter
      advertiser       = bluetoothAdapter?.bluetoothLeAdvertiser

      if (advertiser == null) {
        Log.e("BLE", "This device does not support BLE advertising")
        return
      }

      val charWrite = BluetoothGattCharacteristic(
        CHARACTERISTIC_UUID,
        BluetoothGattCharacteristic.PROPERTY_WRITE,
        BluetoothGattCharacteristic.PERMISSION_WRITE
      )
      val service = BluetoothGattService(
        SERVICE_UUID,
        BluetoothGattService.SERVICE_TYPE_PRIMARY
      ).apply { addCharacteristic(charWrite) }

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
          gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
          val b64 = Base64.encodeToString(value, Base64.NO_WRAP)
          Log.i("BLE", "Received (base64): $b64")
          runOnUiThread {
            methodChannel.invokeMethod("challengeReceived", b64)
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

      advertiser!!.startAdvertising(settings, data, object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
          Log.i("BLE", "Advertising started (service=$SERVICE_UUID)")
        }
        override fun onStartFailure(errorCode: Int) {
          Log.e("BLE", "Advertising failed: $errorCode")
        }
      })

    } catch (e: SecurityException) {
      Log.e("BLE", "Missing BLE permission", e)
      requestBlePermissions()
    } catch (e: Exception) {
      Log.e("BLE", "startBleServer error", e)
    }
  }

  private fun stopBleServer() {
    try {
      advertiser?.stopAdvertising(object : AdvertiseCallback() {})
      gattServer?.close()
      Log.i("BLE", "Advertising stopped")
    } catch (e: Exception) {
      Log.e("BLE", "stopBleServer error", e)
    }
  }

  override fun onDestroy() {
    stopBleServer()
    super.onDestroy()
  }
}
