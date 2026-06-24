declare namespace Express {
  interface Request {
    body: any;
    coldStorage?: {
      enabled: boolean;
      type: string;
      path?: string;
      ledgerSeq: number;
    };
    network: import('../profiles').NetworkName;
    networkProfile: import('../profiles').NetworkProfile;
  }
}
