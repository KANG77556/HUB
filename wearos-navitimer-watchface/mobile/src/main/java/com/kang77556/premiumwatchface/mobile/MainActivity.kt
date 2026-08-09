package com.kang77556.premiumwatchface.mobile

import android.os.Bundle
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var aodSwitch: Switch
    private lateinit var applyButton: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        runCatching { setContentView(R.layout.activity_main) }
            .onFailure {
                setContentView(android.R.layout.simple_list_item_1)
                findViewById<TextView>(android.R.id.text1).text = "Premium Watch Face\nUI initialization failed: ${it.javaClass.simpleName}"
                return
            }

        status = findViewById(R.id.statusText)
        aodSwitch = findViewById(R.id.aodSwitch)
        applyButton = findViewById(R.id.applyButton)

        val prefs = getSharedPreferences("watch_config", MODE_PRIVATE)
        aodSwitch.isChecked = prefs.getBoolean(WatchConfig.KEY_AOD, true)
        applyButton.setOnClickListener { applySettings() }

        val playServices = GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(this)
        if (playServices != ConnectionResult.SUCCESS) {
            status.text = "Google Play services unavailable on this phone. Preview works, but watch sync is disabled."
            applyButton.isEnabled = false
        } else {
            lifecycleScope.launch { refreshConnectionStatus() }
        }
    }

    private fun applySettings() {
        val config = WatchConfig(aod = aodSwitch.isChecked)
        getSharedPreferences("watch_config", MODE_PRIVATE).edit()
            .putString(WatchConfig.KEY_STYLE, config.style)
            .putBoolean(WatchConfig.KEY_AOD, config.aod)
            .apply()
        status.text = "Sending settings…"
        lifecycleScope.launch {
            WatchConfigSender(this@MainActivity).send(config)
                .onSuccess { status.text = "Settings sent to Galaxy Watch" }
                .onFailure { status.text = "Could not send: ${it.javaClass.simpleName}: ${it.message ?: "watch unavailable"}" }
        }
    }

    private suspend fun refreshConnectionStatus() {
        runCatching { Wearable.getNodeClient(this).connectedNodes.await() }
            .onSuccess { nodes -> status.text = if (nodes.isEmpty()) "No connected Wear OS watch" else "Connected: ${nodes.first().displayName}" }
            .onFailure { status.text = "Wear OS connection unavailable: ${it.javaClass.simpleName}" }
    }
}
