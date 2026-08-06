const fs = require("node:fs");
const path = require("node:path");

const generatedPluginBuildFile = path.join(
  __dirname,
  "..",
  "android",
  "capacitor-cordova-android-plugins",
  "build.gradle",
);
const generatedAgpVersion = "8.13.0";
const supportedAgpVersion = "8.10.1";

if (!fs.existsSync(generatedPluginBuildFile)) {
  throw new Error(`Capacitor Android project not found: ${generatedPluginBuildFile}`);
}

const source = fs.readFileSync(generatedPluginBuildFile, "utf8");
const updated = source.replaceAll(
  `com.android.tools.build:gradle:${generatedAgpVersion}`,
  `com.android.tools.build:gradle:${supportedAgpVersion}`,
);

if (updated === source && !source.includes(`com.android.tools.build:gradle:${supportedAgpVersion}`)) {
  throw new Error("Could not find the generated Capacitor AGP dependency to patch.");
}

fs.writeFileSync(generatedPluginBuildFile, updated);
