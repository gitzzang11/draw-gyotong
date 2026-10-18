package com.drawgyotong.game;

import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 지난번 고른 화면 방향을 웹 화면이 뜨기 전에 먼저 적용해, 시작할 때 한 번 돌았다가 돌아오는 일이 없게 한다.
        applyOrientation(getSharedPreferences(PREFS, MODE_PRIVATE).getString(ORIENTATION_KEY, "auto"));
        bridgeOrientation();
        applyImmersiveStatusBar();
        bridgeKeyboardInsets();
        bridgeBackButton();
    }

    private static final String PREFS = "draw-gyotong";
    private static final String ORIENTATION_KEY = "screen-orientation";

    /**
     * 게임 설정의 화면 방향을 웹에서 바꿀 수 있게 한다(window.DrawGyotongNative.setOrientation).
     * auto: 기기의 자동 회전 설정을 따른다(fullUser — 자동 회전이 꺼져 있으면 지금 방향 유지).
     * landscape·portrait: 기기 설정과 상관없이 그 방향(뒤집힌 방향은 센서로 허용).
     */
    private void bridgeOrientation() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setOrientation(String mode) {
                runOnUiThread(() -> {
                    applyOrientation(mode);
                    getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(ORIENTATION_KEY, mode).apply();
                });
            }
        }, "DrawGyotongNative");
    }

    private void applyOrientation(String mode) {
        int requested = "landscape".equals(mode)
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : "portrait".equals(mode)
                ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                : ActivityInfo.SCREEN_ORIENTATION_FULL_USER;
        if (getRequestedOrientation() != requested) setRequestedOrientation(requested);
    }

    /**
     * 시스템 뒤로가기: 게임 화면에 먼저 묻는다(window.__drawGyotongBack, MOBILE_UX §9 순서로 한 단계만 닫음).
     * 게임이 처리하면 끝, 처리할 것이 없다고 하면(두 번 눌러 종료 확인) 앱을 닫는다.
     * 게임 쪽 함수가 아직 없으면(로딩 중) 예전처럼 웹 기록 뒤로가기 → 없으면 종료.
     */
    private void bridgeBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    exitByBack(this);
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){try{return typeof window.__drawGyotongBack===function?(window.__drawGyotongBack()?handled:exit):none;}catch(e){return none;}})()",
                    (result) -> {
                        if (result != null && result.contains("handled")) return;
                        if (result != null && result.contains("none") && webView.canGoBack()) {
                            webView.goBack();
                            return;
                        }
                        exitByBack(this);
                    }
                );
            }
        });
    }

    private void exitByBack(OnBackPressedCallback callback) {
        callback.setEnabled(false);
        getOnBackPressedDispatcher().onBackPressed();
        callback.setEnabled(true);
    }

    /**
     * 화면을 가장자리까지 쓰므로(decorFitsSystemWindows=false) 가상키보드가 올라와도 웹 화면 크기가 줄지 않는다.
     * 키보드 표시 여부와 높이(CSS px)를 웹에 "native-keyboard" 이벤트로 알려, 입력 미리보기를 키보드에 가리지 않는 곳에 띄운다.
     * WebView 자신에게는 키보드가 없는 것처럼 전달해 화면이 줄거나 밀리지 않게 한다.
     */
    private void bridgeKeyboardInsets() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        ViewCompat.setOnApplyWindowInsetsListener(webView, (View view, WindowInsetsCompat insets) -> {
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean visible = insets.isVisible(WindowInsetsCompat.Type.ime());
            float density = getResources().getDisplayMetrics().density;
            int height = Math.round(ime.bottom / density);
            webView.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('native-keyboard',{detail:{visible:" + visible + ",height:" + height + "}}))",
                null
            );
            // WebView에는 키보드 영역을 숨긴다. 그대로 넘기면 WebView가 보이는 영역을 줄이고 입력칸 쪽으로 끌어올려
            // 화면 전체 UI가 함께 밀린다. 키보드 높이는 위 이벤트로 웹에 따로 알린다.
            WindowInsetsCompat withoutIme = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.NONE)
                .setVisible(WindowInsetsCompat.Type.ime(), false)
                .build();
            return ViewCompat.onApplyWindowInsets(view, withoutIme);
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        applyImmersiveStatusBar();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            applyImmersiveStatusBar();
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyImmersiveStatusBar();
    }

    private void applyImmersiveStatusBar() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(),
            getWindow().getDecorView()
        );
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.statusBars());
    }
}
