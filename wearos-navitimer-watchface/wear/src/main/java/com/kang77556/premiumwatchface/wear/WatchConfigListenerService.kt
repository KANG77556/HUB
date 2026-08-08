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
            val styleId = map.getString(WatchConfig.KEY_STYLE_ID) ?: WatchConfig.DEFAULT_STYLE_ID
            val aodEnabled = map.getBoolean(WatchConfig.KEY_AOD_ENABLED, WatchConfig.DEFAULT_AOD_ENABLED)

            getSharedPreferences("watch_config", MODE_PRIVATE)
                .edit()
                .putString(WatchConfig.KEY_STYLE_ID, styleId)
                .putBoolean(WatchConfig.KEY_AOD_ENABLED, aodEnabled)
                .apply()
        }
    }
}
