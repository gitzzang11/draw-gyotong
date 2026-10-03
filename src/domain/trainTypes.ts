/**
 * 열차 차종 정의 (2026-10 개편: 트램 · 경전철 · 중전철 · 광역급행 GTX).
 *
 * - 한 노선에는 한 차종만 다닌다. 차종은 노선을 기획·건설할 때 정한다.
 * - 편성은 차종별 범위 안에서 1량 단위로 고른다.
 * - 운영비는 1량당 하루 비용(억)이다.
 */
export const TRAIN_TYPES = ["tram", "light", "heavy", "gtx"] as const;

export type TrainType = (typeof TRAIN_TYPES)[number];

export interface TrainSpec {
  label: string;
  minCars: number;
  maxCars: number;
  capacityPerCar: number;
  /** 평균 운행속도(km/h) */
  speedKmh: number;
  /** 1량 가격(억) */
  pricePerCar: number;
  /** 1량 운영비(억/일) */
  maintenancePerCar: number;
}

export const trainCatalog: Record<TrainType, TrainSpec> = {
  tram: { label: "트램", minCars: 1, maxCars: 5, capacityPerCar: 65, speedKmh: 20, pricePerCar: 9, maintenancePerCar: 0.003 },
  light: { label: "경전철", minCars: 2, maxCars: 4, capacityPerCar: 95, speedKmh: 32, pricePerCar: 15, maintenancePerCar: 0.005 },
  heavy: { label: "중전철", minCars: 4, maxCars: 10, capacityPerCar: 160, speedKmh: 36, pricePerCar: 24, maintenancePerCar: 0.008 },
  gtx: { label: "광역급행 GTX", minCars: 6, maxCars: 10, capacityPerCar: 140, speedKmh: 80, pricePerCar: 34, maintenancePerCar: 0.014 },
};

export const DEFAULT_TRAIN_TYPE: TrainType = "heavy";

/** 개편 전 차종 → 새 차종 (도시철도·광역전철 → 중전철, 급행형 → GTX) */
const legacyTrainTypes: Record<string, TrainType> = { metro: "heavy", commuter: "heavy", express: "gtx" };

export function isTrainType(value: unknown): value is TrainType {
  return typeof value === "string" && (TRAIN_TYPES as readonly string[]).includes(value);
}

export function normalizeTrainType(value: unknown): TrainType {
  if (isTrainType(value)) return value;
  if (typeof value === "string" && legacyTrainTypes[value]) return legacyTrainTypes[value];
  return DEFAULT_TRAIN_TYPE;
}

/** 편성 차량 수를 차종 범위로 맞춘다. */
export function clampCars(type: TrainType, cars: number) {
  const spec = trainCatalog[type];
  return Math.min(spec.maxCars, Math.max(spec.minCars, Math.round(Number.isFinite(cars) ? cars : spec.minCars)));
}

/** 차종 기본 편성 (범위 가운데에서 짝수 쪽) */
export function defaultCars(type: TrainType) {
  const spec = trainCatalog[type];
  return clampCars(type, Math.round((spec.minCars + spec.maxCars) / 2));
}

/** 운영비는 만원(0.0001억) 단위까지 유지한다. 정수 반올림하면 0이 된다. */
export function roundCost(value: number) {
  return Math.round(value * 10000) / 10000;
}

/**
 * 개편 전 세이브의 노선 차종을 정한다. 한 노선에는 한 차종만 다니므로
 * 일반 열차(도시철도·광역전철)가 하나라도 있으면 중전철, 급행형만 있으면 GTX, 열차가 없으면 중전철.
 */
export function legacyRouteTrainType(fleetTypes: readonly unknown[]): TrainType {
  if (fleetTypes.length === 0) return DEFAULT_TRAIN_TYPE;
  return fleetTypes.every((type) => normalizeTrainType(type) === "gtx") ? "gtx" : "heavy";
}
