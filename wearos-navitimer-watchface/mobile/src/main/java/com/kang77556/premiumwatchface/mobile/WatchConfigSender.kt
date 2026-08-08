package com.kang77556.premiumwatchface.mobile

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.tasks.await

class WatchConfigSender(private val context: Context) {
    suspend fun send(config: WatchConfig): Result<Unit> = runCatching {
        val request = PutDataMapRequest.create(WatchConfig.PATH).apply {
            dataMap.putInt(WatchConfig.KEY_VERSION, config.version)
            dataMap.putString(WatchConfig.KEY_STYLE, config.style)
            dataMap.putBoolean(WatchConfig.KEY_AOD, config.aod)
            dataMap.putLong("updated_at", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context).putDataItem(request).await()
    }
}
