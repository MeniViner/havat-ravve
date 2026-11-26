package com.menis10tec.havatravve;

import android.Manifest;
import android.content.*;
import android.location.*;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.webkit.WebViewFeature;

import com.getcapacitor.*;
import com.getcapacitor.annotation.*;

@CapacitorPlugin(
        name = "FarmSurvey",
        permissions = {
            @Permission(
                    alias = "position",
                    strings = {
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    }),
            @Permission(
                    alias = "notifications",
                    strings = {Manifest.permission.POST_NOTIFICATIONS})
        })
public class FarmSurveyPlugin extends Plugin {
    private SurveyAccess access;
    private SurveyStore store;
    private LocationManager locations;

    @Override
    public void load() {
        access = new SurveyAccess(getContext());
        store = SurveyStore.get(getContext());
        locations = getContext().getSystemService(LocationManager.class);
    }

    private interface Action {
        void run(String owner) throws Exception;
    }

    private void checked(PluginCall call, boolean auth, Action action) {
        getActivity()
                .runOnUiThread(
                        () -> {
                            try {
                                String url = getBridge().getWebView().getUrl();
                                Uri uri = url == null ? Uri.EMPTY : Uri.parse(url);
                                if (getBridge().getConfig().isUsingLegacyBridge()
                                        || !WebViewFeature.isFeatureSupported(
                                                WebViewFeature.WEB_MESSAGE_LISTENER)
                                        || !"https".equals(uri.getScheme())
                                        || !"localhost".equals(uri.getEncodedAuthority()))
                                    throw new SecurityException();
                                String owner = access.owner(call.getString("key", ""));
                                if (auth && owner.isEmpty()) throw new SecurityException();
                                action.run(owner);
                            } catch (SecurityException e) {
                                call.reject("נדרש חשבון בעלים מחובר", "owner");
                            } catch (Exception e) {
                                call.reject(
                                        e.getMessage() == null
                                                ? "הפעולה לא הושלמה"
                                                : e.getMessage(),
                                        "survey");
                            }
                        });
    }

    private void stopOwner(String uid) {
        JSObject active = store.recording();
        if (active != null && uid.equals(active.getString("owner"))) {
            store.interrupt(active.getString("id"), "account");
            getContext().stopService(new Intent(getContext(), SurveyService.class));
        }
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        checked(
                call,
                false,
                ignored ->
                        getBridge()
                                .execute(
                                        () -> {
                                            String old = access.boundUid(),
                                                    uid = call.getString("uid", "");
                                            try {
                                                String key =
                                                        access.authorize(
                                                                uid,
                                                                call.getString("token", ""),
                                                                call.getString("previousKey", ""));
                                                if (!old.equals(uid)) stopOwner(old);
                                                JSObject out = new JSObject();
                                                out.put("key", key);
                                                call.resolve(out);
                                            } catch (SecurityException e) {
                                                stopOwner(old);
                                                call.reject(
                                                        "רק חשבון בעלים יכול להקליט שביל", "owner");
                                            } catch (Exception e) {
                                                call.reject(
                                                        "נדרש חיבור כדי לאמת את חשבון הבעלים"
                                                                + " במכשיר",
                                                        "offline");
                                            }
                                        }));
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        checked(
                call,
                false,
                ignored -> {
                    String owner = access.keyOwner(call.getString("key", ""));
                    if (owner.isEmpty()) throw new SecurityException();
                    stopOwner(owner);
                    access.clear();
                    call.resolve();
                });
    }

    private String level() {
        if (SurveyService.granted(getContext(), Manifest.permission.ACCESS_FINE_LOCATION))
            return "precise";
        if (SurveyService.granted(getContext(), Manifest.permission.ACCESS_COARSE_LOCATION))
            return "approximate";
        boolean asked =
                getContext()
                        .getSharedPreferences("survey-permission", 0)
                        .getBoolean("asked", false);
        if (!asked) return "prompt";
        return ActivityCompat.shouldShowRequestPermissionRationale(
                        getActivity(), Manifest.permission.ACCESS_COARSE_LOCATION)
                ? "denied"
                : "blocked";
    }

    private JSObject permissions() {
        JSObject out = new JSObject();
        out.put("level", level());
        out.put("enabled", SurveyService.enabled(getContext()));
        var nm = NotificationManagerCompat.from(getContext());
        boolean visible = nm.areNotificationsEnabled();
        if (Build.VERSION.SDK_INT >= 26) {
            var ch = nm.getNotificationChannel(SurveyService.CHANNEL);
            visible &=
                    ch == null
                            || ch.getImportance()
                                    != android.app.NotificationManager.IMPORTANCE_NONE;
        }
        out.put("notifications", visible);
        return out;
    }

    @PluginMethod
    public void status(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    JSObject out = permissions();
                    JSObject current = store.current(owner);
                    if (current != null) out.put("session", current);
                    call.resolve(out);
                });
    }

    @PluginMethod
    public void ask(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    if ("precise".equals(level())) {
                        call.resolve(permissions());
                        return;
                    }
                    requestPermissionForAlias("position", call, "positionResult");
                });
    }

    @PermissionCallback
    private void positionResult(PluginCall call) {
        getContext()
                .getSharedPreferences("survey-permission", 0)
                .edit()
                .putBoolean("asked", true)
                .apply();
        checked(call, true, owner -> call.resolve(permissions()));
    }

    @PluginMethod
    public void askNotifications(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    if (Build.VERSION.SDK_INT >= 33
                            && !SurveyService.granted(
                                    getContext(), Manifest.permission.POST_NOTIFICATIONS))
                        requestPermissionForAlias("notifications", call, "notificationResult");
                    else call.resolve(permissions());
                });
    }

    @PermissionCallback
    private void notificationResult(PluginCall call) {
        checked(call, true, owner -> call.resolve(permissions()));
    }

    @PluginMethod
    public void settings(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    String target = call.getString("target", "app");
                    String pkg = getContext().getPackageName();
                    Intent intent;
                    if ("device".equals(target))
                        intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    else if ("notifications".equals(target) && Build.VERSION.SDK_INT >= 26) {
                        var manager = NotificationManagerCompat.from(getContext());
                        if (manager.areNotificationsEnabled()
                                && manager.getNotificationChannel(SurveyService.CHANNEL) != null) {
                            intent =
                                    new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                                            .putExtra(
                                                    Settings.EXTRA_CHANNEL_ID,
                                                    SurveyService.CHANNEL);
                        } else intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                        intent.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                    } else
                        intent =
                                new Intent(
                                        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                                        Uri.fromParts("package", pkg, null));
                    getActivity().startActivity(intent);
                    call.resolve();
                });
    }

    private JSObject fix(Location l) {
        JSObject out = new JSObject();
        out.put("lat", l.getLatitude());
        out.put("lng", l.getLongitude());
        out.put("at", l.getTime());
        if (l.hasAccuracy()) out.put("accuracy", l.getAccuracy());
        return out;
    }

    @PluginMethod
    public void readFix(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    try {
                        String source = SurveyService.provider(getContext(), locations);
                        if (source == null) {
                            call.reject("אין מקור מיקום זמין", "unavailable");
                            return;
                        }
                        Location cached = locations.getLastKnownLocation(source);
                        if (cached != null
                                && SystemClock.elapsedRealtimeNanos()
                                                - cached.getElapsedRealtimeNanos()
                                        < 4000000000L) {
                            call.resolve(fix(cached));
                            return;
                        }
                        Handler h = new Handler(Looper.getMainLooper());
                        class Once implements LocationListener, Runnable {
                            boolean done;

                            boolean end() {
                                if (done) return false;
                                done = true;
                                locations.removeUpdates(this);
                                h.removeCallbacks(this);
                                return true;
                            }

                            @Override
                            public void run() {
                                if (end()) call.reject("הזמן לקבלת מדידה חלף", "timeout");
                            }

                            @Override
                            public void onLocationChanged(Location l) {
                                if (end()) call.resolve(fix(l));
                            }

                            @Override
                            public void onProviderDisabled(String p) {
                                if (end()) call.reject("שירותי המיקום אינם זמינים", "unavailable");
                            }

                            @Override
                            public void onProviderEnabled(String p) {}

                            @Override
                            public void onStatusChanged(String p, int status, Bundle b) {}
                        }
                        Once one = new Once();
                        locations.requestLocationUpdates(source, 0, 0, one, Looper.getMainLooper());
                        h.postDelayed(one, 12000);
                    } catch (SecurityException e) {
                        call.reject("הרשאת המיקום השתנתה. בדקו את ההרשאה בהגדרות.", "location");
                    }
                });
    }

    @PluginMethod
    public void control(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    String action = call.getString("action", ""), id = call.getString("id", "");
                    switch (action) {
                        case "start":
                        case "resume":
                            if (!getActivity()
                                            .getLifecycle()
                                            .getCurrentState()
                                            .isAtLeast(Lifecycle.State.RESUMED)
                                    || !"precise".equals(level())
                                    || !SurveyService.enabled(getContext())) {
                                call.reject(
                                        "להתחלת הקלטה פתחו את המפה והפעילו מיקום מדויק",
                                        "location");
                                return;
                            }
                            if (!permissions().optBoolean("notifications")) {
                                call.reject(
                                        "הפעילו התראות כדי לראות את ההקלטה במסך הנעילה",
                                        "notifications");
                                return;
                            }
                            String active =
                                    store.begin(owner, id, "resume".equals(action)).getString("id");
                            try {
                                ContextCompat.startForegroundService(
                                        getContext(),
                                        SurveyService.intent(getContext(), active, "start"));
                            } catch (RuntimeException e) {
                                store.interrupt(active, "service");
                                throw e;
                            }
                            break;
                        case "pause":
                        case "finish":
                            store.transition(
                                    owner,
                                    id,
                                    "pause".equals(action) ? "paused" : "review",
                                    action);
                            getContext().stopService(new Intent(getContext(), SurveyService.class));
                            break;
                        case "saved":
                            store.transition(owner, id, "saved", "reviewed");
                            break;
                        default:
                            throw new IllegalArgumentException("פעולה לא מוכרת");
                    }
                    JSObject out = new JSObject();
                    out.put("session", store.current(owner));
                    call.resolve(out);
                });
    }

    @PluginMethod
    public void samples(PluginCall call) {
        checked(
                call,
                true,
                owner -> {
                    JSObject out = new JSObject();
                    out.put(
                            "items",
                            store.page(
                                    owner,
                                    call.getString("id", ""),
                                    Math.max(0, call.getInt("after", 0))));
                    call.resolve(out);
                });
    }
}
