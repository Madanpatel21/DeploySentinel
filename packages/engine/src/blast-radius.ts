import type { ChangedFileInput, ServiceNode } from '@deploysentinel/shared';

export interface BlastRadiusResult {
  directlyImpactedServices: string[];
  downstreamTransitiveServices: string[];
  impactedApiContracts: string[];
  impactedDatastores: string[];
  blastRadiusScore: number;
  graphNodes: Array<{ id: string; label: string; tier: string; impact: 'direct' | 'transitive' | 'unaffected' }>;
  graphEdges: Array<{ source: string; target: string; relation: string }>;
}

export interface DigitalTwinSnapshot {
  snapshotId: string;
  generatedAt: string;
  environmentTier: 'dev' | 'staging' | 'prod';
  topologyNodes: BlastRadiusResult['graphNodes'];
  topologyEdges: BlastRadiusResult['graphEdges'];
  simulatedTrafficSplit: { baselinePct: number; canaryPct: number };
  predictedLatencyDeltaMs: number;
  predictedLockContentionRisk: string;
  policyGateForecast: 'PASS' | 'WARN' | 'BLOCK';
}

const DEFAULT_TOPOLOGY: ServiceNode[] = [
  { id: 'api-gateway', name: 'API Gateway', tier: 'TIER_0', dependencies: ['auth-service', 'checkout-api', 'billing-service'], ownedPaths: ['apps/gateway', 'routes/', 'ingress/'] },
  { id: 'auth-service', name: 'Auth & RBAC Service', tier: 'TIER_0', dependencies: ['postgres-primary', 'redis-session'], ownedPaths: ['auth/', 'rbac/', 'security/', 'jwt'] },
  { id: 'checkout-api', name: 'Checkout API', tier: 'TIER_1', dependencies: ['payments-worker', 'inventory-service', 'postgres-primary'], ownedPaths: ['checkout/', 'orders/', 'cart/'] },
  { id: 'payments-worker', name: 'Payments Worker', tier: 'TIER_0', dependencies: ['billing-service', 'postgres-primary'], ownedPaths: ['payment', 'billing', 'stripe', 'ledger'] },
  { id: 'billing-service', name: 'Billing & Metering', tier: 'TIER_1', dependencies: ['postgres-primary'], ownedPaths: ['billing/', 'metering/', 'plan'] },
  { id: 'inventory-service', name: 'Inventory Service', tier: 'TIER_2', dependencies: ['postgres-primary'], ownedPaths: ['inventory/', 'catalog/'] },
  { id: 'notification-svc', name: 'Notification Dispatcher', tier: 'TIER_3', dependencies: ['redis-session'], ownedPaths: ['notify/', 'slack', 'webhook'] },
  { id: 'postgres-primary', name: 'PostgreSQL Primary', tier: 'TIER_0', dependencies: [], ownedPaths: ['migration', '.sql', 'schema', 'prisma', 'drizzle'] },
  { id: 'redis-session', name: 'Redis Cache/Queue', tier: 'TIER_1', dependencies: [], ownedPaths: ['redis', 'cache', 'queue', 'bullmq'] },
];

export function simulateBlastRadius(
  changedFiles: ChangedFileInput[],
  customNodes?: ServiceNode[]
): BlastRadiusResult {
  const nodes = customNodes && customNodes.length > 0 ? customNodes : DEFAULT_TOPOLOGY;

  // Determine directly impacted nodes from changed paths
  const directSet = new Set<string>();
  for (const file of changedFiles) {
    let matched = false;
    for (const node of nodes) {
      if (node.ownedPaths.some((p: string) => file.path.toLowerCase().includes(p.toLowerCase()))) {
        directSet.add(node.id);
        matched = true;
      }
    }
    if (!matched && nodes[0]) {
      directSet.add(nodes[0].id);
    }
  }

  // Reverse dependency adjacency: if A depends on B, and B is impacted, then A is transitively impacted!
  const reverseAdj = new Map<string, string[]>();
  const edges: Array<{ source: string; target: string; relation: string }> = [];
  for (const n of nodes) {
    for (const dep of n.dependencies) {
      edges.push({ source: n.id, target: dep, relation: 'depends_on' });
      const list = reverseAdj.get(dep) ?? [];
      list.push(n.id);
      reverseAdj.set(dep, list);
    }
  }

  const transitiveSet = new Set<string>();
  const queue = [...directSet];
  const visited = new Set<string>(directSet);

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const consumer of reverseAdj.get(curr) ?? []) {
      if (!visited.has(consumer)) {
        visited.add(consumer);
        transitiveSet.add(consumer);
        queue.push(consumer);
      }
    }
  }

  const impactedApiContracts = changedFiles
    .filter((f) => /route|controller|openapi|proto|graphql|api/i.test(f.path))
    .map((f) => f.path);

  const impactedDatastores = [...visited].filter((id) => /postgres|redis|db|sql/i.test(id));
  const tier0Impacted = nodes.filter((n) => visited.has(n.id) && n.tier === 'TIER_0').length;
  const blastRadiusScore = Math.min(100, directSet.size * 15 + transitiveSet.size * 12 + tier0Impacted * 10);

  return {
    directlyImpactedServices: [...directSet],
    downstreamTransitiveServices: [...transitiveSet],
    impactedApiContracts,
    impactedDatastores,
    blastRadiusScore,
    graphNodes: nodes.map((n) => ({
      id: n.id,
      label: n.name,
      tier: n.tier,
      impact: directSet.has(n.id) ? 'direct' : transitiveSet.has(n.id) ? 'transitive' : 'unaffected',
    })),
    graphEdges: edges,
  };
}

export function buildDigitalTwinSnapshot(
  releaseVersion: string,
  environmentTier: 'dev' | 'staging' | 'prod',
  blast: BlastRadiusResult,
  sqlLockRisk: string,
  policyForecast: 'PASS' | 'WARN' | 'BLOCK'
): DigitalTwinSnapshot {
  const predictedLatencyDeltaMs = Number(
    (blast.downstreamTransitiveServices.length * 4.5 + (sqlLockRisk === 'HIGH' || sqlLockRisk === 'CRITICAL' ? 45 : 3)).toFixed(1)
  );
  return {
    snapshotId: `twin-${releaseVersion}-${environmentTier}`,
    generatedAt: new Date().toISOString(),
    environmentTier,
    topologyNodes: blast.graphNodes,
    topologyEdges: blast.graphEdges,
    simulatedTrafficSplit: environmentTier === 'prod' ? { baselinePct: 90, canaryPct: 10 } : { baselinePct: 50, canaryPct: 50 },
    predictedLatencyDeltaMs,
    predictedLockContentionRisk: sqlLockRisk,
    policyGateForecast: policyForecast,
  };
}
