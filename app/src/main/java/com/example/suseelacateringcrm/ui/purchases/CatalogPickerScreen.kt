package com.example.suseelacateringcrm.ui.purchases

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.example.suseelacateringcrm.data.model.MasterItem
import com.example.suseelacateringcrm.ui.components.EmptyState
import com.example.suseelacateringcrm.util.L

@Composable
fun CatalogPickerScreen(
    padding: PaddingValues,
    categories: List<String>,
    allItems: List<MasterItem>,
    onItemSelected: (MasterItem) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var expandedCategories by remember { mutableStateOf(setOf<String>()) }

    Column(modifier = Modifier.padding(padding).fillMaxSize()) {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text(L("వస్తువు వెతకండి", "Search item")) },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        )

        if (query.isBlank()) {
            LazyColumn(contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp)) {
                items(categories, key = { it }) { category ->
                    val expanded = category in expandedCategories
                    Column {
                        Card(
                            onClick = {
                                expandedCategories = if (expanded) expandedCategories - category else expandedCategories + category
                            },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp).animateContentSize(),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(16.dp),
                                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(category, style = MaterialTheme.typography.titleSmall)
                                Icon(
                                    if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                                    contentDescription = null,
                                )
                            }
                        }
                        if (expanded) {
                            allItems.filter { it.category == category }.forEach { item ->
                                Card(
                                    onClick = { onItemSelected(item) },
                                    modifier = Modifier.fillMaxWidth().padding(start = 16.dp, top = 2.dp, bottom = 2.dp),
                                ) {
                                    Text(item.name, modifier = Modifier.padding(12.dp))
                                }
                            }
                        }
                    }
                }
            }
        } else {
            val filtered = allItems.filter { it.name.contains(query, ignoreCase = true) }
            if (filtered.isEmpty()) {
                EmptyState(L("\"$query\" కి వస్తువులు లేవు.", "No items match \"$query\"."))
            } else {
                LazyColumn(contentPadding = PaddingValues(16.dp)) {
                    items(filtered, key = { it.name }) { item ->
                        Card(
                            onClick = { onItemSelected(item) },
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text(item.name)
                                Text(item.category, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }
        }
    }
}
