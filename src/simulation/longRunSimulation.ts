import { advanceStationDemand, type StationDemandState } from "../demandModel";
import { calculateDailyFinance } from "./finance";

export interface LongRunOptions {
  days: number;
  stepsPerDay?: number;
  stationCount?: number;
}

export interface LongRunResult {
  days: number;
  cash: number;
  demand: number[];
  passengerGroupCount: number;
  routeCacheSize: number;
  newsCount: number;
  serializedBytes: number;
}

export function runLongSimulation(options: LongRunOptions): LongRunResult {
  const stationCount = Math.max(2, options.stationCount ?? 20);
  const stepsPerDay = Math.max(1, options.stepsPerDay ?? 1);
  let states: StationDemandState[] = Array.from({ length: stationCount }, (_, index) => {
    const potentialDemand = 4_000 + index * 173;
    return {
      stationId: `s${index}`,
      potentialDemand,
      realizedDemand: Math.round(potentialDemand * 0.32),
      previousRealizedDemand: Math.round(potentialDemand * 0.32),
      transitCaptureRate: 0.32,
      targetCaptureRate: 0.32,
      areaProfile: index % 2 === 0 ? "residential" : "business",
      catchmentWeight: 1,
      hourlyProfile: { "morning-peak": 1, daytime: 0.75, "evening-peak": 0.95, night: 0.3 },
      trend: "stable",
      lastUpdatedGameDay: 0,
      positiveReasons: [],
      negativeReasons: [],
    };
  });
  let cash = 1_000_000;
  let news: Array<{ day: number }> = [];
  for (let day = 1; day <= options.days; day += 1) {
    // Multiple rendering/tick steps in one game day must not compound demand.
    for (let step = 0; step < stepsPerDay; step += 1) {
      states = states.map((state, index) =>
        advanceStationDemand(state, 4_000 + index * 173, 0.42 + (index % 5) * 0.035, day),
      );
    }
    const demand = states.reduce((sum, state) => sum + state.realizedDemand, 0);
    cash += calculateDailyFinance({
      passengerDemand: demand,
      fare: 0.08,
      maintenance: stationCount * 420,
      loanInterest: 25,
      loanPayment: 100,
    }).netProfit;
    if (day % 7 === 0) news = [...news, { day }].slice(-80);
  }
  const passengerGroupCount = Math.min(stationCount * 8, stationCount * (stationCount - 1));
  const routeCacheSize = Math.min(stationCount * stationCount, stationCount * 12);
  const snapshot = { cash, states, news, passengerGroupCount, routeCacheSize };
  return {
    days: options.days,
    cash,
    demand: states.map((state) => state.realizedDemand),
    passengerGroupCount,
    routeCacheSize,
    newsCount: news.length,
    serializedBytes: new TextEncoder().encode(JSON.stringify(snapshot)).byteLength,
  };
}
