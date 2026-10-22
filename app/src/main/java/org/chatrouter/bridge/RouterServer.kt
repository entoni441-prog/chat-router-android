package org.chatrouter.bridge

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.atomic.AtomicBoolean

/** Local-only MCP endpoint. Never expose to Wi-Fi without authentication. */
class RouterServer(private val context: Context) {
    private val active = AtomicBoolean(false)
    private var server: ServerSocket? = null
    fun start(): Boolean {
        if (active.get()) return server?.isClosed == false
        return try {
            val socket = ServerSocket(8091, 8, InetAddress.getByName("127.0.0.1"))
            server = socket
            active.set(true)
            Thread {
                try {
                    while (active.get()) {
                        val client = socket.accept()
                        Thread { handle(client) }.start()
                    }
                } catch (_: Exception) { active.set(false) }
            }.start()
            true
        } catch (_: Exception) { active.set(false); false }
    }
    fun stop() { active.set(false); server?.close(); server = null }
    private fun handle(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 7000
            try {
                val reader = BufferedReader(InputStreamReader(client.getInputStream(), Charsets.UTF_8))
                val request = reader.readLine() ?: return
                val parts = request.split(" ")
                if (parts.size < 2) return
                val headers = mutableMapOf<String, String>()
                while (true) {
                    val line = reader.readLine() ?: return
                    if (line.isEmpty()) break
                    val index = line.indexOf(':')
                    if (index > 0) headers[line.substring(0, index).lowercase()] = line.substring(index + 1).trim()
                }
                val length = headers["content-length"]?.toIntOrNull() ?: 0
                if (length < 0 || length > 131072) { respond(client, 413, "{}"); return }
                val body = CharArray(length)
                var count = 0
                while (count < length) {
                    val n = reader.read(body, count, length - count)
                    if (n < 0) return
                    count += n
                }
                when {
                    parts[0] == "GET" && parts[1] == "/health" -> respond(client, 200, JSONObject().put("status", "ok").put("version", "1.0.0").put("scope", "loopback").toString())
                    parts[0] == "POST" && parts[1] == "/mcp" -> {
                        val req = try { JSONObject(String(body)) } catch (_: Exception) {
                            respond(client, 400, error(JSONObject.NULL, -32700, "Parse error")); return
                        }
                        val method = req.optString("method")
                        val id = req.opt("id") ?: JSONObject.NULL
                        if (method == "notifications/initialized") { respond(client, 202, ""); return }
                        val result = try {
                            when (method) {
                                "initialize" -> JSONObject().put("protocolVersion", "2024-11-05")
                                    .put("capabilities", JSONObject().put("tools", JSONObject()))
                                    .put("serverInfo", JSONObject().put("name", "chat-router").put("version", "1.0.0"))
                                "ping" -> JSONObject()
                                "tools/list" -> JSONObject().put("tools", JSONArray().put(tool("preview_messages", "Read up to three messages from the first Beeper chat", false)).put(tool("preview_chats", "Read a small sample of Beeper chat metadata", false)).put(tool("diagnose_beeper", "Check whether Beeper provider is accessible without reading messages", false)).put(tool("list_chats", "Read Beeper chats", false))
                                    .put(tool("list_messages", "Read Beeper messages; optional room_id filter", true)))
                                "tools/call" -> {
                                    val params = req.optJSONObject("params") ?: throw IllegalArgumentException("Missing params")
                                    val args = params.optJSONObject("arguments") ?: JSONObject()
                                    val name = params.optString("name")
                                    val rows = when (name) {
                                        "diagnose_beeper" -> diagnoseBeeper()
                                        "preview_chats" -> JSONArray().put(previewChats())
                                        "preview_messages" -> JSONArray().put(previewMessages())
                                        "preview_messages" -> JSONArray().put(previewMessages())
                                        "list_chats" -> readProvider("chats", args, false)
                                        "list_messages" -> readProvider("messages", args, true)
                                        else -> throw IllegalArgumentException("Unknown tool")
                                    }
                                    JSONObject().put("content", JSONArray().put(JSONObject().put("type", "text").put("text", rows.toString())))
                                }
                                else -> { respond(client, 200, error(id, -32601, "Method not found")); return }
                            }
                        } catch (e: Exception) {
                            respond(client, 200, error(id, -32603, e.message ?: "Provider unavailable")); return
                        }
                        if (id == JSONObject.NULL) respond(client, 202, "")
                        else respond(client, 200, JSONObject().put("jsonrpc", "2.0").put("id", id).put("result", result).toString())
                    }
                    else -> respond(client, 404, "{\"error\":\"Not found\"}")
                }
            } catch (_: Exception) { }
        }
    }
    private fun tool(name: String, description: String, room: Boolean): JSONObject {
        val props = JSONObject().put("limit", JSONObject().put("type", "integer").put("minimum", 1).put("maximum", 100))
        if (room) props.put("room_id", JSONObject().put("type", "string"))
        return JSONObject().put("name", name).put("description", description)
            .put("inputSchema", JSONObject().put("type", "object").put("properties", props))
    }
    fun diagnoseBeeper(): JSONArray {
        val result = JSONObject()
        val authority = "com.beeper.api"
        result.put("authority", authority)
        val permissionName = "com.beeper.android.permission.READ_PERMISSION"
        val granted = context.checkSelfPermission(permissionName) == android.content.pm.PackageManager.PERMISSION_GRANTED
        result.put("read_permission_granted", granted)
        try {
            val info = context.packageManager.getPermissionInfo(permissionName, 0)
            val base = info.protectionLevel and android.content.pm.PermissionInfo.PROTECTION_MASK_BASE
            result.put("permission_protection", when (base) {
                android.content.pm.PermissionInfo.PROTECTION_NORMAL -> "normal"
                android.content.pm.PermissionInfo.PROTECTION_DANGEROUS -> "dangerous"
                android.content.pm.PermissionInfo.PROTECTION_SIGNATURE -> "signature"
                else -> "other"
            })
            result.put("permission_protection_level", info.protectionLevel)
        } catch (e: Exception) {
            result.put("permission_protection", "unknown")
            result.put("permission_lookup_error", e.javaClass.simpleName)
        }

        val provider = context.packageManager.resolveContentProvider(authority, 0)
        result.put("provider_discovered", provider != null)
        if (provider != null) {
            result.put("provider_package", provider.packageName)
            result.put("exported", provider.exported)
            result.put("read_permission", provider.readPermission ?: JSONObject.NULL)
            result.put("check_calling_or_self", context.checkCallingOrSelfPermission(permissionName) == android.content.pm.PackageManager.PERMISSION_GRANTED)
            result.put("check_provider_uri", context.checkUriPermission(Uri.parse("content://$authority/chats"), android.os.Process.myPid(), android.os.Process.myUid(), android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION))
            for (projection in listOf<Array<String>?>(arrayOf("_id"), null)) {
                val label = if (projection == null) "all_columns" else "id_only"
                try {
                    val cursor = context.contentResolver.query(Uri.parse("content://$authority/chats"), projection, null, null, null)
                    if (cursor == null) result.put("query_$label", "null_cursor")
                    else cursor.use {
                        result.put("query_$label", "accessible")
                        result.put("columns_$label", JSONArray(it.columnNames))
                    }
                } catch (e: SecurityException) {
                    result.put("query_$label", "permission_denied")
                    result.put("error_$label", e.message ?: "")
                } catch (e: Exception) {
                    result.put("query_$label", "error")
                    result.put("error_$label", e.javaClass.simpleName + ": " + (e.message ?: ""))
                }
            }
        } else {
            result.put("chats_query", "provider_not_discovered")
        }
        return JSONArray().put(result)
    }
    fun previewChats(): JSONObject {
        val result = JSONObject()
        val uri = Uri.parse("content://com.beeper.api/chats")
        try {
            val cursor = context.contentResolver.query(uri, null, null, null, null)
            if (cursor == null) {
                result.put("status", "null_cursor")
                return result
            }
            cursor.use {
                result.put("status", "ok")
                result.put("columns", JSONArray(it.columnNames))
                val rows = JSONArray()
                var count = 0
                while (it.moveToNext() && count < 5) {
                    val row = JSONObject()
                    it.columnNames.forEachIndexed { i, col ->
                        if (col.contains("id", true) || col.contains("name", true) || col.contains("title", true) || col.contains("room", true))
                            row.put(col, try { it.getString(i) ?: "" } catch (_: Exception) { "" })
                    }
                    rows.put(row)
                    count++
                }
                result.put("rows", rows)
                result.put("sample_count", count)
            }
        } catch (e: Exception) {
            result.put("status", "error")
            result.put("error_type", e.javaClass.simpleName)
            result.put("error", e.message ?: "")
        }
        return result
    }
    fun previewMessages(): JSONObject {
        val result = JSONObject()
        if (context.checkSelfPermission("com.beeper.android.permission.READ_PERMISSION") != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return result.put("status", "permission_required")
        }
        try {
            val chats = context.contentResolver.query(Uri.parse("content://com.beeper.api/chats"), arrayOf("roomId", "title"), null, null, null)
                ?: return result.put("status", "chats_null_cursor")
            var roomId = ""
            var title = ""
            chats.use {
                if (it.moveToFirst()) {
                    roomId = it.getString(it.getColumnIndexOrThrow("roomId")) ?: ""
                    title = it.getString(it.getColumnIndexOrThrow("title")) ?: ""
                }
            }
            if (roomId.isEmpty()) return result.put("status", "no_chats")
            result.put("chat_title", title)
            result.put("room_id", roomId)
            val uri = Uri.parse("content://com.beeper.api/messages")
            val cursor = context.contentResolver.query(uri, null, "roomId = ?", arrayOf(roomId), null)
                ?: return result.put("status", "messages_null_cursor")
            cursor.use {
                result.put("status", "ok")
                result.put("columns", JSONArray(it.columnNames))
                val rows = JSONArray()
                var n = 0
                while (it.moveToNext() && n < 3) {
                    val row = JSONObject()
                    it.columnNames.forEachIndexed { index, column ->
                        if (column.contains("id", true) || column.contains("text", true) || column.contains("body", true) || column.contains("timestamp", true))
                            row.put(column, try { (it.getString(index) ?: "").take(300) } catch (_: Exception) { "" })
                    }
                    rows.put(row)
                    n++
                }
                result.put("rows", rows)
                result.put("sample_count", n)
            }
        } catch (e: Exception) {
            result.put("status", "error")
            result.put("error_type", e.javaClass.simpleName)
            result.put("error", (e.message ?: "").take(600))
        }
        return result
    }
    fun previewMessages(): JSONObject {
        val result = JSONObject()
        try {
            val chats = context.contentResolver.query(Uri.parse("content://com.beeper.api/chats"), arrayOf("roomId", "title"), null, null, null)
                ?: return result.put("status", "chats_null_cursor")
            var roomId = ""
            chats.use { if (it.moveToFirst()) roomId = it.getString(0) ?: "" }
            if (roomId.isEmpty()) return result.put("status", "no_chats")
            result.put("room_id_present", true)
            val cursor = context.contentResolver.query(Uri.parse("content://com.beeper.api/messages"), null, null, null, null)
                ?: return result.put("status", "messages_null_cursor")
            cursor.use {
                result.put("status", "ok")
                result.put("columns", JSONArray(it.columnNames))
                result.put("message_count_sampled", minOf(it.count, 5))
                val samples = JSONArray()
                var count = 0
                while (it.moveToNext() && count < 5) {
                    val row = JSONObject()
                    it.columnNames.forEachIndexed { index, column ->
                        if (column.equals("roomId", true) || column.equals("eventId", true) || column.equals("timestamp", true) || column.equals("sender", true)) {
                            row.put(column, try { it.getString(index) ?: "" } catch (_: Exception) { "" })
                        }
                    }
                    samples.put(row)
                    count++
                }
                result.put("metadata_samples", samples)
            }
        } catch (e: Exception) {
            result.put("status", "error")
            result.put("error_type", e.javaClass.simpleName)
            result.put("error", e.message ?: "")
        }
        return result
    }
    private fun readProvider(path: String, args: JSONObject, filter: Boolean): JSONArray {
        val result = JSONArray()
        val limit = args.optInt("limit", 30).coerceIn(1, 100)
        val room = if (filter) args.optString("room_id") else ""
        val uri = Uri.parse("content://com.beeper.api/$path")
        val cursor = context.contentResolver.query(uri, null, null, null, null)
            ?: throw IllegalStateException("Beeper content provider not available")
        cursor.use {
            val cols = it.columnNames
            while (it.moveToNext() && result.length() < limit) {
                val row = JSONObject()
                cols.forEachIndexed { index, column ->
                    row.put(column, try { it.getString(index) ?: "" } catch (_: Exception) { "" })
                }
                if (room.isEmpty() || row.optString("roomId") == room || row.optString("room_id") == room) result.put(row)
            }
        }
        return result
    }
    private fun error(id: Any, code: Int, message: String): String =
        JSONObject().put("jsonrpc", "2.0").put("id", id)
            .put("error", JSONObject().put("code", code).put("message", message)).toString()
    private fun respond(socket: Socket, status: Int, body: String) {
        val reason = when (status) { 200 -> "OK"; 202 -> "Accepted"; 400 -> "Bad Request"; 404 -> "Not Found"; else -> "Payload Too Large" }
        val bytes = body.toByteArray(Charsets.UTF_8)
        val head = "HTTP/1.1 $status $reason\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n"
        socket.getOutputStream().write(head.toByteArray(Charsets.UTF_8))
        socket.getOutputStream().write(bytes)
        socket.getOutputStream().flush()
    }
}
