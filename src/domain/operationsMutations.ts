import type { OperatingService } from "../operatingService.ts";
import type { ExpressConfig, TrainFleet } from "./operationsState.ts";

export function replaceOperatingService(
  services: readonly OperatingService[],
  nextService: OperatingService,
): OperatingService[] {
  return services.some((service) => service.id === nextService.id)
    ? services.map((service) => service.id === nextService.id ? nextService : service)
    : [...services, nextService];
}

export function removeOperatingService(
  services: readonly OperatingService[],
  fleets: readonly TrainFleet[],
  serviceId: string,
): { services: OperatingService[]; fleets: TrainFleet[] } {
  return {
    services: services.filter((service) => service.id !== serviceId),
    fleets: fleets.filter((fleet) => fleet.serviceId !== serviceId),
  };
}

export function replaceExpressConfigForRoute(
  configs: readonly ExpressConfig[],
  routeId: string,
  nextConfig: ExpressConfig,
): ExpressConfig[] {
  return [...configs.filter((config) => config.routeId !== routeId), nextConfig];
}
