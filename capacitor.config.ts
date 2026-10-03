import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.drawgyotong.game",
  appName: "메트로 메이커",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
