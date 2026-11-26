package com.menis10tec.havatravve;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(AndroidNotificationSettingsPlugin.class);
        registerPlugin(FarmSurveyPlugin.class);
        super.onCreate(state);
        android.webkit.WebSettings settings = bridge.getWebView().getSettings();
        settings.setUserAgentString(settings.getUserAgentString() + " HavatRavve/1.0 (+https://havat-ravve.web.app)");
    }
}
