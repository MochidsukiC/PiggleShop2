//! `piggleshop-cs` — the Piggle Shop web backend, reachable at
//! `https://piggleshop.cs.mnn` over the MNN overlay.
//!
//! Responsibilities (DEV.md §7.3 "App backend"):
//!   - Serve the catalog / item / checkout / orders HTTP API the app calls.
//!   - On checkout: re-price server-side, run the (mock) payment, then forward a
//!     grant to the in-world mod via the command bus, auto-routed to the buyer's
//!     live server (`piggleshop.<UUID>.minecraft.auto.mnn`).
//!   - Self-register `piggleshop.cs.mnn` with the hub ipvm-router (25s heartbeat)
//!     so the app reaches it through the gateway.
//!
//! Sidecar-attached separate process: this binary is the backend; an MNN
//! tunnel-agent / mc-connector sidecar provides MNN registration (or set
//! PIGGLESHOP_CS_SELF_REGISTER=1 for Direct self-registration in dev).

mod catalog;
mod grant;
mod tls;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::{Query, State};
use axum::http::{header, Method, StatusCode};
use axum::response::IntoResponse;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{json, Value};
use tower_http::cors::{Any, CorsLayer};
use uuid::Uuid;

use catalog::Catalog;
use grant::{GrantOutcome, GrantSender};

/// Heartbeat well within the router's 60s TTL.
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(25);
/// Free shipping at/above this エメ subtotal (mirrors the design).
const SHIP_FREE_OVER: f64 = 50.0;
const SHIP_FEE: f64 = 1.50;
const MAX_QTY_PER_LINE: i64 = 4096;

#[derive(Clone)]
struct AppState {
    catalog: Arc<Catalog>,
    grant: Option<GrantSender>,
    /// mcid(lower) → recent orders (newest first). In-memory history.
    orders: Arc<Mutex<HashMap<String, Vec<Value>>>>,
    /// order_id → completed order (idempotent replays).
    by_order: Arc<Mutex<HashMap<String, Value>>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let listen = env_or("PIGGLESHOP_CS_LISTEN", "127.0.0.1:7430");
    let router_url = trim_trailing_slash(env_or("MOCHI_IPVM_ROUTER_URL", "http://127.0.0.1:7400"));
    let mnn = env_or("PIGGLESHOP_CS_MNN", "piggleshop.cs.mnn");
    let bearer = env_or("MOCHI_IPVM_BEARER", "dev-piggleshop");
    let tls_on = env_flag("PIGGLESHOP_CS_TLS", true);

    let catalog = Arc::new(Catalog::load()?);
    tracing::info!(
        items = catalog.root().get("items").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        source = %catalog.source,
        "catalog loaded"
    );

    // Connect the command bus (catalog-only degrade if no cert configured).
    let grant = GrantSender::connect().await?;
    if grant.is_none() {
        tracing::warn!("checkout will accept orders but NOT deliver (no command-bus cert)");
    }

    let state = AppState {
        catalog,
        grant,
        orders: Arc::new(Mutex::new(HashMap::new())),
        by_order: Arc::new(Mutex::new(HashMap::new())),
    };

    let listener = tokio::net::TcpListener::bind(&listen)
        .await
        .map_err(|e| anyhow::anyhow!("bind {listen}: {e}"))?;
    let local = listener
        .local_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| listen.clone());
    tracing::info!(%local, %mnn, %router_url, tls = tls_on, "piggleshop.cs.mnn online");

    // Direct self-register (pre-tunnel). PIGGLESHOP_CS_SELF_REGISTER=0 hands
    // registration to an MNN tunnel-agent sidecar (routing: Tunnel).
    if env_flag("PIGGLESHOP_CS_SELF_REGISTER", true) {
        tokio::spawn(register_loop(router_url, mnn.clone(), bearer, local.clone()));
    } else {
        tracing::info!(%mnn, "self-registration disabled — a tunnel-agent sidecar owns it");
    }

    let app = build_router(state);
    if tls_on {
        let cfg = tls::server_config(&mnn)?;
        serve_tls(listener, app, cfg).await
    } else {
        axum::serve(listener, app)
            .await
            .map_err(|e| anyhow::anyhow!("serve: {e}"))
    }
}

fn build_router(state: AppState) -> Router {
    // The app reaches us by a raw cross-origin fetch() from mochi-internal://…,
    // so the JSON content-type triggers a preflight we must answer (rein pattern).
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    Router::new()
        .route("/healthz", get(|| async { "ok" }))
        .route("/piggle/status", get(status))
        .route("/piggle/catalog", get(get_catalog))
        .route("/piggle/item", get(get_item))
        .route("/piggle/orders", get(get_orders))
        .route("/piggle/checkout", post(checkout))
        .with_state(state)
        .layer(cors)
}

// ── handlers ─────────────────────────────────────────────────────────────────

async fn status(State(st): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "app": "piggleshop",
        "version": st.catalog.version(),
        "source": st.catalog.source,
        "can_deliver": st.grant.is_some(),
    }))
}

async fn get_catalog(State(st): State<AppState>) -> impl IntoResponse {
    Json(st.catalog.root().clone())
}

#[derive(serde::Deserialize)]
struct ItemQuery {
    id: String,
}
async fn get_item(State(st): State<AppState>, Query(q): Query<ItemQuery>) -> impl IntoResponse {
    match st.catalog.item_json(&q.id) {
        Some(it) => Json(json!({ "ok": true, "item": it })).into_response(),
        None => (StatusCode::OK, Json(json!({ "ok": false, "error": "not_found" }))).into_response(),
    }
}

#[derive(serde::Deserialize)]
struct OrdersQuery {
    mcid: String,
}
async fn get_orders(State(st): State<AppState>, Query(q): Query<OrdersQuery>) -> impl IntoResponse {
    let orders = st
        .orders
        .lock()
        .unwrap()
        .get(&q.mcid.to_lowercase())
        .cloned()
        .unwrap_or_default();
    Json(json!({ "ok": true, "orders": orders }))
}

#[derive(serde::Deserialize)]
struct CheckoutReq {
    order_id: String,
    mcid: String,
    #[serde(default)]
    items: Vec<CheckoutLine>,
    #[serde(default)]
    note: Option<String>,
}
#[derive(serde::Deserialize)]
struct CheckoutLine {
    id: String,
    qty: i64,
}

async fn checkout(State(st): State<AppState>, Json(req): Json<CheckoutReq>) -> impl IntoResponse {
    let _ = &req.note;
    if req.order_id.is_empty() {
        return Json(err("bad_order", "order_id required"));
    }
    if req.mcid.is_empty() {
        return Json(err("bad_mcid", "mcid required"));
    }

    // Idempotent replay: return the prior completed order.
    if let Some(prev) = st.by_order.lock().unwrap().get(&req.order_id).cloned() {
        let mut o = prev;
        o["duplicate"] = json!(true);
        return Json(o);
    }

    if req.items.is_empty() {
        return Json(err("empty_cart", "items required"));
    }

    // Server-authoritative re-pricing — never trust client prices.
    let mut subtotal = 0.0;
    let mut grant_items: Vec<Value> = Vec::new();
    let mut order_lines: Vec<Value> = Vec::new();
    for line in &req.items {
        let item = match st.catalog.get(&line.id) {
            Some(i) => i,
            None => return Json(err("bad_line", &format!("unknown id {}", line.id))),
        };
        if line.qty <= 0 || line.qty > MAX_QTY_PER_LINE {
            return Json(err("bad_line", &format!("bad qty {}", line.qty)));
        }
        subtotal += item.price * line.qty as f64;
        grant_items.push(json!({ "item": item.mc, "count": line.qty }));
        order_lines.push(json!({ "id": line.id, "qty": line.qty, "price": round2(item.price) }));
    }
    let shipping = if subtotal >= SHIP_FREE_OVER { 0.0 } else { SHIP_FEE };
    let total = subtotal + shipping;

    // Mock payment: auto-approved (no real debit), per the current design.

    // Resolve the buyer's MC UUID for auto-route. Dev/offline servers key the
    // presence directory by the offline UUID (nameUUIDFromBytes of
    // "OfflinePlayer:<name>"); online mode needs the Mojang UUID (future).
    let uuid = offline_uuid(&req.mcid);

    // Forward the grant to the in-world mod (auto-routed to the player's server).
    let (success, status_str, error) = match &st.grant {
        Some(sender) => {
            let payload = json!({
                "order_id": req.order_id,
                "verb": "inventory.give",
                "target_uuid": uuid.to_string(),
                "mcid": req.mcid,
                "items": grant_items,
            });
            match sender.grant(&uuid, payload.to_string().as_bytes()).await {
                GrantOutcome::Delivered => (true, "配送中", None),
                GrantOutcome::PlayerOffline => (false, "保留", Some("player_offline".to_string())),
                GrantOutcome::Error(e) => (false, "保留", Some(e)),
            }
        }
        None => (false, "保留", Some("backend_cannot_deliver".to_string())),
    };

    let order = json!({
        "ok": true,
        "success": success,
        "order_id": req.order_id,
        "mcid": req.mcid,
        "status": status_str,
        "subtotal": round2(subtotal),
        "shipping": round2(shipping),
        "total": round2(total),
        "lines": order_lines,
        "error": error,
    });

    if success {
        st.by_order
            .lock()
            .unwrap()
            .insert(req.order_id.clone(), order.clone());
        st.orders
            .lock()
            .unwrap()
            .entry(req.mcid.to_lowercase())
            .or_default()
            .insert(0, order.clone());
    }
    Json(order)
}

// ── ipvm-router self-registration ────────────────────────────────────────────

async fn register_loop(router_url: String, mnn: String, bearer: String, address: String) {
    let client = reqwest::Client::new();
    let node_id = Uuid::new_v4();
    let url = format!("{router_url}/nodes/{node_id}");
    let body = json!({
        "kind": "service",
        "address": address,
        "capabilities": ["piggleshop", "shop"],
        "mochi_domain": mnn,
    });
    loop {
        match client.put(&url).bearer_auth(&bearer).json(&body).send().await {
            Ok(r) if r.status().is_success() => {
                tracing::info!(%mnn, %address, "registered/heartbeat ok")
            }
            Ok(r) => tracing::warn!(status = %r.status(), "ipvm-router rejected registration"),
            Err(e) => tracing::warn!(error = %e, "ipvm-router unreachable for registration"),
        }
        tokio::time::sleep(HEARTBEAT_INTERVAL).await;
    }
}

// ── TLS serve (path C), adapted from services/rein/src/main.rs ────────────────

async fn serve_tls(
    listener: tokio::net::TcpListener,
    app: Router,
    config: Arc<rustls::ServerConfig>,
) -> anyhow::Result<()> {
    use hyper_util::rt::TokioIo;
    let acceptor = tokio_rustls::TlsAcceptor::from(config);
    loop {
        let (stream, _peer) = match listener.accept().await {
            Ok(s) => s,
            Err(e) => {
                tracing::warn!(error = %e, "accept failed");
                continue;
            }
        };
        let acceptor = acceptor.clone();
        let app = app.clone();
        tokio::spawn(async move {
            let tls = match acceptor.accept(stream).await {
                Ok(t) => t,
                Err(e) => {
                    tracing::debug!(error = %e, "TLS handshake failed");
                    return;
                }
            };
            let io = TokioIo::new(tls);
            let svc = hyper::service::service_fn(move |req| {
                let app = app.clone();
                async move {
                    use tower::ServiceExt;
                    app.oneshot(req).await
                }
            });
            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .serve_connection(io, svc)
                .await
            {
                tracing::debug!(error = %e, "connection error");
            }
        });
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────

fn err(code: &str, detail: &str) -> Value {
    json!({ "ok": false, "error": code, "detail": detail })
}

fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

/// Minecraft offline-mode player UUID: `UUID.nameUUIDFromBytes(("OfflinePlayer:"
/// + name).getBytes(UTF_8))` — a name-based UUID v3 (MD5), with version/variant
/// bits set, NOT namespaced.
fn offline_uuid(name: &str) -> Uuid {
    let digest = md5::compute(format!("OfflinePlayer:{name}").as_bytes());
    let mut b = digest.0; // 16 bytes
    b[6] = (b[6] & 0x0f) | 0x30; // version 3
    b[8] = (b[8] & 0x3f) | 0x80; // IETF variant
    Uuid::from_bytes(b)
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| default.to_string())
}

fn env_flag(key: &str, default: bool) -> bool {
    match std::env::var(key).ok().filter(|s| !s.is_empty()) {
        Some(v) => matches!(v.as_str(), "1" | "true" | "TRUE" | "yes" | "on"),
        None => default,
    }
}

fn trim_trailing_slash(s: String) -> String {
    s.trim_end_matches('/').to_string()
}
