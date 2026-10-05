/**
 * 표면(패널·대화상자·전체 화면)의 이탈 모션 (DESIGN_SYSTEM §13).
 *
 * 게임 코드는 표면을 `element.hidden = true`로 닫는다. hidden은 즉시 display:none이 되어 이탈 모션을 보일 수 없으므로,
 * 아래 선택자에 해당하는 보이는 표면은 `is-leaving` 클래스로 짧은 이탈 애니메이션을 먼저 보인 뒤 실제로 숨긴다.
 * - 이탈 중에도 `element.hidden`은 true를 돌려준다(닫았다는 상태는 즉시 반영).
 * - 이탈 중에 다시 열면(hidden = false) 이탈을 취소하고 그대로 보인다.
 * - 모션 감소(시스템 설정, 앱 설정 body.reduced-motion)에서는 기존처럼 즉시 숨긴다.
 */

const EXIT_SELECTOR = [
  ".game-inspector",
  ".game-side-panel",
  ".game-rail-overflow",
  ".dg-scrim",
  ".dg-workspace",
  ".game-title__sheet",
  ".game-bottom-bar",
].join(", ");

/** hud.css의 이탈 애니메이션 길이(--dur-exit)와 맞춘다. */
const EXIT_MS = 140;

function motionAllowed() {
  if (document.body.classList.contains("reduced-motion")) return false;
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function installExitMotion() {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "hidden");
  if (!descriptor?.get || !descriptor.set) return;
  const nativeGet = descriptor.get;
  const nativeSet = descriptor.set;
  const leaving = new WeakMap<HTMLElement, number>();

  Object.defineProperty(HTMLElement.prototype, "hidden", {
    configurable: true,
    enumerable: descriptor.enumerable,
    get(this: HTMLElement) {
      return leaving.has(this) ? true : nativeGet.call(this);
    },
    set(this: HTMLElement, value: boolean) {
      const pending = leaving.get(this);
      if (pending !== undefined) {
        window.clearTimeout(pending);
        leaving.delete(this);
        this.classList.remove("is-leaving");
      }
      const shouldAnimate =
        Boolean(value) &&
        !nativeGet.call(this) &&
        this.isConnected &&
        this.matches(EXIT_SELECTOR) &&
        this.getClientRects().length > 0 &&
        motionAllowed();
      if (!shouldAnimate) {
        nativeSet.call(this, value);
        return;
      }
      this.classList.add("is-leaving");
      leaving.set(this, window.setTimeout(() => {
        leaving.delete(this);
        this.classList.remove("is-leaving");
        nativeSet.call(this, true);
      }, EXIT_MS));
    },
  });
}

/**
 * 접기·펼치기처럼 표면의 높이가 바뀌는 변경을 부드럽게 보인다(§13 빠른 상태 전환).
 * 바꾸기 전후 높이를 재고 그 사이를 짧게 잇는다. 모션 감소이거나 보이지 않으면 바로 바꾼다.
 */
export function animateHeightChange(element: HTMLElement | null | undefined, mutate: () => void) {
  if (!element || !motionAllowed() || element.getClientRects().length === 0) {
    mutate();
    return;
  }
  const from = element.getBoundingClientRect().height;
  mutate();
  const to = element.getBoundingClientRect().height;
  if (Math.abs(from - to) < 1) return;
  element.animate(
    [{ height: `${from}px`, overflow: "hidden" }, { height: `${to}px`, overflow: "hidden" }],
    { duration: 180, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  );
}
