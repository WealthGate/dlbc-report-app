import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dlbc.dominica.reports",
  appName: "DLBC Reporting",
  webDir: "dist",
  server: {
    url: "https://dlbcdom.web.app",
    androidScheme: "https",
    cleartext: false
  }
};

export default config;
