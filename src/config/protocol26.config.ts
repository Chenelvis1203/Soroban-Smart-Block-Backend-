/**
 * Protocol 26 Configuration
 *
 * Centralized configuration for state extension analysis parameters.
 * Adjust these values based on network updates or operational requirements.
 */

export const PROTOCOL_26_CONFIG = {
  // ─────────────────────────────────────────────────────────────────────────
  // Network Parameters
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Maximum ledger extension allowed by the network.
   * Protocol 26 default: ~10 years in ledgers (assuming 5-second close time)
   * 315,360,000 ledgers ≈ 10 years
   */
  MAX_EXTENSION_LEDGERS: BigInt(315360000),

  /**
   * Minimum ledger extension allowed.
   * Must be at least 1 ledger.
   */
  MIN_EXTENSION_LEDGERS: BigInt(1),

  /**
   * Fair extension threshold for equity analysis.
   * Contracts extending beyond this are considered equitable.
   * 52,560,000 ledgers ≈ 1.67 years
   */
  FAIR_EXTENSION_THRESHOLD: BigInt(52560000),

  /**
   * Interval for equity checks (in ledgers).
   * Determines how frequently to evaluate compliance.
   */
  EQUITY_CHECK_INTERVAL: 100,

  // ─────────────────────────────────────────────────────────────────────────
  // Clamping Classification Thresholds
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clamping ratio thresholds for classification.
   * Ratio = contractMax / networkMax
   */
  CLAMPING_THRESHOLDS: {
    /**
     * Loose: Contract allows near-maximum extensions
     * Ratio > 0.75 (contract max > 75% of network max)
     */
    LOOSE_THRESHOLD: 0.75,

    /**
     * Moderate: Contract moderately restricts extensions
     * Ratio 0.25-0.75
     */
    MODERATE_THRESHOLD: 0.25,

    /**
     * Tight: Contract significantly restricts extensions
     * Ratio 0.25-0.75 (lower end)
     */
    TIGHT_THRESHOLD: 0.25,

    /**
     * Extreme: Contract severely restricts extensions
     * Ratio < 0.25 (contract max < 25% of network max)
     */
    EXTREME_THRESHOLD: 0.25,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Fairness Score Thresholds
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fairness score breakpoints (0-100 scale).
   * Used to classify extension equity.
   */
  FAIRNESS_THRESHOLDS: {
    EXCELLENT: 80,  // ≥ 80: Excellent equity
    GOOD: 60,       // 60-79: Good equity
    FAIR: 40,       // 40-59: Fair equity
    POOR: 20,       // 20-39: Poor equity
    CRITICAL: 0,    // 0-19: Critical equity
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Compliance Thresholds
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compliance status determination rules.
   */
  COMPLIANCE_RULES: {
    /**
     * Compliant: Fairness ≥ 75 AND max ≥ 0.83 years
     */
    COMPLIANT_MIN_FAIRNESS: 75,
    COMPLIANT_MIN_EXTENSION: BigInt(52560000), // 1.67 years

    /**
     * Warning: Fairness ≥ 50 OR max ≥ 0.42 years
     */
    WARNING_MIN_FAIRNESS: 50,
    WARNING_MIN_EXTENSION: BigInt(26280000), // 0.83 years

    /**
     * Violation: Fairness < 50 AND max < 0.42 years
     */
    VIOLATION_MAX_FAIRNESS: 50,
    VIOLATION_MAX_EXTENSION: BigInt(13140000), // 0.42 years
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Monitoring & Alerting
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Monitoring configuration.
   */
  MONITORING: {
    /**
     * Enable real-time monitoring of state extensions.
     */
    ENABLED: true,

    /**
     * Monitoring interval in milliseconds.
     * How often to check for concerning patterns.
     */
    INTERVAL_MS: 60000, // 1 minute

    /**
     * Number of recent ledgers to monitor.
     * Monitors the last N ledgers for patterns.
     */
    LOOKBACK_LEDGERS: 1000,

    /**
     * Alert thresholds.
     */
    ALERT_THRESHOLDS: {
      /**
       * Alert if violation count exceeds this in monitoring window.
       */
      VIOLATION_COUNT: 5,

      /**
       * Alert if extreme clamping count exceeds this.
       */
      EXTREME_CLAMPING_COUNT: 10,

      /**
       * Alert if average fairness score drops below this.
       */
      AVERAGE_FAIRNESS_SCORE: 50,
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Analysis & Reporting
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Analysis configuration.
   */
  ANALYSIS: {
    /**
     * Enable automatic analysis during indexing.
     */
    ENABLED: true,

    /**
     * Batch size for historical analysis.
     * Process this many transactions at a time.
     */
    BATCH_SIZE: 1000,

    /**
     * Store detailed analysis results.
     * If false, only summary metrics are stored.
     */
    STORE_DETAILED_RESULTS: true,

    /**
     * Retention period for analysis data (in days).
     * Older data may be archived or deleted.
     */
    RETENTION_DAYS: 365,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Reporting
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reporting configuration.
   */
  REPORTING: {
    /**
     * Generate periodic reports.
     */
    ENABLED: true,

    /**
     * Report generation interval (in ledgers).
     * Generate a report every N ledgers.
     */
    INTERVAL_LEDGERS: 100000,

    /**
     * Include detailed contract breakdowns in reports.
     */
    INCLUDE_CONTRACT_DETAILS: true,

    /**
     * Include violation details in reports.
     */
    INCLUDE_VIOLATIONS: true,

    /**
     * Include recommendations in reports.
     */
    INCLUDE_RECOMMENDATIONS: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Violation Severity Mapping
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Violation severity determination.
   */
  VIOLATION_SEVERITY: {
    /**
     * Extreme clamping (ratio < 0.1) = Critical
     */
    EXTREME_CLAMPING_CRITICAL_RATIO: 0.1,

    /**
     * Fairness score < 20 = Critical
     */
    CRITICAL_FAIRNESS_SCORE: 20,

    /**
     * Multiple violations in short period = High
     */
    MULTIPLE_VIOLATIONS_THRESHOLD: 3,
    MULTIPLE_VIOLATIONS_WINDOW_LEDGERS: 10000,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Feature Flags
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Feature flags for gradual rollout.
   */
  FEATURES: {
    /**
     * Enable state extension analysis.
     */
    ANALYSIS_ENABLED: true,

    /**
     * Enable API endpoints.
     */
    API_ENABLED: true,

    /**
     * Enable monitoring and alerting.
     */
    MONITORING_ENABLED: true,

    /**
     * Enable automatic violation detection.
     */
    VIOLATION_DETECTION_ENABLED: true,

    /**
     * Enable equity scoring.
     */
    EQUITY_SCORING_ENABLED: true,

    /**
     * Enable clamping analysis.
     */
    CLAMPING_ANALYSIS_ENABLED: true,
  },
};

/**
 * Get configuration value with environment variable override.
 * Allows runtime configuration via environment variables.
 *
 * Example:
 *   MAX_EXTENSION_LEDGERS=315360000 npm start
 */
export function getConfigValue<T>(key: string, defaultValue: T): T {
  const envKey = `PROTOCOL26_${key}`;
  const envValue = process.env[envKey];

  if (envValue === undefined) {
    return defaultValue;
  }

  // Try to parse as JSON first (for objects, arrays, booleans)
  try {
    return JSON.parse(envValue) as T;
  } catch {
    // Fall back to string
    return envValue as unknown as T;
  }
}

/**
 * Validate configuration values.
 * Ensures all thresholds and parameters are sensible.
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate extension ledger ranges
  if (PROTOCOL_26_CONFIG.MIN_EXTENSION_LEDGERS >= PROTOCOL_26_CONFIG.MAX_EXTENSION_LEDGERS) {
    errors.push('MIN_EXTENSION_LEDGERS must be less than MAX_EXTENSION_LEDGERS');
  }

  // Validate fairness thresholds
  const fairness = PROTOCOL_26_CONFIG.FAIRNESS_THRESHOLDS;
  if (fairness.EXCELLENT <= fairness.GOOD || fairness.GOOD <= fairness.FAIR || fairness.FAIR <= fairness.POOR) {
    errors.push('Fairness thresholds must be in descending order');
  }

  // Validate clamping thresholds
  const clamping = PROTOCOL_26_CONFIG.CLAMPING_THRESHOLDS;
  if (clamping.LOOSE_THRESHOLD <= clamping.MODERATE_THRESHOLD) {
    errors.push('LOOSE_THRESHOLD must be greater than MODERATE_THRESHOLD');
  }

  // Validate compliance rules
  const compliance = PROTOCOL_26_CONFIG.COMPLIANCE_RULES;
  if (compliance.COMPLIANT_MIN_FAIRNESS <= compliance.WARNING_MIN_FAIRNESS) {
    errors.push('COMPLIANT_MIN_FAIRNESS must be greater than WARNING_MIN_FAIRNESS');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Log configuration for debugging.
 */
export function logConfig(): void {
  console.log('[Protocol26] Configuration:');
  console.log(`  MAX_EXTENSION_LEDGERS: ${PROTOCOL_26_CONFIG.MAX_EXTENSION_LEDGERS.toString()}`);
  console.log(`  FAIR_EXTENSION_THRESHOLD: ${PROTOCOL_26_CONFIG.FAIR_EXTENSION_THRESHOLD.toString()}`);
  console.log(`  Clamping Thresholds:`, PROTOCOL_26_CONFIG.CLAMPING_THRESHOLDS);
  console.log(`  Fairness Thresholds:`, PROTOCOL_26_CONFIG.FAIRNESS_THRESHOLDS);
  console.log(`  Features:`, PROTOCOL_26_CONFIG.FEATURES);
}
