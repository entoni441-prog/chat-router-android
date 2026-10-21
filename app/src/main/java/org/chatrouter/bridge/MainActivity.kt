package org.chatrouter.bridge

import android.app.Activity
import android.os.Bundle
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
            if (router == null) router = RouterServer(applicationContext)
            val started = router!!.start()
            status.text = if (started) "Local MCP: http://127.0.0.1:8091/mcp\nHealth: http://127.0.0.1:8091/health\nRead-only" else "FAILED: Port 8091 unavailable"
        } })
        layout.addView(Button(this).apply { text = "Stop server"; setOnClickListener {
            router?.stop(); status.text = "Stopped"
        } })
        setContentView(layout)
    }
    override fun onDestroy() { router?.stop(); super.onDestroy() }
}
