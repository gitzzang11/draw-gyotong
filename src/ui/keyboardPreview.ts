/**
 * 가상키보드 입력 미리보기.
 *
 * 모바일 가로 화면에서는 가상키보드가 화면 아래쪽 절반 이상을 덮어, 입력 중인 칸이 가려지는 경우가 있다.
 * 글자 입력칸에 포커스가 있고 키보드가 열려 있으면 입력 중인 내용을 키보드에 가리지 않는 영역의 가운데에 크게 보여 준다.
 *
 * 키보드 감지:
 * - 안드로이드 앱: MainActivity가 보내는 "native-keyboard" 이벤트(표시 여부·높이 CSS px)
 * - 브라우저: visualViewport 높이가 평소보다 크게 줄었을 때
 * 실제 입력은 원래 입력칸에서 일어나고, 미리보기는 보여 주기만 한다(aria-hidden).
 */

type KeyboardState = { visible: boolean; height: number };

const textInputTypes = new Set(["", "text", "search", "number", "tel", "url", "email"]);

export function isTextEntry(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
  if (element instanceof HTMLTextAreaElement) return !element.readOnly && !element.disabled;
  if (!(element instanceof HTMLInputElement) || element.readOnly || element.disabled) return false;
  return textInputTypes.has(element.getAttribute("type") ?? "");
}

/** 입력칸의 이름: 감싼 label의 필드 이름, aria-label, placeholder 순 */
export function fieldLabel(field: HTMLInputElement | HTMLTextAreaElement): string {
  const label = field.closest("label") ?? (field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null);
  const named = label?.querySelector(".dg-field__label, strong")?.textContent ?? label?.textContent;
  return (named ?? field.getAttribute("aria-label") ?? field.placeholder ?? "입력").trim().replace(/\s+/g, " ");
}

export function installKeyboardPreview(root: HTMLElement = document.body) {
  const preview = document.createElement("div");
  preview.className = "game-ime-preview";
  preview.hidden = true;
  preview.setAttribute("aria-hidden", "true");
  preview.innerHTML = `<span class="game-ime-preview__label"></span><span class="game-ime-preview__text"><span class="game-ime-preview__value"></span><i class="game-ime-preview__caret"></i></span>`;
  root.appendChild(preview);
  const labelElement = preview.querySelector<HTMLElement>(".game-ime-preview__label")!;
  const valueElement = preview.querySelector<HTMLElement>(".game-ime-preview__value")!;

  let nativeKeyboard: KeyboardState | null = null;
  let tallestViewport = window.visualViewport?.height ?? window.innerHeight;

  const keyboard = (): KeyboardState => {
    if (nativeKeyboard) return nativeKeyboard;
    const viewport = window.visualViewport;
    const height = viewport?.height ?? window.innerHeight;
    tallestViewport = Math.max(tallestViewport, height);
    const covered = Math.round(tallestViewport - height);
    return { visible: covered > 120, height: covered };
  };

  const render = () => {
    // 포커스 이벤트가 오지 않는 경우(창 비활성 등)도 있어, 그릴 때마다 현재 포커스된 칸을 직접 본다.
    const active = document.activeElement;
    const field = isTextEntry(active) ? active : null;
    const state = keyboard();
    if (!field || !state.visible || !document.contains(field)) {
      preview.hidden = true;
      return;
    }
    labelElement.textContent = fieldLabel(field);
    const value = field.value;
    valueElement.textContent = value || field.placeholder || "";
    valueElement.dataset.placeholder = String(!value);
    // 키보드에 가리지 않는 영역(위쪽)의 가운데
    const viewport = window.visualViewport;
    const top = viewport?.offsetTop ?? 0;
    const visibleHeight = nativeKeyboard ? window.innerHeight - nativeKeyboard.height : viewport?.height ?? window.innerHeight;
    preview.style.top = `${Math.round(top + Math.max(40, visibleHeight / 2))}px`;
    preview.hidden = false;
  };

  document.addEventListener("focusin", render);
  // 다른 입력칸으로 옮겨 가는 경우를 기다린 뒤 다시 본다.
  document.addEventListener("focusout", () => window.setTimeout(render, 0));
  // 한글 조합 중에도 글자가 바뀔 때마다 보인다.
  for (const type of ["input", "compositionupdate", "compositionend", "keyup"] as const) {
    document.addEventListener(type, (event) => {
      if (isTextEntry(event.target as Element)) window.requestAnimationFrame(render);
    });
  }
  window.addEventListener("native-keyboard", (event) => {
    const detail = (event as CustomEvent<KeyboardState>).detail;
    nativeKeyboard = detail && typeof detail.visible === "boolean" ? { visible: detail.visible, height: Math.max(0, Number(detail.height) || 0) } : null;
    render();
  });
  window.visualViewport?.addEventListener("resize", render);
  window.visualViewport?.addEventListener("scroll", render);
  return preview;
}
