export type ConnectionChoiceId = "merge" | "transfer" | "cross";

export type ConnectionChoice = {
  id: ConnectionChoiceId;
  title: string;
  description: string;
};

export function getConnectionChoices(input: {
  canMerge: boolean;
  canTransfer: boolean;
}): { defaultChoice: ConnectionChoiceId; choices: ConnectionChoice[] } {
  const choices: ConnectionChoice[] = [];
  if (input.canMerge) {
    choices.push({
      id: "merge",
      title: "노선 병합",
      description: "두 노선을 하나의 운행 노선으로 합치고 기존 배정을 정리합니다.",
    });
  }
  if (input.canTransfer) {
    choices.push({
      id: "transfer",
      title: "환승역으로 연결",
      description: "두 노선은 별도로 유지하고 끝점 인근 두 역 사이에 환승을 만듭니다.",
    });
  }
  choices.push({
    id: "cross",
    title: "연결하지 않고 교차",
    description: "노선 데이터를 변경하지 않고 현재 연결 작업을 종료합니다.",
  });
  return { defaultChoice: choices[0].id, choices };
}

export class ConnectionSubmissionGuard {
  private submitting = false;

  get active() {
    return this.submitting;
  }

  async run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (this.submitting) return undefined;
    this.submitting = true;
    try {
      return await action();
    } finally {
      this.submitting = false;
    }
  }
}
