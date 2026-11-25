package com.example.suseelacateringcrm.data.repository

import android.content.Context
import com.example.suseelacateringcrm.data.model.MenuPackage
import com.example.suseelacateringcrm.data.remote.FirestoreCollections
import com.example.suseelacateringcrm.util.snapshotsFlow
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class MenuPackageRepository(private val firestore: FirebaseFirestore) {

    private fun collection() = firestore.collection(FirestoreCollections.MENU_PACKAGES)

    fun packagesFlow(): Flow<List<MenuPackage>> =
        collection().snapshotsFlow().map { snap ->
            snap.documents.map { MenuPackage.fromMap(it.id, it.data ?: emptyMap()) }
        }

    fun packageFlow(id: String): Flow<MenuPackage?> =
        collection().document(id).snapshotsFlow().map { snap ->
            if (snap.exists()) MenuPackage.fromMap(snap.id, snap.data ?: emptyMap()) else null
        }

    suspend fun getPackage(id: String): MenuPackage? {
        val snap = collection().document(id).get().await()
        return if (snap.exists()) MenuPackage.fromMap(snap.id, snap.data ?: emptyMap()) else null
    }

    /**
     * Loads the owner's 10 menus from assets/menus.json (copy of data/seed/menus.json).
     * Document id = menu code, so running it twice updates instead of duplicating.
     * Groups are stored as `[{options:[…]}]` because Firestore rejects arrays inside arrays.
     * Returns how many menus were written.
     */
    suspend fun seedFromAssets(context: Context, createdBy: String): Int {
        val text = withContext(Dispatchers.IO) {
            context.assets.open("menus.json").bufferedReader(Charsets.UTF_8).use { it.readText() }
        }
        val menus = JSONObject(text).getJSONArray("menus")
        val batch = firestore.batch()
        for (i in 0 until menus.length()) {
            val menu = menus.getJSONObject(i)
            @Suppress("UNCHECKED_CAST")
            val data = (jsonToValue(menu) as Map<String, Any?>).toMutableMap()
            val groups = data["groups"] as? List<*> ?: emptyList<Any?>()
            data["groups"] = groups.map { g -> mapOf("options" to ((g as? List<*>) ?: emptyList<Any?>())) }
            data.remove("chooseOneRule")
            // Contract decision 2: the seed's transportExtra is stored as transportCharged.
            data["transportCharged"] = (data.remove("transportExtra") as? Boolean) ?: true
            data["createdBy"] = createdBy
            data["updatedAt"] = FieldValue.serverTimestamp()
            val code = menu.optString("code").ifBlank { "menu-$i" }
            batch.set(collection().document(code), data)
        }
        batch.commit().await()
        return menus.length()
    }

    private fun jsonToValue(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> {
            val out = LinkedHashMap<String, Any?>()
            val keys = value.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                out[k] = jsonToValue(value.opt(k))
            }
            out
        }
        is JSONArray -> (0 until value.length()).map { jsonToValue(value.opt(it)) }
        else -> value
    }
}
