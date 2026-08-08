package com.kang77556.premiumwatchface.mobile

import android.os.Bundle
import android.widget.Button
import android.widget.Switch
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class MainActivity : AppCompatActivity() {
    private lateinit var status: TextView
    private lateinit var aodSwitch: Switch

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        status = findViewById(R.id.statusText)
        aodSwitch = findViewById(R.id.aodSwitch)
        val prefs = getSharedPreferences("watch_config", MODE_PRIVATE)
        aodSwitch.isChecked = prefs.getBoolean(WatchConfig.KEY_AOD, true)
        findViewById<Button>(R.id.applyButton).setOnClickListener { applySettings() }
        lifecycleScope.launch { refreshConnectionStatus() }
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
                .onFailure { status.text = "Could not send: ${it.message ?: "watch unavailable"}" }
        }
    }

    private suspend fun refreshConnectionStatus() {
        runCatching { Wearable.getNodeClient(this).connectedNodes.await() }
            .onSuccess { nodes -> status.text = if (nodes.isEmpty()) "No connected Wear OS watch" else "Connected: ${nodes.first().displayName}" }
            .onFailure { status.text = "Wear OS connection unavailable" }
    }
}
