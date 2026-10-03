import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.drawgyotong.game",
  appName: "메트로 메이커",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
  plugins: {
    // 키보드가 올라와도 웹 화면 크기를 줄이지 않는다. 줄이면 화면 전체 UI가 함께 밀려 올라가고,
    // 입력칸이 잘려 한글 조합이 깨졌다. 입력 내용은 웹의 입력 미리보기(keyboardPreview)로 보여 준다.
    SystemBars: { insetsHandling: "disable" },
  },
};

export default config;
