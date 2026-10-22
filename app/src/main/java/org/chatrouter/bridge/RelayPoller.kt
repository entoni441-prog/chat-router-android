package org.chatrouter.bridge

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Outbound-only bridge. Disabled until an explicit HTTPS endpoint and device token
 * have been provisioned. Never opens an inbound port to the Internet.
 */
class RelayPoller(private val context: Context) {
    private val running = AtomicBoolean(false)
    private var worker: Thread? = null

    fun start() {
        val prefs = context.getSharedPreferences("relay", Context.MODE_PRIVATE)
        val endpoint = prefs.getString("endpoint", "")?.trimEnd('/') ?: ""
        val token = prefs.getString("device_token", "") ?: ""
        if (!endpoint.startsWith("https://") || token.length < 32 || !running.compareAndSet(false, true)) return
        worker = Thread {
            try {
                while (running.get() && !Thread.currentThread().isInterrupted) {
                    try {
                        val response = call(endpoint + "/poll", token, "GET", null)
                        val jobs = response.optJSONArray("jobs")
                        if (jobs != null) for (i in 0 until jobs.length()) {
                            if (!running.get()) break
                            val job = jobs.getJSONObject(i)
                            val id = job.optString("id")
                            val tool = job.optString("tool")
                            val args = job.optJSONObject("arguments") ?: JSONObject()
                            val result = try {
                                // No remote write operations until separately reviewed.
                                require(tool in setOf("list_chats", "list_messages", "search_messages", "list_contacts")) {
                                    "Remote tool not enabled"
                                }
                                val local = JSONObject()
                                    .put("jsonrpc", "2.0").put("id", id)
                                    .put("method", "tools/call")
                                    .put("params", JSONObject().put("name", tool).put("arguments", args))
                                callLocal(local)
                            } catch (e: Exception) {
                                JSONObject().put("error", e.javaClass.simpleName + ": " + (e.message ?: "unavailable"))
                            }
                            call(endpoint + "/result", token, "POST", JSONObject().put("id", id).put("result", result))
                        }
                    } catch (_: Exception) {
                        // Offline or server error: bounded retry, no sensitive logging.
                    }
                    Thread.sleep(5000)
                }
            } catch (_: InterruptedException) {
            } finally {
                running.set(false)
            }
        }.apply { name = "ChatRouterRelay"; isDaemon = true; start() }
    }

    fun stop() {
        running.set(false)
        worker?.interrupt()
        worker = null
    }

    private fun callLocal(payload: JSONObject): JSONObject {
        val connection = URL("http://127.0.0.1:8091/mcp").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 4000
            connection.readTimeout = 12000
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            require(connection.responseCode == 200) { "Local MCP HTTP ${connection.responseCode}" }
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }

    private fun call(address: String, token: String, method: String, payload: JSONObject?): JSONObject {
        val connection = URL(address).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5000
            connection.readTimeout = 15000
            connection.requestMethod = method
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            if (payload != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(payload.toString().toByteArray(Charsets.UTF_8)) }
            }
            require(connection.responseCode in 200..299) { "Relay HTTP ${connection.responseCode}" }
            return JSONObject(connection.inputStream.bufferedReader().use { it.readText() })
        } finally {
            connection.disconnect()
        }
    }
}
