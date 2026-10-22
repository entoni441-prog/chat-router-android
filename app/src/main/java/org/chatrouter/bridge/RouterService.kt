package org.chatrouter.bridge

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder

class RouterService : Service() {
    private var router: RouterServer? = null
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel("router_service", "Chat Router connection", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val notification = Notification.Builder(this, "router_service")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Chat Router active")
            .setContentText("Local read-only MCP server")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        startForeground(1001, notification)
        router = RouterServer(applicationContext)
        router?.start()
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY
    override fun onDestroy() {
        router?.stop()
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
}
