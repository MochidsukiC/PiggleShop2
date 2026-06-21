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
