export type DependencyName = 'db' | 'cache' | 'indexer' | 'coldStorage';

const _state: Record<DependencyName, boolean> = {
  db: false,
  cache: false,
  indexer: false,
  coldStorage: false,
};

export function markReady(dep: DependencyName): void {
  _state[dep] = true;
}

export function markNotReady(dep: DependencyName): void {
  _state[dep] = false;
}

export function getReadinessState(): Record<DependencyName, boolean> {
  return { ..._state };
}

export function isFullyReady(): boolean {
  return Object.values(_state).every(Boolean);
}
