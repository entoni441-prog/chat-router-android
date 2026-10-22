package org.chatrouter.bridge

import android.app.Activity
import android.app.AlertDialog
import android.net.Uri
import android.os.Bundle
import android.content.pm.PackageManager
import android.widget.EditText
import android.text.InputType
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
            val details = try {
                val info = packageManager.getPermissionInfo(permission, 0)
                val base = info.protectionLevel and android.content.pm.PermissionInfo.PROTECTION_MASK_BASE
                "Declared permission; protection base=$base"
            } catch (e: Exception) {
                "Permission lookup failed: " + e.javaClass.simpleName
            }
            if (checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                status.text = "Beeper SEND granted. $details"
            } else {
                status.text = "Beeper SEND not granted. $details. Requesting Android permission..."
                try { requestPermissions(arrayOf(permission), 102) }
                catch (e: Exception) { status.text = "SEND request error: " + e.javaClass.simpleName + ": " + (e.message ?: "") }
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
        layout.addView(Button(this).apply { text = "Review pending message"; setOnClickListener {
            reviewDraft()
        } })
        layout.addView(Button(this).apply { text = "Configure remote relay (optional)"; setOnClickListener {
            val prefs = getSharedPreferences("relay", MODE_PRIVATE)
            val fields = LinearLayout(this@MainActivity).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(32, 12, 32, 12)
            }
            val endpoint = EditText(this@MainActivity).apply {
                hint = "https://your-worker.workers.dev"
                setSingleLine(true)
                setText(prefs.getString("endpoint", ""))
            }
            val token = EditText(this@MainActivity).apply {
                hint = "Device token (not stored in APK)"
                setSingleLine(true)
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            fields.addView(endpoint)
            fields.addView(token)
            AlertDialog.Builder(this@MainActivity)
                .setTitle("Remote relay — read-only")
                .setView(fields)
                .setNegativeButton("Cancel", null)
                .setNeutralButton("Disable") { _, _ ->
                    prefs.edit().clear().apply()
                    stopService(android.content.Intent(this@MainActivity, RouterService::class.java))
                    status.text = "Remote relay disabled. Local service stopped; restart if needed."
                }
                .setPositiveButton("Save") { _, _ ->
                    val url = endpoint.text.toString().trim().trimEnd('/')
                    val key = token.text.toString().trim()
                    if (!url.startsWith("https://") || !android.util.Patterns.WEB_URL.matcher(url).matches()) {
                        status.text = "Relay configuration rejected: valid HTTPS URL required"
                    } else if (key.isNotEmpty() && key.length < 32) {
                        status.text = "Relay configuration rejected: token too short"
                    } else if (key.isEmpty() && prefs.getString("device_token", "").isNullOrEmpty()) {
                        status.text = "Relay configuration rejected: device token required"
                    } else {
                        val edit = prefs.edit().putString("endpoint", url)
                        if (key.isNotEmpty()) edit.putString("device_token", key)
                        edit.apply()
                        stopService(android.content.Intent(this@MainActivity, RouterService::class.java))
                        status.text = "Relay settings saved. Tap Start local MCP to reconnect."
                    }
                }.show()
        } })
        layout.addView(Button(this).apply { text = "Stop server"; setOnClickListener {
            stopService(android.content.Intent(this@MainActivity, RouterService::class.java)); status.text = "Service stopped"
        } })
        setContentView(layout)
    }
    private fun reviewDraft() {
        val prefs = getSharedPreferences("draft", MODE_PRIVATE)
        val room = prefs.getString("room", "") ?: ""
        val message = prefs.getString("text", "") ?: ""
        if (room.isBlank() || message.isBlank()) {
            status.text = "No pending message"
            return
        }
        val permission = "com.beeper.android.permission.SEND_PERMISSION"
        AlertDialog.Builder(this)
            .setTitle("Approve Beeper message")
            .setMessage("Destination room ID:\n$room\n\nMessage:\n$message\n\nSend this exact text?")
            .setNegativeButton("Cancel") { _, _ ->
                prefs.edit().clear().commit()
                status.text = "Draft cancelled. Nothing sent."
            }
            .setPositiveButton("Send") { _, _ ->
                if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                    status.text = "Send permission missing. Draft retained."
                } else {
                    prefs.edit().clear().commit()
                    Thread {
                        val outcome = try {
                            val uri = Uri.parse("content://com.beeper.api/messages").buildUpon()
                                .appendQueryParameter("roomId", room)
                                .appendQueryParameter("text", message).build()
                            val result = contentResolver.insert(uri, null)
                            if (result == null) "Beeper returned no send result"
                            else "Beeper accepted message. ID: " + (result.getQueryParameter("messageId") ?: "not supplied")
                        } catch (e: Exception) {
                            "Send failed: " + e.javaClass.simpleName + ": " + (e.message ?: "")
                        }
                        runOnUiThread { status.text = outcome }
                    }.start()
                }
            }.show()
    }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 102) {
            status.text = if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                "Beeper SEND granted. No messages sent." else "Beeper SEND denied or unavailable. Android result: " + grantResults.joinToString()
        }
        if (requestCode == 101) {
            status.text = if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED)
                "Beeper read permission granted. Tap Diagnose Beeper."
            else "Beeper read permission denied."
        }
    }
    override fun onDestroy() { router?.stop(); super.onDestroy() }
}
