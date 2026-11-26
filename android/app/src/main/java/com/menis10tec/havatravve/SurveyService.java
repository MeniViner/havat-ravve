package com.menis10tec.havatravve;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.net.Uri;
import android.os.*;

import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public final class SurveyService extends Service implements LocationListener {
    static final String CHANNEL = "farm_survey";
    static final int NOTE = 712;
    private LocationManager locations;
    private String sessionId;
    private final Handler clock = new Handler(Looper.getMainLooper());
    private long lastFix;
    private boolean waiting;

    static boolean granted(Context c, String permission) {
        return c.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    static String provider(Context c, LocationManager m) {
        if (granted(c, Manifest.permission.ACCESS_FINE_LOCATION)
                && m.isProviderEnabled(LocationManager.GPS_PROVIDER))
            return LocationManager.GPS_PROVIDER;
        if (granted(c, Manifest.permission.ACCESS_COARSE_LOCATION)
                && m.isProviderEnabled(LocationManager.NETWORK_PROVIDER))
            return LocationManager.NETWORK_PROVIDER;
        return null;
    }

    static boolean enabled(Context c) {
        LocationManager m = c.getSystemService(LocationManager.class);
        return Build.VERSION.SDK_INT >= 28
                ? m.isLocationEnabled()
                : m.isProviderEnabled(LocationManager.GPS_PROVIDER)
                        || m.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    static Intent intent(Context c, String id, String action) {
        return new Intent(c, SurveyService.class).setAction(action).putExtra("id", id);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locations = getSystemService(LocationManager.class);
        if (Build.VERSION.SDK_INT >= 26)
            getSystemService(NotificationManager.class)
                    .createNotificationChannel(
                            new NotificationChannel(
                                    CHANNEL, "הקלטת שבילים", NotificationManager.IMPORTANCE_LOW));
    }

    private Notification notification() {
        Intent map =
                new Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse("https://havat-ravve.web.app/app/farm/map"),
                        this,
                        MainActivity.class);
        PendingIntent open =
                PendingIntent.getActivity(
                        this,
                        NOTE,
                        map,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        PendingIntent pause =
                PendingIntent.getService(
                        this,
                        NOTE,
                        intent(this, sessionId, "pause")
                                .setData(Uri.fromParts("survey", sessionId, null)),
                        PendingIntent.FLAG_IMMUTABLE);
        PendingIntent finish =
                PendingIntent.getService(
                        this,
                        NOTE + 1,
                        intent(this, sessionId, "finish")
                                .setData(Uri.fromParts("survey", sessionId, null)),
                        PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_farm)
                .setContentTitle("הקלטת שביל בחווה")
                .setContentText(waiting ? "ממתינים למדידת מיקום" : "המדידות נשמרות במכשיר")
                .setContentIntent(open)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .addAction(0, "השהיה", pause)
                .addAction(0, "סיום", finish)
                .build();
    }

    private final Runnable check =
            new Runnable() {
                @Override
                public void run() {
                    if (!granted(SurveyService.this, Manifest.permission.ACCESS_FINE_LOCATION)
                            || !enabled(SurveyService.this)) {
                        interrupted("location");
                        return;
                    }
                    boolean stale = SystemClock.elapsedRealtime() - lastFix > 20000;
                    if (waiting != stale) {
                        waiting = stale;
                        getSystemService(NotificationManager.class).notify(NOTE, notification());
                    }
                    clock.postDelayed(this, 5000);
                }
            };

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        SurveyStore store = SurveyStore.get(this);
        var active = store.recording();
        if (active == null) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent == null || !active.getString("id").equals(intent.getStringExtra("id")))
            return START_NOT_STICKY;
        String id = active.getString("id"), action = intent.getAction();
        if ("pause".equals(action) || "finish".equals(action)) {
            store.transition(
                    active.getString("owner"),
                    id,
                    "pause".equals(action) ? "paused" : "review",
                    action);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!"start".equals(action) || id.equals(sessionId)) return START_NOT_STICKY;
        sessionId = id;
        try {
            waiting = true;
            ServiceCompat.startForeground(
                    this,
                    NOTE,
                    notification(),
                    Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
            String source = provider(this, locations);
            if (source == null || !granted(this, Manifest.permission.ACCESS_FINE_LOCATION)) {
                interrupted("location");
                return START_NOT_STICKY;
            }
            locations.requestLocationUpdates(source, 3000L, 0f, this, Looper.getMainLooper());
            clock.postDelayed(check, 5000);
        } catch (SecurityException e) {
            interrupted("location");
        } catch (RuntimeException e) {
            interrupted("service");
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (sessionId == null) return;
        try {
            SurveyStore.get(this).append(sessionId, location);
            lastFix = location.getElapsedRealtimeNanos() / 1000000L;
            if (waiting) {
                waiting = false;
                getSystemService(NotificationManager.class).notify(NOTE, notification());
            }
        } catch (RuntimeException e) {
            interrupted("storage");
        }
    }

    @Override
    public void onProviderDisabled(String provider) {
        interrupted("location");
    }

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    private void interrupted(String reason) {
        if (sessionId != null) SurveyStore.get(this).interrupt(sessionId, reason);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        clock.removeCallbacks(check);
        locations.removeUpdates(this);
        if (sessionId != null) SurveyStore.get(this).interrupt(sessionId, "service");
        stopForeground(STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
