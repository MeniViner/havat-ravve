package com.menis10tec.havatravve;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle state) {
        registerPlugin(AndroidNotificationSettingsPlugin.class);
        super.onCreate(state);
    }
}
