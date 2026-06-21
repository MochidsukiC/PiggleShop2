//! Command-bus grant sender: forwards a confirmed purchase to the in-world mod.
//!
//! On checkout, cs.mnn sends a reliable, auto-routed command to
//! `piggleshop.<UUID>.minecraft.auto.mnn` over the Hub command bus (mTLS QUIC
//! :7421). The Hub resolves the player via the presence directory to their live
//! server, rewrites the dst to `piggleshop.<server_id>.mnn`, and relays to the
//! mod's grant executor (which delivers the items).
//!
//! Identity: the mc-sdk client cert SAN (`DNS=piggleshop.mnn`) is the asserted
//! `src` the mod authorizes against. Mint it once with
//!   `mochi-mc-ca issue --dir <ca_dir> --mcserver-id piggleshop --out <cert_dir>`
//! and point `MOCHI_MC_CERT_DIR` at the output. When the cert dir is absent the
//! backend runs in a degraded "catalog-only" mode (HTTP serves, but checkout
//! cannot deliver) rather than failing to boot — surfaced loudly, never silently.

use std::path::PathBuf;
use std::sync::Arc;

use mochi_hub_mc_pki::load_client_identity;
use mochi_hub_mc_sdk::{McSdk, McSdkConfig, SdkError};
use uuid::Uuid;

/// Resolve a Minecraft username (MCID) to its canonical UUID via the Hub's
/// `<title>.auto.mnn` directory (DEV.md §7.3.8), reached through the IPvM gateway
/// as a forward proxy: `GET http://minecraft.auto.mnn/v1/resolve/<name>` →
/// `{title, name, player}` where `player` is the UUID string or `null` (a
/// legitimate "unknown / not currently tracked" name, returned as 200).
///
/// `None` ⇒ the player is not in the presence directory (offline / never seen),
/// so the order cannot be auto-routed yet. The gateway addr defaults to
/// `127.0.0.1:7411` (MOCHI_CEF_IPVM_GATEWAY / the gateway listen).
pub async fn resolve_mcid(mcid: &str) -> Option<Uuid> {
    let gateway = std::env::var("MOCHI_IPVM_GATEWAY")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "127.0.0.1:7411".to_string());
    // Use the gateway as a forward proxy for the .auto.mnn host (the gateway
    // terminates the directory read; it never reaches a backend node).
    let proxy = match reqwest::Proxy::http(format!("http://{gateway}")) {
        Ok(p) => p,
        Err(e) => {
            tracing::warn!(error = %e, "resolve: bad gateway proxy");
            return None;
        }
    };
    let client = match reqwest::Client::builder().proxy(proxy).build() {
        Ok(c) => c,
        Err(e) => {
            tracing::warn!(error = %e, "resolve: client build failed");
            return None;
        }
    };
    let url = format!("http://minecraft.auto.mnn/v1/resolve/{mcid}");
    match client.get(&url).send().await {
        Ok(r) => match r.json::<serde_json::Value>().await {
            Ok(v) => v
                .get("player")
                .and_then(|p| p.as_str())
                .and_then(|s| Uuid::parse_str(s).ok()),
            Err(e) => {
                tracing::warn!(error = %e, "resolve: bad json");
                None
            }
        },
        Err(e) => {
            tracing::warn!(error = %e, %mcid, "resolve: gateway request failed");
            None
        }
    }
}

/// A connected command-bus client, or `None` when no cert is configured.
#[derive(Clone)]
pub struct GrantSender {
    sdk: Arc<McSdk>,
}

/// Result of a grant attempt.
pub enum GrantOutcome {
    /// Relayed to the player's server (mod will deliver; ack flows back async).
    Delivered,
    /// Player offline / not in the presence directory (Hub bounced 404).
    PlayerOffline,
    /// Transport/SDK error (retryable).
    Error(String),
}

impl GrantSender {
    /// Connect to the Hub command bus using the cert dir (chain.pem /
    /// leaf.key.pem / ca.cert.pem). Returns `Ok(None)` when the dir is unset or
    /// missing the PEMs (degraded catalog-only mode).
    pub async fn connect() -> anyhow::Result<Option<Self>> {
        let cert_dir = match std::env::var("MOCHI_MC_CERT_DIR")
            .ok()
            .filter(|s| !s.is_empty())
        {
            Some(d) => PathBuf::from(d),
            None => {
                tracing::warn!(
                    "MOCHI_MC_CERT_DIR unset — running CATALOG-ONLY (checkout cannot deliver). \
                     Mint a cert: mochi-mc-ca issue --mcserver-id piggleshop --out <dir>"
                );
                return Ok(None);
            }
        };
        let chain = cert_dir.join("chain.pem");
        let key = cert_dir.join("leaf.key.pem");
        let ca = cert_dir.join("ca.cert.pem");
        if !chain.exists() || !key.exists() || !ca.exists() {
            tracing::warn!(dir = %cert_dir.display(),
                "cert dir missing chain.pem/leaf.key.pem/ca.cert.pem — CATALOG-ONLY mode");
            return Ok(None);
        }

        let (chain, key, ca_roots) = load_client_identity(&chain, &key, &ca)?;
        let hub_addr = std::env::var("MOCHI_MC_HUB_QUIC")
            .unwrap_or_else(|_| "127.0.0.1:7421".to_string())
            .parse()
            .map_err(|e| anyhow::anyhow!("MOCHI_MC_HUB_QUIC parse: {e}"))?;
        let server_name =
            std::env::var("MOCHI_MC_SERVER_NAME").unwrap_or_else(|_| "localhost".to_string());

        let sdk = McSdk::connect(McSdkConfig {
            hub_addr,
            server_name,
            client_cert_chain: chain,
            client_key: key,
            ca_roots,
            node_id: Uuid::new_v4(),
        })
        .await
        .map_err(|e| anyhow::anyhow!("mc-sdk connect: {e}"))?;

        tracing::info!(%hub_addr, "command bus connected (app_id=piggleshop via cert SAN)");
        Ok(Some(Self { sdk: Arc::new(sdk) }))
    }

    /// Send a grant command for `player_uuid` (auto-routed). `payload` is the
    /// opaque grant JSON the mod's executor understands.
    pub async fn grant(&self, player_uuid: &Uuid, payload: &[u8]) -> GrantOutcome {
        // Auto-route dst grammar (>=5 labels, right-anchored):
        //   <hostname>.<player_label>.<title>.auto.mnn
        // hostname = our app_id "piggleshop"; title = "minecraft"; the UUID is
        // already a single DNS label.
        let dst = format!("piggleshop.{player_uuid}.minecraft.auto.mnn");
        // src is advisory — the Hub overwrites it with our cert SAN ("piggleshop").
        match self.sdk.reliable_send(&dst, "piggleshop", payload).await {
            Ok(()) => GrantOutcome::Delivered,
            Err(SdkError::NotDelivered { status: 404, .. }) => GrantOutcome::PlayerOffline,
            Err(e) => GrantOutcome::Error(e.to_string()),
        }
    }
}
