package com.menis10tec.havatravve;

import android.content.*;
import android.util.Base64;

import org.json.JSONObject;

import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * Firestore verifies the Firebase ID token and the same isOwner() rule as the app. The projection
 * requests only a document name; it works even for an empty collection.
 */
final class SurveyAccess {
    private final SharedPreferences prefs;
    private static final long FIELD_ACCESS_MS = 7L * 86400000L;

    SurveyAccess(Context c) {
        prefs = c.getSharedPreferences("survey-access", Context.MODE_PRIVATE);
    }

    synchronized String authorize(String uid, String token, String previousKey) throws Exception {
        if (uid.isEmpty()) throw new SecurityException();
        if (!token.isEmpty()) {
            String project = BuildConfig.SURVEY_TEST_BACKEND ? "demo-havat-ravve" : "havat-ravve";
            String[] parts = token.split("\\.", -1);
            if (parts.length != 3) throw new SecurityException();
            JSONObject claims =
                    new JSONObject(
                            new String(
                                    Base64.decode(parts[1], Base64.URL_SAFE),
                                    StandardCharsets.UTF_8));
            if (!uid.equals(claims.optString("sub"))
                    || !project.equals(claims.optString("aud"))
                    || !("https://securetoken.google.com/" + project)
                            .equals(claims.optString("iss"))) throw new SecurityException();
            String base =
                    BuildConfig.SURVEY_TEST_BACKEND
                            ? "http://localhost:8080"
                            : "https://firestore.googleapis.com";
            HttpURLConnection conn =
                    (HttpURLConnection)
                            new URL(
                                            base
                                                    + "/v1/projects/"
                                                    + project
                                                    + "/databases/(default)/documents:runQuery")
                                    .openConnection();
            try {
                conn.setConnectTimeout(4500);
                conn.setReadTimeout(4500);
                conn.setInstanceFollowRedirects(false);
                conn.setRequestMethod("POST");
                conn.setDoOutput(true);
                conn.setRequestProperty("Authorization", "Bearer " + token);
                conn.setRequestProperty("Content-Type", "application/json");
                String body =
                        "{\"structuredQuery\":{\"select\":{\"fields\":[{\"fieldPath\":\"__name__\"}]},\"from\":[{\"collectionId\":\"account_activity\"}],\"limit\":1}}";
                try (var out = conn.getOutputStream()) {
                    out.write(body.getBytes(StandardCharsets.UTF_8));
                }
                int status = conn.getResponseCode();
                if (status == 200) {
                    String key =
                            uid.equals(prefs.getString("uid", ""))
                                    ? prefs.getString("key", "")
                                    : "";
                    if (key.isEmpty()) key = UUID.randomUUID().toString();
                    if (!prefs.edit()
                            .putString("uid", uid)
                            .putString("key", key)
                            .putLong("until", System.currentTimeMillis() + FIELD_ACCESS_MS)
                            .commit()) throw new IllegalStateException();
                    return key;
                }
                if (status < 500 && status != 429) {
                    clear();
                    throw new SecurityException();
                }
            } catch (IOException offline) {
                /* A previously verified owner can work in the field. */
            } finally {
                conn.disconnect();
            }
        }
        if (uid.equals(owner(previousKey))) return previousKey;
        throw new IllegalStateException("נדרש חיבור כדי לאמת את חשבון הבעלים במכשיר");
    }

    synchronized String owner(String key) {
        return System.currentTimeMillis() < prefs.getLong("until", 0) ? keyOwner(key) : "";
    }

    synchronized String keyOwner(String key) {
        return !key.isEmpty() && key.equals(prefs.getString("key", "")) ? boundUid() : "";
    }

    synchronized String boundUid() {
        return prefs.getString("uid", "");
    }

    synchronized void clear() {
        prefs.edit().clear().commit();
    }
}
