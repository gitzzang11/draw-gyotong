import type { Station, TransferGroup } from "./networkTypes";

type TransferMetrics = Pick<
  TransferGroup,
  "distanceM" | "transferTimeMin" | "congestion" | "resistance"
>;

export interface TransferGroupMutationInput {
  stationIds: readonly string[];
  automatic: boolean;
  stations: readonly Station[];
  transfers: readonly TransferGroup[];
  createId: () => string;
  calculateMetrics: (stations: Station[]) => TransferMetrics;
}

export function buildTransferGroupMutation(
  input: TransferGroupMutationInput,
): { stations: Station[]; transfers: TransferGroup[] } | null {
  const stationIds = Array.from(new Set(input.stationIds));
  if (stationIds.length < 2) return null;
  if (input.transfers.some((transfer) => stationIds.every((id) => transfer.stationIds.includes(id)))) {
    return null;
  }

  const selectedStations = stationIds
    .map((id) => input.stations.find((station) => station.id === id))
    .filter((station): station is Station => Boolean(station));
  const metrics = input.calculateMetrics(selectedStations);
  const groupId = input.createId();
  const transfer: TransferGroup = {
    id: groupId,
    stationIds,
    ...metrics,
    automatic: input.automatic,
  };

  return {
    transfers: [...input.transfers, transfer],
    stations: input.stations.map((station) => (
      stationIds.includes(station.id) ? { ...station, transferGroupId: groupId } : station
    )),
  };
}
