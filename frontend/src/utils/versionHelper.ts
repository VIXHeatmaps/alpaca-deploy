/**
 * Version Helper Utilities
 *
 * Parse and increment semantic versions (v1.2.3) in strategy names
 */

export interface ParsedVersion {
  prefix: string; // Text before version (e.g., "My Strategy ")
  major: number;
  minor: number;
  patch: number;
  fork: string; // Fork suffix (e.g., "-alpha")
  suffix: string; // Text after version
}

/**
 * Parse version from a strategy name
 * Example: "My Strategy v1.2.3-alpha (test)" → { prefix: "My Strategy ", major: 1, minor: 2, patch: 3, fork: "-alpha", suffix: " (test)" }
 */
export function parseVersionFromName(name: string): ParsedVersion | null {
  // Match: v{major}.{minor}.{patch}[-fork]
  const regex = /^(.*?)\s*v(\d+)\.(\d+)\.(\d+)(-[a-zA-Z0-9]+)?(.*)$/;
  const match = name.match(regex);

  if (match) {
    return {
      prefix: match[1],
      major: parseInt(match[2], 10),
      minor: parseInt(match[3], 10),
      patch: parseInt(match[4], 10),
      fork: match[5] || '',
      suffix: match[6] || '',
    };
  }

  return null;
}

/**
 * Increment patch version (0.0.X)
 */
export function incrementPatch(name: string): string {
  const parsed = parseVersionFromName(name);

  if (!parsed) {
    // No version found - append v0.0.1
    return `${name} v0.0.1`;
  }

  return `${parsed.prefix}v${parsed.major}.${parsed.minor}.${parsed.patch + 1}${parsed.fork}${parsed.suffix}`.trim();
}

/**
 * Increment minor version (0.X.0)
 */
export function incrementMinor(name: string): string {
  const parsed = parseVersionFromName(name);

  if (!parsed) {
    // No version found - append v0.0.1
    return `${name} v0.0.1`;
  }

  return `${parsed.prefix}v${parsed.major}.${parsed.minor + 1}.0${parsed.fork}${parsed.suffix}`.trim();
}

/**
 * Increment major version (X.0.0)
 */
export function incrementMajor(name: string): string {
  const parsed = parseVersionFromName(name);

  if (!parsed) {
    // No version found - append v0.0.1
    return `${name} v0.0.1`;
  }

  return `${parsed.prefix}v${parsed.major + 1}.0.0${parsed.fork}${parsed.suffix}`.trim();
}

/**
 * Add or update fork suffix
 */
export function addFork(name: string, forkSuffix: string): string {
  const parsed = parseVersionFromName(name);

  if (!parsed) {
    // No version found - append v0.0.1-fork
    return `${name} v0.0.1-${forkSuffix}`;
  }

  // Replace existing fork or add new one
  return `${parsed.prefix}v${parsed.major}.${parsed.minor}.${parsed.patch}-${forkSuffix}${parsed.suffix}`.trim();
}

/**
 * Enable versioning by adding v0.0.1 if not present
 */
export function enableVersioning(name: string): string {
  const parsed = parseVersionFromName(name);

  if (parsed) {
    // Already has version
    return name;
  }

  // Add v0.0.1
  return `${name} v0.0.1`.trim();
}

/**
 * Disable versioning by removing version from name
 */
export function disableVersioning(name: string): string {
  const parsed = parseVersionFromName(name);

  if (!parsed) {
    // No version to remove
    return name;
  }

  // Remove version, keep prefix and suffix
  return `${parsed.prefix}${parsed.suffix}`.trim();
}
