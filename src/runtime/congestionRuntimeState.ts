import type { RouteCongestionSummary, SegmentCongestion } from "../congestion.ts";

export type CongestionRuntimeSnapshot = {
  segmentCongestion: SegmentCongestion[];
  routeCongestionSummaries: RouteCongestionSummary[];
};

/** Owns derived congestion results for the current runtime state. */
export class CongestionRuntimeState {
  private segmentCongestionState: readonly SegmentCongestion[] = [];
  private routeCongestionSummariesState: readonly RouteCongestionSummary[] = [];

  get segmentCongestion(): readonly SegmentCongestion[] {
    return this.segmentCongestionState;
  }

  get routeCongestionSummaries(): readonly RouteCongestionSummary[] {
    return this.routeCongestionSummariesState;
  }

  replace(snapshot: CongestionRuntimeSnapshot): void {
    this.segmentCongestionState = snapshot.segmentCongestion;
    this.routeCongestionSummariesState = snapshot.routeCongestionSummaries;
  }

  reset(): void {
    this.replace({ segmentCongestion: [], routeCongestionSummaries: [] });
  }
}
