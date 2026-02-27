import type { GraphNode } from '../../shared/types';

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
}

export function formatTokensBadge(gn: GraphNode) {
  if (!gn.outputTokens && !gn.inputTokens) return null;
  const parts: string[] = [];
  if (gn.inputTokens) parts.push(`in:${formatTokens(gn.inputTokens)}`);
  if (gn.outputTokens) parts.push(`out:${formatTokens(gn.outputTokens)}`);
  return <span className="node-tokens">{parts.join(' ')}</span>;
}
