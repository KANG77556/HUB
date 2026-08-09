package com.kang77556.premiumwatchface.wear

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

class WatchConfigListenerService : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        dataEvents.forEach { event ->
            if (event.type != DataEvent.TYPE_CHANGED) return@forEach
            val item = event.dataItem
            if (item.uri.path != WatchConfig.PATH) return@forEach

            val map = DataMapItem.fromDataItem(item).dataMap
            val defaults = WatchConfig()
            val version = map.getInt(WatchConfig.KEY_VERSION, defaults.version)
            if (version != defaults.version) return@forEach

            val style = map.getString(WatchConfig.KEY_STYLE) ?: defaults.style
            val aod = map.getBoolean(WatchConfig.KEY_AOD, defaults.aod)

            getSharedPreferences("watch_config", MODE_PRIVATE)
                .edit()
                .putInt(WatchConfig.KEY_VERSION, version)
                .putString(WatchConfig.KEY_STYLE, style)
                .putBoolean(WatchConfig.KEY_AOD, aod)
                .apply()
        }
    }
}
