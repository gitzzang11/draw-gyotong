package com.drawgyotong.game;

import android.content.res.Configuration;
import android.os.Bundle;
import android.view.View;
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
        applyImmersiveStatusBar();
        bridgeKeyboardInsets();
        bridgeBackButton();
    }

    /**
     * 시스템 뒤로가기: 웹 기록이 있으면(시작 화면 안내판 등) 웹에서 한 단계 뒤로 가고, 없을 때만 앱을 닫는다.
     * Capacitor App 플러그인이 없으면 기본 동작이 곧바로 앱 종료라 안내판을 닫을 수 없었다.
     */
    private void bridgeBackButton() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
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
