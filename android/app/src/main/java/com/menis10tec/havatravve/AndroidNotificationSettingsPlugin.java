package com.menis10tec.havatravve;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AndroidNotificationSettings")
public class AndroidNotificationSettingsPlugin extends Plugin {
    private static final String CHANNEL = "farm_updates";

    @PluginMethod
    public void allowed(PluginCall call) {
        NotificationManagerCompat manager = NotificationManagerCompat.from(getContext());
        boolean allowed = manager.areNotificationsEnabled();
        if (allowed && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
            allowed = channel == null || channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String app = getContext().getPackageName();
        Intent intent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, app)
            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", app, null));
        getActivity().startActivity(intent);
        call.resolve();
    }
}
