package expo.modules.smsmodule

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class SmsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SmsModule")

    AsyncFunction("getSmsInbox") { limit: Int, sinceDate: Long, beforeDate: Long, senderFilters: List<String> ->
      val messages = mutableListOf<Map<String, Any>>()
      val context = appContext.reactContext ?: throw Exception("React context not available")
      val contentResolver: ContentResolver = context.contentResolver
      val uri = Uri.parse("content://sms/inbox")
      val projection = arrayOf("address", "body", "date")

      // Build selection: date > sinceDate AND date <= beforeDate AND (address LIKE '%SENDER1%' OR ...)
      val selectionParts = mutableListOf<String>()
      val selectionArgsList = mutableListOf<String>()

      // Date filter — strict greater-than to avoid re-processing the checkpoint message
      selectionParts.add("date > ?")
      selectionArgsList.add(sinceDate.toString())

      if (beforeDate > 0L) {
        selectionParts.add("date <= ?")
        selectionArgsList.add(beforeDate.toString())
      }

      // Sender address filter (only if senders are provided)
      if (senderFilters.isNotEmpty()) {
        val senderClauses = senderFilters.map { "address LIKE ?" }
        selectionParts.add("(" + senderClauses.joinToString(" OR ") + ")")
        senderFilters.forEach { sender ->
          selectionArgsList.add("%${sender}%")
        }
      }

      val selection = selectionParts.joinToString(" AND ")
      val selectionArgs = selectionArgsList.toTypedArray()

      var cursor: Cursor? = null
      try {
        cursor = contentResolver.query(
          uri,
          projection,
          selection,
          selectionArgs,
          "date DESC"
        )

        if (cursor != null && cursor.moveToFirst()) {
          var count = 0
          do {
            val addressIndex = cursor.getColumnIndex("address")
            val bodyIndex = cursor.getColumnIndex("body")
            val dateIndex = cursor.getColumnIndex("date")

            if (addressIndex != -1 && bodyIndex != -1 && dateIndex != -1) {
              val map = mapOf(
                "address" to cursor.getString(addressIndex),
                "body" to cursor.getString(bodyIndex),
                "date" to cursor.getLong(dateIndex).toDouble()
              )
              messages.add(map)
              count++
              if (limit > 0 && count >= limit) break
            }
          } while (cursor.moveToNext())
        }
        return@AsyncFunction messages
      } finally {
        cursor?.close()
      }
    }

    AsyncFunction("saveData") { key: String, value: String ->
      val context = appContext.reactContext ?: throw Exception("React context not available")
      val sharedPref = context.getSharedPreferences("WealthAgentPrefs", android.content.Context.MODE_PRIVATE)
      with (sharedPref.edit()) {
        putString(key, value)
        apply()
      }
      return@AsyncFunction true
    }

    AsyncFunction("getData") { key: String ->
      val context = appContext.reactContext ?: throw Exception("React context not available")
      val sharedPref = context.getSharedPreferences("WealthAgentPrefs", android.content.Context.MODE_PRIVATE)
      return@AsyncFunction sharedPref.getString(key, "") ?: ""
    }
  }
}
