# 🚆 Draw Gyotong (드로우 교통)

<div align="center">

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-1.0.0-emerald.svg)
![Platform](https://img.shields.io/badge/platform-Web%20%7C%20Android-lightgrey.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF.svg)
![Capacitor](https://img.shields.io/badge/Capacitor-8.5-119EFF.svg)

<p align="center">
  <b>실제 지도 및 실제 인구 분포 기반 대중교통 노선망 시뮬레이션 게임</b><br>
  지도 위에 직접 철도와 버스 노선을 설계하고 건설하여 교통망을 확장하고 승객 만족도를 높여보세요!
</p>

[📥 최신 APK 다운로드](https://github.com/gitzzang11/draw-gyotong/releases/latest) • [🎮 게임 시작하기](#-빠른-시작) • [✨ 주요 기능](#-주요-기능) • [🛠️ 빌드 및 개발](#️-빌드-및-개발)

</div>

---

## 📖 소개 (Overview)

**Draw Gyotong**은 실제 지리 데이터(OpenStreetMap/Leaflet)와 실제 인구 밀도 데이터를 바탕으로 대중교통망을 계획하고 운영하는 도시 철도/버스 경영 시뮬레이션 게임입니다.

복잡하고 사실적인 승객 수요 흐름, 환승 시스템, 노선별 배차 및 차량 기지 연결, 재정 및 대출 관리까지 대중교통 네트워크 운영의 모든 요소를 경험할 수 있습니다.

---

## ✨ 주요 기능 (Key Features)

- 🗺️ **실제 지도 기반 노선 건설 (Real Geographic Map)**
  - 실제 지도 위에서 역을 세우고, 선로/도로를 연결하며 나만의 교통망을 구축
  - 철도, 지하철, 간선/지선 버스 등 다양한 교통수단 지원
- 👥 **현실적인 수요 및 환승 시뮬레이션 (Realistic Demand & Transfer)**
  - WorldPop 기반 실제 인구 밀도에 따른 구역별 출퇴근/일상 통행 수요 반영
  - 다중 노선 간 환승 링크 및 승객 최단 경로 탐색 (Transit Routing)
- 💰 **재정 및 경영 시뮬레이션 (Economy & Management)**
  - 운임 수익, 건설/유지보수 비용, 차량 도입비, 대출 및 이자 시스템
  - 운영 예측(Operating Forecast) 및 혼잡도 기반 승객 만족도 지표 제공
- 📱 **모바일 최적화 및 크로스 플랫폼 (Mobile Landscape UX)**
  - 모바일 가로 화면에 최적화된 직관적인 HUD 및 컨텍스트 서피스 디자인
  - Capacitor 기반 Android APK 지원

---

## 🚀 빠른 시작 (Getting Started)

### 필수 요구사항
- [Node.js](https://nodejs.org/) (v18 이상 권장)
- [npm](https://www.npmjs.com/)

### 설치 및 로컬 실행

```bash
# 1. 저장소 클론
git clone https://github.com/gitzzang11/draw-gyotong.git
cd draw-gyotong

# 2. 패키지 의존성 설치
npm install

# 3. 개발 서버 실행
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속하면 바로 플레이할 수 있습니다.

---

## 🛠️ 빌드 및 개발 (Build & Android)

### 웹 프로덕션 빌드
```bash
npm run build
```

### Android APK 빌드
Android Studio 또는 Android SDK/JDK가 설치되어 있어야 합니다.

```bash
# 디버그 APK 빌드 (release_apk 폴더에 자동 복사)
npm run apk:debug

# 사소한 변경 패치 버전 업그레이드 후 빌드 (예: v1.0.0 -> v1.0.1)
npm run apk:patch

# 중대한 변경 마이너 버전 업그레이드 후 빌드 (예: v1.0.0 -> v1.1.0)
npm run apk:minor
```

빌드된 APK 파일은 루트의 `release_apk/` 디렉토리에 버전명으로 자동 저장됩니다.

---

## 📁 프로젝트 구조 (Project Structure)

```text
draw-gyotong/
├── android/                 # Capacitor Android 네이티브 프로젝트
├── docs/                    # 디자인 시스템 및 UX 문서
│   └── design/
│       ├── DESIGN_SYSTEM.md # 시각/컴포넌트 토큰 및 디자인 규칙
│       └── MOBILE_UX.md     # 모바일 가로화면 UX 가이드
├── public/                  # 정적 리소스 및 데이터 에셋
├── release_apk/             # 빌드된 APK 파일 저장소
├── src/                     # 시뮬레이션 및 UI 핵심 소스코드
│   ├── domain/              # 네트워크/재정/이벤트/시뮬레이션 타입 정의
│   ├── storage/             # 세이브/로드 및 데이터 무결성 검증
│   ├── main.ts              # 메인 애플리케이션 엔트리
│   ├── demandModel.ts       # 인구 밀도 기반 승객 수요 모델
│   ├── transitRouting.ts    # 대중교통 경로 탐색 알고리즘
│   └── congestion.ts        # 혼잡도 및 용량 계산
└── package.json
```

---

## 📄 라이선스 (License)

이 프로젝트는 [MIT License](LICENSE)를 따릅니다.
