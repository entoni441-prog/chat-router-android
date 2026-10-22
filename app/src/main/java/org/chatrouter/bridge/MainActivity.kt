package org.chatrouter.bridge

import android.app.Activity
import android.os.Bundle
import android.content.pm.PackageManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    private var router: RouterServer? = null
    private lateinit var status: TextView
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(36, 60, 36, 24) }
        layout.addView(TextView(this).apply { text = "Chat Router 1.0.0"; textSize = 25f })
        status = TextView(this).apply { text = "Stopped — localhost only\nNo messages sent"; textSize = 17f; setPadding(0, 28, 0, 28) }
        layout.addView(status)
        layout.addView(Button(this).apply { text = "Start local MCP"; setOnClickListener {
            try {
                startForegroundService(android.content.Intent(this@MainActivity, RouterService::class.java))
                status.text = "Foreground service requested. Local MCP: http://127.0.0.1:8091/mcp"
            } catch (e: Exception) { status.text = "Service start failed: " + e.message }
        } })
        layout.addView(Button(this).apply { text = "Grant Beeper Read Access"; setOnClickListener {
            val permission = "com.beeper.android.permission.READ_PERMISSION"
            if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                status.text = "Beeper read permission already granted"
            } else {
                requestPermissions(arrayOf(permission), 101)
            }
        } })
        layout.addView(Button(this).apply { text = "Grant Beeper Send Access"; setOnClickListener {
            val permission = "com.beeper.android.permission.SEND_PERMISSION"
            if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                status.text = "Beeper send permission granted. Sending is not enabled yet."
            } else {
                requestPermissions(arrayOf(permission), 102)
            }
        } })
        layout.addView(Button(this).apply { text = "Diagnose Beeper"; setOnClickListener {
            if (router == null) router = RouterServer(applicationContext)
            status.text = try { router!!.diagnoseBeeper().toString(2) } catch (e: Exception) { "Diagnostic error: " + e.javaClass.simpleName }
        } })
        layout.addView(Button(this).apply { text = "Preview chats"; setOnClickListener {
            if (router == null) router = RouterServer(applicationContext)
            status.text = router!!.previewChats().toString(2)
        } })
        layout.addView(Button(this).apply { text = "Inspect message fields"; setOnClickListener {
            if (router == null) router = RouterServer(applicationContext)
            status.text = router!!.previewMessages().toString(2)
        } })
        layout.addView(Button(this).apply { text = "Stop server"; setOnClickListener {
            stopService(android.content.Intent(this@MainActivity, RouterService::class.java)); status.text = "Service stopped"
        } })
        setContentView(layout)
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 102) {
            status.text = if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                "Beeper send permission granted. No messages sent." else "Beeper send permission denied."
        }
        if (requestCode == 101) {
            status.text = if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                "Beeper read permission granted. Tap Diagnose Beeper."
            else "Beeper read permission denied."
        }
    }
    override fun onDestroy() { router?.stop(); super.onDestroy() }
}
