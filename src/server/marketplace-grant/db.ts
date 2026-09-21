import postgres, { type Sql } from 'postgres';
import type { MarketplaceGrantConfig } from './config';

export type BridgeRow = {
  bridge_id: string;
  cookie_hash: Uint8Array;
  pubky: string;
  marketplace_session_id: string;
  bearer_sealed: Uint8Array;
  key_epoch: number;
  created_at: Date;
  expires_at: Date;
  last_verified_at: Date;
};

export type FlowRow = {
  state_id: string;
  bridge_id: string;
  flow_id: string | null;
  result_binding_hash: Uint8Array;
  context_sealed: Uint8Array | null;
  key_epoch: number;
  status: string;
  lease_owner: string | null;
  lease_until: Date | null;
  version: string;
  created_at: Date;
  expires_at: Date;
  terminal_at: Date | null;
};

let sql: Sql | undefined;

export function grantSql(config: MarketplaceGrantConfig): Sql {
  sql ??= postgres(config.databaseUrl, {
    max: 5,
    connect_timeout: Math.ceil(config.databaseTimeoutMs / 1000),
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    prepare: true,
    onnotice: () => {},
  });
  return sql;
}

export async function assertGrantSchema(config: MarketplaceGrantConfig): Promise<void> {
  const db = grantSql(config);
  const rows = await db<{ version: number }[]>`
    SELECT version FROM shop_grant_bff.schema_version
    WHERE singleton = TRUE
  `;
  if (rows.length !== 1 || rows[0].version !== 1) throw new Error('Shop grant BFF schema is not ready');
}

export async function replaceBridge(
  config: MarketplaceGrantConfig,
  row: {
    bridgeId: string;
    cookieHash: Uint8Array;
    pubky: string;
    marketplaceSessionId: string;
    bearerSealed: Uint8Array;
    keyEpoch: number;
    expiresAt: Date;
  },
): Promise<void> {
  const db = grantSql(config);
  await db.begin(async (tx) => {
    await tx`DELETE FROM shop_grant_bff.session_bridge WHERE pubky = ${row.pubky}`;
    await tx`
      INSERT INTO shop_grant_bff.session_bridge
        (bridge_id, cookie_hash, pubky, marketplace_session_id, bearer_sealed,
         key_epoch, created_at, expires_at, last_verified_at)
      VALUES
        (${row.bridgeId}, ${row.cookieHash}, ${row.pubky}, ${row.marketplaceSessionId},
         ${row.bearerSealed}, ${row.keyEpoch}, now(), ${row.expiresAt}, now())
    `;
  });
}

export async function getBridge(config: MarketplaceGrantConfig, bridgeId: string): Promise<BridgeRow | null> {
  const rows = await grantSql(config)<BridgeRow[]>`
    SELECT * FROM shop_grant_bff.session_bridge
    WHERE bridge_id = ${bridgeId} AND expires_at > now()
  `;
  return rows[0] ?? null;
}

export async function touchBridge(config: MarketplaceGrantConfig, bridgeId: string): Promise<boolean> {
  const result = await grantSql(config)`
    UPDATE shop_grant_bff.session_bridge
    SET last_verified_at = now()
    WHERE bridge_id = ${bridgeId} AND expires_at > now()
  `;
  return result.count === 1;
}

export async function deleteBridge(config: MarketplaceGrantConfig, bridgeId: string): Promise<void> {
  await grantSql(config)`DELETE FROM shop_grant_bff.session_bridge WHERE bridge_id = ${bridgeId}`;
}

export async function insertCreatingFlow(
  config: MarketplaceGrantConfig,
  row: {
    stateId: string;
    bridgeId: string;
    resultBindingHash: Uint8Array;
    contextSealed: Uint8Array;
    keyEpoch: number;
    expiresAt: Date;
  },
): Promise<void> {
  await grantSql(config)`
    INSERT INTO shop_grant_bff.flow_state
      (state_id, bridge_id, result_binding_hash, context_sealed, key_epoch,
       status, created_at, expires_at)
    VALUES
      (${row.stateId}, ${row.bridgeId}, ${row.resultBindingHash}, ${row.contextSealed},
       ${row.keyEpoch}, 'creating', now(), ${row.expiresAt})
  `;
}

export async function bindFlow(
  config: MarketplaceGrantConfig,
  stateId: string,
  flowId: string,
  expiresAt: Date,
): Promise<boolean> {
  const result = await grantSql(config)`
    UPDATE shop_grant_bff.flow_state
    SET flow_id = ${flowId}, expires_at = LEAST(expires_at, ${expiresAt}),
        status = 'awaiting', version = version + 1
    WHERE state_id = ${stateId} AND status = 'creating'
  `;
  return result.count === 1;
}

export async function getFlow(config: MarketplaceGrantConfig, stateId: string): Promise<FlowRow | null> {
  const rows = await grantSql(config)<FlowRow[]>`
    SELECT * FROM shop_grant_bff.flow_state WHERE state_id = ${stateId}
  `;
  return rows[0] ?? null;
}

export async function terminalizeFlow(config: MarketplaceGrantConfig, stateId: string, status: string): Promise<void> {
  await grantSql(config)`
    UPDATE shop_grant_bff.flow_state
    SET status = ${status}, context_sealed = NULL, terminal_at = now(),
        lease_owner = NULL, lease_until = NULL, version = version + 1
    WHERE state_id = ${stateId}
      AND status IN ('creating','awaiting','claiming')
  `;
}

export async function acquireClaim(
  config: MarketplaceGrantConfig,
  stateId: string,
  owner: string,
): Promise<FlowRow | null> {
  const rows = await grantSql(config)<FlowRow[]>`
    UPDATE shop_grant_bff.flow_state
    SET status = 'claiming', lease_owner = ${owner},
        lease_until = now() + (${config.claimLeaseSeconds} * interval '1 second'),
        version = version + 1
    WHERE state_id = ${stateId} AND status = 'awaiting' AND expires_at > now()
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function renewClaim(config: MarketplaceGrantConfig, stateId: string, owner: string): Promise<boolean> {
  const rows = await grantSql(config)<FlowRow[]>`
    UPDATE shop_grant_bff.flow_state
    SET lease_until = now() + (${config.claimLeaseSeconds} * interval '1 second'),
        version = version + 1
    WHERE state_id = ${stateId} AND status = 'claiming' AND lease_owner = ${owner}
    RETURNING *
  `;
  return rows.length === 1;
}

export async function completeClaim(config: MarketplaceGrantConfig, stateId: string, owner: string): Promise<boolean> {
  const result = await grantSql(config)`
    UPDATE shop_grant_bff.flow_state
    SET status = 'claimed', context_sealed = NULL, terminal_at = now(),
        lease_owner = NULL, lease_until = NULL, version = version + 1
    WHERE state_id = ${stateId} AND status = 'claiming' AND lease_owner = ${owner}
  `;
  return result.count === 1;
}

export async function abandonClaim(config: MarketplaceGrantConfig, stateId: string, owner: string): Promise<void> {
  await grantSql(config)`
    UPDATE shop_grant_bff.flow_state
    SET status = 'abandoned', context_sealed = NULL, terminal_at = now(),
        lease_owner = NULL, lease_until = NULL, version = version + 1
    WHERE state_id = ${stateId} AND status = 'claiming' AND lease_owner = ${owner}
  `;
}

export async function cleanupGrantState(config: MarketplaceGrantConfig): Promise<{
  expiredFlows: number;
  abandonedClaims: number;
  deletedFlows: number;
  deletedBridges: number;
}> {
  const db = grantSql(config);
  return await db.begin(async (tx) => {
    const expired = await tx`
      UPDATE shop_grant_bff.flow_state
      SET status = 'expired', context_sealed = NULL, terminal_at = now(),
          lease_owner = NULL, lease_until = NULL, version = version + 1
      WHERE status IN ('creating','awaiting') AND expires_at <= now()
    `;
    const abandoned = await tx`
      UPDATE shop_grant_bff.flow_state
      SET status = 'abandoned', context_sealed = NULL, terminal_at = now(),
          lease_owner = NULL, lease_until = NULL, version = version + 1
      WHERE status = 'claiming' AND lease_until <= now()
    `;
    const deletedFlows = await tx`
      DELETE FROM shop_grant_bff.flow_state
      WHERE terminal_at < now() - interval '24 hours'
    `;
    const deletedBridges = await tx`
      DELETE FROM shop_grant_bff.session_bridge WHERE expires_at <= now()
    `;
    return {
      expiredFlows: expired.count,
      abandonedClaims: abandoned.count,
      deletedFlows: deletedFlows.count,
      deletedBridges: deletedBridges.count,
    };
  });
}

export async function resetGrantSqlForTests(): Promise<void> {
  if (sql) await sql.end({ timeout: 1 });
  sql = undefined;
}
