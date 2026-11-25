package com.example.suseelacateringcrm.util

import com.google.firebase.auth.FirebaseAuth

/**
 * uid of the signed-in user ("" when signed out). Every direct Firestore update writes
 * `updatedBy` = this uid and every create writes `createdBy` (api-contract Round 6 B: the change-history
 * triggers record who did it).
 */
fun currentUid(): String = FirebaseAuth.getInstance().currentUser?.uid ?: ""
