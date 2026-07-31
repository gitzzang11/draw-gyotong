type NetworkChangeKind =
  | "station-add" | "station-remove" | "segment-add" | "segment-remove"
  | "transfer-add" | "transfer-remove" | "physical-connection" | "junction"
  | "extension" | "merge" | "closure"
  | "label" | "color" | "train-position" | "finance" | "settlement"
  | "viewport" | "non-connected-crossing" | "preview" | "construction-progress";

const structuralChanges = new Set<NetworkChangeKind>([
  "station-add", "station-remove", "segment-add", "segment-remove",
  "transfer-add", "transfer-remove", "physical-connection", "junction",
  "extension", "merge", "closure",
]);

interface NetworkInvalidationResult {
  generation: number;
  rebuildRouter: boolean;
  changedNodeIds: string[];
  changedEdgeIds: string[];
}

export class NetworkInvalidation {
  private generation = 0;

  evaluate(changes: readonly NetworkChangeKind[], nodes: readonly string[] = [], edges: readonly string[] = []): NetworkInvalidationResult {
    const rebuildRouter = changes.some((change) => structuralChanges.has(change));
    if (rebuildRouter) this.generation += 1;
    return {
      generation: this.generation,
      rebuildRouter,
      changedNodeIds: [...new Set(nodes)],
      changedEdgeIds: [...new Set(edges)],
    };
  }
}
