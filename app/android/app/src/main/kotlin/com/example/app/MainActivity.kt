// app/android/app/src/main/kotlin/com/example/app/MainActivity.kt
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
import io.flutter.plugin.common.MethodChannel
import java.util.UUID
import kotlin.math.min

class MainActivity : FlutterFragmentActivity() {
  companion object {
    private const val CHANNEL   = "native_ble_plugin"
    private const val REQ_PERMS = 100
  }

  private lateinit var methodChannel: MethodChannel
  private var bluetoothManager: BluetoothManager? = null
  private var bluetoothAdapter: BluetoothAdapter? = null
  private var advertiser: BluetoothLeAdvertiser? = null
  private var gattServer: BluetoothGattServer? = null
  private var pkcsChar: BluetoothGattCharacteristic? = null
  private var lastDevice: BluetoothDevice? = null

  // negotiated MTU size (default 23)
  private var currentMtu: Int = 23

  // BLE service & characteristic UUIDs
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
        "sendSignature" -> {
          val b64Sig = call.arguments as String
          val sigBytes = Base64.decode(b64Sig, Base64.NO_WRAP)
          lastDevice?.let { device ->
            pkcsChar?.let { charac ->
              // split into MTU‐safe chunks, cap at 512 bytes (Android limit)
              val perChunk = min(currentMtu - 3, 512)
              var offset = 0
              while (offset < sigBytes.size) {
                val end = (offset + perChunk).coerceAtMost(sigBytes.size)
                val chunk = sigBytes.copyOfRange(offset, end)
                gattServer?.notifyCharacteristicChanged(device, charac, false, chunk)
                offset = end
              }
              Log.i("BLE", "Signature sent (${sigBytes.size} bytes) in chunks of $perChunk")
            }
          }
          result.success(null)
        }
        "sendPublicKey" -> {
          val json = call.arguments as String
          val jsonBytes = json.toByteArray(Charsets.UTF_8)
          lastDevice?.let { device ->
            pkcsChar?.let { charac ->
              // chunk the JSON to fit within MTU-3 bytes per notification
              val perChunk = min(currentMtu - 3, 512)
              var offset = 0
              while (offset < jsonBytes.size) {
                val end = (offset + perChunk).coerceAtMost(jsonBytes.size)
                val chunk = jsonBytes.copyOfRange(offset, end)
                gattServer?.notifyCharacteristicChanged(device, charac, false, chunk)
                offset = end
              }
              Log.i("BLE", "Public key JSON sent (${jsonBytes.size} bytes) in chunks of $perChunk")
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
        "BLE permissions are required. Please enable them in Settings.",
        Toast.LENGTH_LONG
      ).show()
    }
  }

  private fun startBleServer() {
    try {
      bluetoothManager = getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
      bluetoothAdapter = bluetoothManager?.adapter
      advertiser       = bluetoothAdapter?.bluetoothLeAdvertiser

      if (advertiser == null) {
        Log.e("BLE", "BLE advertising not supported")
        return
      }

      // WRITE & NOTIFY characteristic
      pkcsChar = BluetoothGattCharacteristic(
        CHARACTERISTIC_UUID,
        BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_NOTIFY,
        BluetoothGattCharacteristic.PERMISSION_WRITE or BluetoothGattCharacteristic.PERMISSION_READ
      )

      // CCC descriptor for client subscription
      val cccd = BluetoothGattDescriptor(
        UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"),
        BluetoothGattDescriptor.PERMISSION_READ or BluetoothGattDescriptor.PERMISSION_WRITE
      )
      pkcsChar?.addDescriptor(cccd)

      val service = BluetoothGattService(
        SERVICE_UUID,
        BluetoothGattService.SERVICE_TYPE_PRIMARY
      ).apply {
        addCharacteristic(pkcsChar)
      }

      gattServer = bluetoothManager?.openGattServer(this, object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
          super.onConnectionStateChange(device, status, newState)
          if (newState == BluetoothProfile.STATE_CONNECTED) {
            lastDevice = device
            Log.i("BLE", "Device connected: ${device.address}")
            runOnUiThread {
              methodChannel.invokeMethod("connectionEstablished", null)
            }
          }
        }

        override fun onMtuChanged(device: BluetoothDevice, mtu: Int) {
          super.onMtuChanged(device, mtu)
          currentMtu = mtu
          Log.i("BLE", "MTU changed: $mtu")
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
          val b64Challenge = Base64.encodeToString(value, Base64.NO_WRAP)
          Log.i("BLE", "Challenge received: $b64Challenge")
          runOnUiThread {
            methodChannel.invokeMethod("challengeReceived", b64Challenge)
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
          if (descriptor.uuid == UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")) {
            descriptor.value = value
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null)
            Log.i("BLE", "CCCD written: ${value.contentToString()}")
            runOnUiThread {
              methodChannel.invokeMethod("subscribed", null)
            }
          } else {
            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, 0, null)
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
      Log.e("BLE", "Error starting BLE server", e)
    }
  }

  private fun stopBleServer() {
    try {
      advertiser?.stopAdvertising(object : AdvertiseCallback() {})
      gattServer?.close()
      Log.i("BLE", "BLE server stopped")
    } catch (e: Exception) {
      Log.e("BLE", "Error stopping BLE server", e)
    }
  }

  override fun onDestroy() {
    stopBleServer()
    super.onDestroy()
  }
}
