# Chat Router Android

Independent Android-only MCP bridge for Beeper. Package: `org.chatrouter.bridge`.

## Confirmed on Samsung Android 16
- Beeper `READ_PERMISSION` granted; chat metadata and message columns successfully read.
- Local loopback MCP endpoint `http://127.0.0.1:8091/mcp` works locally.
- No ChatGPT-to-device remote connectivity demonstrated yet.

## Mobile Beeper API (official)
Source: https://developers.beeper.com/android/content-providers/api-reference/

Read:
- `chats`: filters `limit`, `offset`, `roomIds`, `protocol`, `isUnread`, `isArchived`, `isLowPriority`.
- `messages`: `limit`, `offset`, `roomIds`, `senderId`, `query`, `contextBefore`, `contextAfter`, `openAtUnread`.
- `contacts`: `limit`, `offset`, `senderIds`, `roomIds`, `query`, `protocol`.
- Count endpoints: `chats/count`, `messages/count`, `contacts/count`.
- Only `chats` provider change notifications are documented.
- `reactions` can be read as encoded message metadata.

Write:
- Android `SEND_PERMISSION` is a runtime permission.
- Documented text send uses `ContentResolver.insert(content://com.beeper.api/messages?roomId=...&text=..., null)`.
- No edit, delete, archive, react, or media-send ContentProvider operations documented.
- Send permission prompt is implemented; **no sending MCP tool is enabled yet**.

## Security and remaining work
- Local server binds to `127.0.0.1` only; never expose unauthenticated MCP to the internet.
- External HTTPS relay, authenticated MCP sessions, explicit approval for writes, audit logging, and service lifecycle verification are pending.
- Foreground service has been introduced but Android 16 reliability and boot restart are not verified.
- This is an experimental Beeper Android API; behavior may change.
