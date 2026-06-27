import { NetworkName, NetworkProfile } from '../profiles';
import { ApiKeyContext } from '../middleware/apiKeyAuth';
import { TokenBucketResult } from '../middleware/tokenBucket';
import { Role, Tier } from '../auth/rbac';

declare module 'express-serve-static-core' {
  interface Request {
    body: any;
    coldStorage?: {
      enabled: boolean;
      type: string;
      path?: string;
      ledgerSeq: number;
    };
    network: NetworkName;
    networkProfile: NetworkProfile;
    requestId?: string;
    startedAt?: number;
    apiKey?: ApiKeyContext;
    rateLimitResult?: TokenBucketResult;
    user?: {
      id: string;
      address: string;
      role: Role;
      tier: Tier;
      sessionId: string;
      appId?: string;
    };
  }
}
