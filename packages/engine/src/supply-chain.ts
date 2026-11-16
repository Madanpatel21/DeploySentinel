export interface DependencyItem {
  name: string;
  version: string;
  license?: string;
  purl?: string;
}

export interface VulnerabilityFinding {
  id: string;
  packageName: string;
  installedVersion: string;
  fixedVersion: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cvss: number;
  summary: string;
}

export interface SbomResult {
  format: 'cyclonedx' | 'spdx';
  specVersion: string;
  componentsCount: number;
  vulnerabilities: VulnerabilityFinding[];
  licenseViolations: Array<{ packageName: string; license: string; reason: string }>;
  slsaLevel: number;
  signatureVerified: boolean;
  document: Record<string, unknown>;
}

interface AdvisoryRule {
  pkg: string;
  maxAffectedMajor: number;
  maxAffectedMinor: number;
  maxAffectedPatch: number;
  id: string;
  fixedVersion: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cvss: number;
  summary: string;
}

const KNOWN_ADVISORIES: AdvisoryRule[] = [
  { pkg: 'lodash', maxAffectedMajor: 4, maxAffectedMinor: 17, maxAffectedPatch: 20, id: 'CVE-2021-23337', fixedVersion: '4.17.21', severity: 'HIGH', cvss: 7.2, summary: 'Command injection via template function' },
  { pkg: 'axios', maxAffectedMajor: 1, maxAffectedMinor: 7, maxAffectedPatch: 3, id: 'CVE-2024-39338', fixedVersion: '1.7.4', severity: 'HIGH', cvss: 7.5, summary: 'SSRF via unexpected behavior on protocol-relative URLs' },
  { pkg: 'jsonwebtoken', maxAffectedMajor: 8, maxAffectedMinor: 5, maxAffectedPatch: 1, id: 'CVE-2022-23529', fixedVersion: '9.0.0', severity: 'CRITICAL', cvss: 9.8, summary: 'Insecure key retrieval allows signature verification bypass' },
  { pkg: 'next', maxAffectedMajor: 15, maxAffectedMinor: 2, maxAffectedPatch: 2, id: 'CVE-2025-29927', fixedVersion: '15.2.3', severity: 'CRITICAL', cvss: 9.1, summary: 'Middleware authorization bypass via x-middleware-subrequest header' },
  { pkg: 'express', maxAffectedMajor: 4, maxAffectedMinor: 19, maxAffectedPatch: 1, id: 'CVE-2024-29041', fixedVersion: '4.19.2', severity: 'MEDIUM', cvss: 6.1, summary: 'Open redirect via malformed URL parameter' },
  { pkg: 'tar', maxAffectedMajor: 6, maxAffectedMinor: 2, maxAffectedPatch: 0, id: 'CVE-2024-28863', fixedVersion: '6.2.1', severity: 'HIGH', cvss: 7.5, summary: 'Denial of service via unbounded path parsing' },
];

const RESTRICTED_LICENSES = new Set(['GPL-3.0', 'AGPL-3.0', 'SSPL-1.0', 'UNKNOWN']);

function parseSemver(ver: string): [number, number, number] {
  const clean = ver.replace(/^[\^~>=<v\s]+/, '').split('-')[0];
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function isVersionLte(ver: string, max: [number, number, number]): boolean {
  const [maj, min, pat] = parseSemver(ver);
  if (maj !== max[0]) return maj < max[0];
  if (min !== max[1]) return min < max[1];
  return pat <= max[2];
}

export function extractDependenciesFromPackageJson(pkgJson: Record<string, unknown>): DependencyItem[] {
  const items: DependencyItem[] = [];
  for (const section of ['dependencies', 'devDependencies']) {
    const deps = pkgJson[section];
    if (deps && typeof deps === 'object') {
      for (const [name, version] of Object.entries(deps as Record<string, unknown>)) {
        if (typeof version === 'string') {
          items.push({
            name,
            version,
            license: 'MIT',
            purl: `pkg:npm/${name.replace('@', '%40')}@${version.replace(/^[\^~]/, '')}`,
          });
        }
      }
    }
  }
  return items;
}

export function analyzeSupplyChain(
  deps: DependencyItem[],
  format: 'cyclonedx' | 'spdx' = 'cyclonedx',
  slsaLevel = 2,
  signatureVerified = true,
  projectName = 'releaseguard-target',
  releaseVersion = '1.0.0'
): SbomResult {
  const vulnerabilities: VulnerabilityFinding[] = [];
  const licenseViolations: Array<{ packageName: string; license: string; reason: string }> = [];

  for (const dep of deps) {
    for (const adv of KNOWN_ADVISORIES) {
      if (dep.name === adv.pkg && isVersionLte(dep.version, [adv.maxAffectedMajor, adv.maxAffectedMinor, adv.maxAffectedPatch])) {
        vulnerabilities.push({
          id: adv.id,
          packageName: dep.name,
          installedVersion: dep.version,
          fixedVersion: adv.fixedVersion,
          severity: adv.severity,
          cvss: adv.cvss,
          summary: adv.summary,
        });
      }
    }
    const lic = (dep.license ?? 'MIT').toUpperCase();
    if (RESTRICTED_LICENSES.has(lic)) {
      licenseViolations.push({
        packageName: dep.name,
        license: lic,
        reason: `License ${lic} requires Legal/Security Admin review before production distribution`,
      });
    }
  }

  const timestamp = new Date().toISOString();
  const document: Record<string, unknown> =
    format === 'cyclonedx'
      ? {
          bomFormat: 'CycloneDX',
          specVersion: '1.5',
          serialNumber: `urn:uuid:${projectName}-${releaseVersion}`,
          version: 1,
          metadata: { timestamp, component: { type: 'application', name: projectName, version: releaseVersion } },
          components: deps.map((d) => ({
            type: 'library',
            name: d.name,
            version: d.version.replace(/^[\^~]/, ''),
            purl: d.purl ?? `pkg:npm/${d.name}@${d.version.replace(/^[\^~]/, '')}`,
            licenses: [{ license: { id: d.license ?? 'MIT' } }],
          })),
          vulnerabilities: vulnerabilities.map((v) => ({
            id: v.id,
            ratings: [{ severity: v.severity.toLowerCase(), score: v.cvss }],
            description: v.summary,
            affects: [{ ref: v.packageName }],
          })),
        }
      : {
          spdxVersion: 'SPDX-2.3',
          dataLicense: 'CC0-1.0',
          SPDXID: 'SPDXRef-DOCUMENT',
          name: `${projectName}-${releaseVersion}`,
          creationInfo: { created: timestamp, creators: ['Tool: ReleaseGuard-SBOM-1.0'] },
          packages: deps.map((d, idx) => ({
            name: d.name,
            SPDXID: `SPDXRef-Package-${idx}`,
            versionInfo: d.version,
            licenseConcluded: d.license ?? 'NOASSERTION',
          })),
        };

  return {
    format,
    specVersion: format === 'cyclonedx' ? '1.5' : '2.3',
    componentsCount: deps.length,
    vulnerabilities,
    licenseViolations,
    slsaLevel,
    signatureVerified,
    document,
  };
}
