import { afterEach, describe, expect, it } from 'vitest';
import { getMarketplaceGrantConfig, resetMarketplaceGrantConfigForTests } from './config';

const ENV = { ...process.env };

function validEnv(): NodeJS.ProcessEnv {
  return {
    ...ENV,
    SHOP_BFF_GRANT_FLOW_ENABLED: 'true',
    SHOP_ALLOWED_ORIGINS: '["https://shop.example"]',
    SHOP_PUBLIC_ORIGIN: 'https://shop.example',
    MARKETPLACE_SERVICE_URL: 'https://service.example',
    SHOP_BFF_GRANT_STATE_DATABASE_URL: 'postgres://example',
    SHOP_GRANT_ASSERTION_ISSUER: 'https://shop.example',
    SHOP_GRANT_ASSERTION_KEY_ID: 'shop-bff-test-0001',
    SHOP_GRANT_ASSERTION_KEY_EPOCH: '1',
    SHOP_GRANT_ASSERTION_SIGNING_KEY: '11'.repeat(32),
    MARKETPLACE_SERVICE_REQUEST_KEY_ID: 'shop-bff-request-test-0001',
    MARKETPLACE_SERVICE_REQUEST_KEY_EPOCH: '1',
    MARKETPLACE_SERVICE_REQUEST_SIGNING_KEY: '22'.repeat(32),
    SHOP_BFF_GRANT_STATE_ENCRYPTION_KEY_B64: Buffer.alloc(32, 3).toString('base64'),
    SHOP_BFF_GRANT_STATE_KEY_EPOCH: '1',
  };
}

describe('marketplace grant BFF config', () => {
  afterEach(() => {
    process.env = { ...ENV };
    resetMarketplaceGrantConfigForTests();
  });

  it('stays disabled without parsing secret inputs', () => {
    process.env = { ...ENV, SHOP_BFF_GRANT_FLOW_ENABLED: 'false' };
    expect(getMarketplaceGrantConfig()).toBeNull();
  });

  it('loads a complete environment with bounded defaults', () => {
    process.env = validEnv();
    expect(getMarketplaceGrantConfig()).toMatchObject({
      allowedOrigins: ['https://shop.example'],
      stateTtlSeconds: 300,
      claimLeaseSeconds: 15,
    });
  });

  it('rejects issuer/origin drift', () => {
    process.env = { ...validEnv(), SHOP_GRANT_ASSERTION_ISSUER: 'https://other.example' };
    expect(() => getMarketplaceGrantConfig()).toThrow();
  });

  it('rejects partial previous-key rotation', () => {
    process.env = {
      ...validEnv(),
      SHOP_BFF_GRANT_STATE_PREVIOUS_ENCRYPTION_KEY_B64: Buffer.alloc(32, 4).toString('base64'),
    };
    expect(() => getMarketplaceGrantConfig()).toThrow();
  });
});
