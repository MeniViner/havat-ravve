package com.menis10tec.havatravve;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.location.Location;
import android.os.Build;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.util.UUID;

/** One writer in the application process. A committed sample survives abrupt process death. */
final class SurveyStore extends SQLiteOpenHelper {
    private static SurveyStore instance;

    static synchronized SurveyStore get(Context context) {
        if (instance == null) {
            instance = new SurveyStore(context.getApplicationContext());
            instance.getWritableDatabase()
                    .execSQL(
                            "UPDATE sessions SET state='interrupted',reason='process' WHERE"
                                + " state='recording'");
        }
        return instance;
    }

    private SurveyStore(Context context) {
        super(context, "farm-survey.db", null, 1);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL(
                "CREATE TABLE sessions(id TEXT PRIMARY KEY, owner TEXT NOT NULL, state TEXT NOT"
                    + " NULL, started INTEGER NOT NULL, segment INTEGER NOT NULL DEFAULT 1, reason"
                    + " TEXT NOT NULL DEFAULT 'start', count INTEGER NOT NULL DEFAULT 0, lastAt"
                    + " INTEGER)");
        db.execSQL("CREATE UNIQUE INDEX one_open ON sessions(owner) WHERE state != 'saved'");
        db.execSQL("CREATE UNIQUE INDEX one_recording ON sessions(state) WHERE state='recording'");
        db.execSQL(
                "CREATE TABLE samples(session TEXT NOT NULL, seq INTEGER NOT NULL, segment INTEGER"
                    + " NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, at INTEGER NOT NULL, mono"
                    + " INTEGER NOT NULL, accuracy REAL, provider TEXT, mock INTEGER NOT NULL,"
                    + " quality TEXT NOT NULL, PRIMARY KEY(session,seq),"
                    + " UNIQUE(session,mono,provider))");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int from, int to) {
        throw new IllegalStateException("Unsupported survey database version");
    }

    private static JSObject row(Cursor c) {
        JSObject o = new JSObject();
        for (int i = 0; i < c.getColumnCount(); i++) {
            String key = c.getColumnName(i);
            switch (c.getType(i)) {
                case Cursor.FIELD_TYPE_INTEGER:
                    o.put(key, c.getLong(i));
                    break;
                case Cursor.FIELD_TYPE_FLOAT:
                    o.put(key, c.getDouble(i));
                    break;
                case Cursor.FIELD_TYPE_STRING:
                    o.put(key, c.getString(i));
                    break;
                default:
                    break;
            }
        }
        return o;
    }

    private JSObject first(String sql, String... args) {
        try (Cursor c = getReadableDatabase().rawQuery(sql, args)) {
            return c.moveToFirst() ? row(c) : null;
        }
    }

    synchronized JSObject current(String owner) {
        return first("SELECT * FROM sessions WHERE owner=? AND state!='saved'", owner);
    }

    synchronized JSObject recording() {
        return first("SELECT * FROM sessions WHERE state='recording'");
    }

    synchronized JSObject begin(String owner, String id, boolean resume) {
        JSObject open = current(owner);
        if (open == null && !resume) {
            id = UUID.randomUUID().toString();
            getWritableDatabase()
                    .execSQL(
                            "INSERT INTO sessions(id,owner,state,started)"
                                + " VALUES(?,?,'recording',?)",
                            new Object[] {id, owner, System.currentTimeMillis()});
        } else if (open != null
                && id.equals(open.getString("id"))
                && resume
                && ("paused".equals(open.getString("state"))
                        || "interrupted".equals(open.getString("state")))) {
            getWritableDatabase()
                    .execSQL(
                            "UPDATE sessions SET"
                                + " state='recording',segment=segment+1,reason='resume' WHERE id=?",
                            new Object[] {id});
        } else if (open == null
                || !"recording".equals(open.getString("state"))
                || (resume && !id.equals(open.getString("id")))) {
            throw new IllegalStateException("יש הקלטה שמחכה להמשך או לסקירה");
        }
        return current(owner);
    }

    synchronized void transition(String owner, String id, String next, String reason) {
        JSObject s = current(owner);
        if (s == null || !id.equals(s.getString("id")))
            throw new IllegalStateException("ההקלטה התחלפה. חזרו למפה");
        String state = s.getString("state");
        if (state.equals(next)) return;
        boolean ok =
                (state.equals("recording") && (next.equals("interrupted") || next.equals("paused")))
                        || (next.equals("review") && !state.equals("saved"))
                        || (next.equals("saved") && state.equals("review"));
        if (!ok) throw new IllegalStateException("הפעולה אינה זמינה במצב ההקלטה הנוכחי");
        getWritableDatabase()
                .execSQL(
                        "UPDATE sessions SET state=?,reason=? WHERE owner=? AND id=?",
                        new Object[] {next, reason, owner, id});
    }

    synchronized void interrupt(String id, String reason) {
        getWritableDatabase()
                .execSQL(
                        "UPDATE sessions SET state='interrupted',reason=? WHERE id=? AND"
                            + " state='recording'",
                        new Object[] {reason, id});
    }

    synchronized void append(String id, Location loc) {
        if (!Double.isFinite(loc.getLatitude())
                || !Double.isFinite(loc.getLongitude())
                || Math.abs(loc.getLatitude()) > 90
                || Math.abs(loc.getLongitude()) > 180) return;
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            JSObject s =
                    first(
                            "SELECT count,segment FROM sessions WHERE id=? AND state='recording'",
                            id);
            if (s == null) return;
            JSObject last =
                    first(
                            "SELECT segment,lat,lng,mono,quality FROM samples WHERE session=? ORDER"
                                + " BY seq DESC LIMIT 1",
                            id);
            int segment = s.optInt("segment"), seq = s.optInt("count") + 1;
            String quality = loc.hasAccuracy() && loc.getAccuracy() <= 40 ? "ok" : "weak";
            if (last != null && segment == last.optInt("segment")) {
                double seconds = (loc.getElapsedRealtimeNanos() - last.optLong("mono")) / 1e9;
                float[] metres = new float[1];
                Location.distanceBetween(
                        last.optDouble("lat"),
                        last.optDouble("lng"),
                        loc.getLatitude(),
                        loc.getLongitude(),
                        metres);
                if (seconds <= 0 || seconds > 20) {
                    segment++;
                    if (quality.equals("ok")) quality = "gap";
                } else if (metres[0] > Math.max(35, seconds * 12)) {
                    segment++;
                    if (quality.equals("ok")) quality = "jump";
                } else if (quality.equals("weak")
                        || "weak".equals(last.getString("quality"))
                        || "jump".equals(last.getString("quality"))) segment++;
            }
            ContentValues v = new ContentValues();
            v.put("session", id);
            v.put("seq", seq);
            v.put("segment", segment);
            v.put("lat", loc.getLatitude());
            v.put("lng", loc.getLongitude());
            v.put("at", loc.getTime());
            v.put("mono", loc.getElapsedRealtimeNanos());
            v.put("provider", loc.getProvider());
            v.put("mock", Build.VERSION.SDK_INT >= 31 ? loc.isMock() : loc.isFromMockProvider());
            if (loc.hasAccuracy()) v.put("accuracy", loc.getAccuracy());
            v.put("quality", quality);
            if (db.insertWithOnConflict("samples", null, v, SQLiteDatabase.CONFLICT_IGNORE) != -1) {
                db.execSQL(
                        "UPDATE sessions SET count=?, segment=?, lastAt=? WHERE id=?",
                        new Object[] {seq, segment, loc.getTime(), id});
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    synchronized JSArray page(String owner, String id, int after) {
        JSArray items = new JSArray();
        try (Cursor c =
                getReadableDatabase()
                        .rawQuery(
                                "SELECT"
                                    + " p.seq,p.segment,p.lat,p.lng,p.at,p.accuracy,p.provider,p.mock,p.quality"
                                    + " FROM samples p JOIN sessions s ON s.id=p.session WHERE"
                                    + " s.owner=? AND s.id=? AND p.seq>? ORDER BY p.seq LIMIT 128",
                                new String[] {owner, id, String.valueOf(after)})) {
            while (c.moveToNext()) items.put(row(c));
        }
        return items;
    }
}
