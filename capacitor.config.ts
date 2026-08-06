import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.drawgyotong.game",
  appName: "Draw Gyotong",
  webDir: "dist",
  server: {
    androidScheme: "https",
  },
};

export default config;
