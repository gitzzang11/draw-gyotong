export type ExtendableLine = {
  id: string;
  name: string;
  color: string;
  coordinates: Array<[number, number]>;
  lengthKm: number;
  constructionCost: number;
  riverCrossings: number;
  mountainSegments: number;
};

export type LineExtensionPayload = {
  targetLineId: string;
  atStart: boolean;
  coordinates: Array<[number, number]>;
  lengthKm: number;
  constructionCost: number;
  riverCrossings: number;
  mountainSegments: number;
};

export function mergeLineExtension<T extends ExtendableLine>(line: T, extension: LineExtensionPayload): T {
  if (line.id !== extension.targetLineId) throw new Error("Extension target line does not match.");
  if (extension.coordinates.length < 2) throw new Error("Extension requires an anchor and at least one new coordinate.");
  const newCoordinates = extension.coordinates.slice(1);
  const coordinates = extension.atStart
    ? [...newCoordinates.slice().reverse(), ...line.coordinates]
    : [...line.coordinates, ...newCoordinates];
  return {
    ...line,
    coordinates: dedupeAdjacentCoordinates(coordinates),
    lengthKm: roundOneDecimal(line.lengthKm + extension.lengthKm),
    constructionCost: line.constructionCost + extension.constructionCost,
    riverCrossings: line.riverCrossings + extension.riverCrossings,
    mountainSegments: line.mountainSegments + extension.mountainSegments,
  };
}

function dedupeAdjacentCoordinates(coordinates: Array<[number, number]>) {
  return coordinates.filter((coordinate, index) =>
    index === 0 || coordinate[0] !== coordinates[index - 1][0] || coordinate[1] !== coordinates[index - 1][1]
  );
}

function roundOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
