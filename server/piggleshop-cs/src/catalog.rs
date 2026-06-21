//! Catalog source for the cs.mnn backend.
//!
//! TODAY: a static catalog embedded from `catalog.json` (the design's 36-item
//! set, the AEM-absent fallback). FUTURE (本丸): an AEM-over-MNN fetch that pulls
//! the live listing/prices from AutoEconomicManagementMod across the MNN overlay.
//! The [`Catalog`] type is the seam — swap [`Catalog::load`] for an MNN fetch
//! (falling back to the embedded static set on failure) without touching the HTTP
//! handlers.

use std::collections::HashMap;

use serde::Deserialize;
use serde_json::Value;

/// The embedded static catalog (design fallback). `include_str!` bakes it into
/// the binary so the service is self-contained.
const STATIC_CATALOG: &str = include_str!("../catalog.json");

/// One catalog row, parsed for server-side re-pricing + delivery. The full JSON
/// (with all display fields) is kept verbatim in [`Catalog::root`] and served as-is.
#[derive(Debug, Clone, Deserialize)]
pub struct Item {
    pub id: String,
    /// Minecraft resource id used for the grant (e.g. `minecraft:diamond`).
    pub mc: String,
    /// Display name — kept for logging / future server-side use.
    #[allow(dead_code)]
    pub name: String,
    pub price: f64,
}

/// The catalog: the raw JSON served to the app + a by-id index for re-pricing.
#[derive(Debug, Clone)]
pub struct Catalog {
    root: Value,
    by_id: HashMap<String, Item>,
    pub source: String,
}

impl Catalog {
    /// Load the catalog. Currently the embedded static set; later this becomes
    /// "fetch from AEM over MNN, else static fallback".
    pub fn load() -> anyhow::Result<Self> {
        Self::from_json(STATIC_CATALOG)
    }

    fn from_json(text: &str) -> anyhow::Result<Self> {
        let root: Value = serde_json::from_str(text)?;
        let items: Vec<Item> = serde_json::from_value(
            root.get("items").cloned().unwrap_or(Value::Array(vec![])),
        )?;
        let source = root
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("static")
            .to_string();
        let by_id = items.into_iter().map(|i| (i.id.clone(), i)).collect();
        Ok(Self { root, by_id, source })
    }

    /// The full catalog JSON ({version, currency, source, cats, rarity, items}),
    /// served verbatim for the `catalog` endpoint.
    pub fn root(&self) -> &Value {
        &self.root
    }

    /// The single-item JSON object, or `None` if unknown.
    pub fn item_json(&self, id: &str) -> Option<Value> {
        self.root
            .get("items")?
            .as_array()?
            .iter()
            .find(|it| it.get("id").and_then(|v| v.as_str()) == Some(id))
            .cloned()
    }

    pub fn get(&self, id: &str) -> Option<&Item> {
        self.by_id.get(id)
    }

    pub fn version(&self) -> &str {
        self.root.get("version").and_then(|v| v.as_str()).unwrap_or("0")
    }
}
