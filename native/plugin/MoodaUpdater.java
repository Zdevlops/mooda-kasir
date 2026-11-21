package com.mooda.kasir;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * MoodaUpdater - membaca rilis terbaru dari GitHub, mengunduh APK-nya, lalu
 * menyerahkannya ke pemasang Android.
 *
 * Android tidak pernah memasang diam-diam untuk aplikasi yang dipasang sendiri
 * (sideload), jadi langkah terakhir selalu satu ketukan konfirmasi dari pengguna.
 */
public final class MoodaUpdater {

    private MoodaUpdater() {
    }

    private static final String OWNER = "Zdevlops";
    private static final String REPO = "mooda-kasir";
    private static final String LATEST = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/releases/latest";
    private static final String USER_AGENT = "MoodA-Updater";

    /** Jawaban yang berhasil dipakai ulang selama ini, dan dipakai lagi bila jaringan menolak. */
    private static final long CACHE_MS = 30L * 60L * 1000L;

    /** Berkas di cacheDir; MoodaApkProvider melayani tepat berkas ini. */
    static final String APK_NAME = "mooda-update.apk";

    private static final Pattern CODE_IN_BODY = Pattern.compile("mooda:versionCode=(\\d+)");

    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    public static final class Release {
        public final String version;
        public final String apkUrl;
        public final long code;

        Release(String version, String apkUrl, long code) {
            this.version = version;
            this.apkUrl = apkUrl;
            this.code = code;
        }
    }

    public interface CheckCallback {
        void onResult(Release release, String error);
    }

    public interface InstallCallback {
        void onResult(boolean ok, String error);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getApplicationContext().getSharedPreferences("mooda-update", Context.MODE_PRIVATE);
    }

    static String versionName(Context ctx) {
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return info.versionName == null ? "" : info.versionName;
        } catch (Exception err) {
            return "";
        }
    }

    static long versionCode(Context ctx) {
        try {
            PackageInfo info = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            return localVersionCode(info);
        } catch (Exception err) {
            return 0L;
        }
    }

    @SuppressWarnings("deprecation")
    private static long localVersionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.longVersionCode : (long) info.versionCode;
    }

    /** Tanya GitHub soal rilis terbaru. Callback berjalan di thread utama. */
    public static void check(final Context context, final CheckCallback cb) {
        final Context app = context.getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                Release remote = null;
                String error = null;
                try {
                    remote = fetchLatest(app);
                } catch (Throwable t) {
                    error = t.getMessage() == null ? t.toString() : t.getMessage();
                }
                boolean newer = remote != null && isNewer(remote, versionName(app), versionCode(app));
                final Release out = newer ? remote : null;
                final String err = error;
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        cb.onResult(out, err);
                    }
                });
            }
        }, "mooda-update-check").start();
    }

    /** Unduh lalu buka pemasang. Callback berjalan di thread utama. */
    public static void downloadAndInstall(final Context context, final InstallCallback cb) {
        final Context app = context.getApplicationContext();
        final SharedPreferences p = prefs(app);
        final String url = p.getString("cachedUrl", "");
        final long code = p.getLong("cachedCode", 0L);

        if (url == null || url.isEmpty()) {
            MAIN.post(new Runnable() {
                @Override
                public void run() {
                    cb.onResult(false, "Belum ada info pembaruan. Tekan Cek pembaruan dulu.");
                }
            });
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                boolean ok = false;
                String error = null;
                try {
                    ok = download(app, url) && apkOk(app, code);
                    if (!ok) error = "Unduhan gagal atau berkas tidak utuh.";
                } catch (Throwable t) {
                    error = t.getMessage() == null ? t.toString() : t.getMessage();
                }
                final boolean done = ok;
                final String err = error;
                MAIN.post(new Runnable() {
                    @Override
                    public void run() {
                        if (done) {
                            launchInstaller(app, code);
                            cb.onResult(true, null);
                        } else {
                            cb.onResult(false, err);
                        }
                    }
                });
            }
        }, "mooda-update-download").start();
    }

    /** True bila pengguna sudah mengizinkan aplikasi ini memasang APK. */
    public static boolean canInstall(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return true;
        return ctx.getPackageManager().canRequestPackageInstalls();
    }

    /** Buka layar "pasang aplikasi tidak dikenal" untuk MoodA. */
    public static void openInstallPermission(Context ctx) {
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception err) {
            // Layar pengaturan tidak tersedia di sebagian perangkat; pengguna bisa membukanya manual.
        }
    }

    /**
     * Berkas di disk harus benar-benar APK yang bisa dipasang untuk build yang
     * kita umumkan. Unduhan terpotong pernah diserahkan ke pemasang, dan
     * jawabannya hanya "aplikasi tidak terpasang" tanpa penjelasan.
     */
    private static boolean apkOk(Context ctx, long code) {
        File out = new File(ctx.getCacheDir(), APK_NAME);
        if (out.length() <= 0L) return false;
        PackageInfo info = ctx.getPackageManager().getPackageArchiveInfo(out.getAbsolutePath(), 0);
        if (info == null) return false;
        if (!ctx.getPackageName().equals(info.packageName)) return false;
        if (code <= 0L) return true;
        return localVersionCode(info) == code;
    }

    /**
     * Menjawab dari cache bila masih segar, dan memakai cache bila jaringan
     * menolak. GitHub hanya memberi 60 permintaan anonim per jam per IP.
     */
    private static Release fetchLatest(Context ctx) throws Exception {
        SharedPreferences p = prefs(ctx);
        long cachedCode = p.getLong("cachedCode", 0L);
        String cachedUrl = p.getString("cachedUrl", "");
        String cachedName = p.getString("cachedName", "");
        boolean haveCache = cachedCode > 0L && cachedUrl != null && !cachedUrl.isEmpty();
        long age = System.currentTimeMillis() - p.getLong("lastCheckAt", 0L);

        if (haveCache && age >= 0 && age < CACHE_MS) {
            return new Release(cachedName, cachedUrl, cachedCode);
        }

        try {
            Release fresh = fetchNet();
            p.edit()
                    .putLong("lastCheckAt", System.currentTimeMillis())
                    .putString("cachedName", fresh.version)
                    .putString("cachedUrl", fresh.apkUrl)
                    .putLong("cachedCode", fresh.code)
                    .apply();
            return fresh;
        } catch (Exception err) {
            if (haveCache) return new Release(cachedName, cachedUrl, cachedCode);
            throw err;
        }
    }

    private static Release fetchNet() throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(LATEST).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(10000);
        conn.setRequestMethod("GET");
        conn.setRequestProperty("Accept", "application/vnd.github+json");
        conn.setRequestProperty("User-Agent", USER_AGENT);
        try {
            int status = conn.getResponseCode();
            if (status < 200 || status > 299) throw new Exception("HTTP " + status);
            String body = readAll(conn.getInputStream());
            JSONObject json = new JSONObject(body);
            String tag = json.optString("tag_name", "");
            String url = "";
            JSONArray assets = json.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    String name = a.optString("name", "");
                    if (name.toLowerCase().endsWith(".apk")) {
                        url = a.optString("browser_download_url", "");
                        break;
                    }
                }
            }
            if (tag.isEmpty() || url.isEmpty()) throw new Exception("rilis terbaru tidak punya berkas APK");
            return new Release(tag, url, versionCodeIn(json.optString("body", "")));
        } finally {
            conn.disconnect();
        }
    }

    /**
     * Badan rilis membawa `<!-- mooda:versionCode=N -->`. Nomor build inilah yang
     * menentukan pembaruan, jadi rilis yang diunggah ulang tetap terdeteksi.
     */
    private static long versionCodeIn(String body) {
        Matcher m = CODE_IN_BODY.matcher(body == null ? "" : body);
        if (!m.find()) return 0L;
        try {
            return Long.parseLong(m.group(1));
        } catch (NumberFormatException err) {
            return 0L;
        }
    }

    private static boolean download(Context ctx, String url) throws Exception {
        File out = new File(ctx.getCacheDir(), APK_NAME);
        if (out.exists() && !out.delete()) return false;
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(20000);
        conn.setInstanceFollowRedirects(true);
        conn.setRequestProperty("User-Agent", USER_AGENT);
        try {
            int status = conn.getResponseCode();
            if (status < 200 || status > 299) return false;
            InputStream input = conn.getInputStream();
            FileOutputStream output = new FileOutputStream(out);
            try {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = input.read(buf)) > 0) output.write(buf, 0, n);
                output.flush();
            } finally {
                try {
                    input.close();
                } catch (Exception ignored) {
                }
                output.close();
            }
        } finally {
            conn.disconnect();
        }
        return out.length() > 0L;
    }

    private static String readAll(InputStream input) throws Exception {
        StringBuilder sb = new StringBuilder();
        try {
            byte[] buf = new byte[8192];
            int n;
            while ((n = input.read(buf)) > 0) sb.append(new String(buf, 0, n, "UTF-8"));
        } finally {
            input.close();
        }
        return sb.toString();
    }

    private static void launchInstaller(Context ctx, long code) {
        // Ingat apa yang diminta. Pemasang tidak melapor balik, jadi ini satu-satunya
        // cara mengetahui sesudahnya bahwa build baru benar-benar terpasang.
        prefs(ctx).edit().putLong("pendingCode", code).apply();
        Uri uri = Uri.parse("content://" + ctx.getPackageName() + ".apk/" + APK_NAME);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(intent);
    }

    /**
     * True bila rilis di server harus menggantikan yang terpasang. Nomor build
     * menang bila rilis menyertakannya.
     */
    static boolean isNewer(Release remote, String localName, long localCode) {
        if (remote.code > 0L) return remote.code > localCode;
        return isNewer(remote.version, localName);
    }

    /** Membandingkan versi bertitik seperti "v1.2.0" dan "1.1.0". */
    static boolean isNewer(String remote, String local) {
        int[] a = numbers(remote);
        int[] b = numbers(local);
        if (a.length == 0 || b.length == 0) return false;
        int len = Math.max(a.length, b.length);
        for (int i = 0; i < len; i++) {
            int x = i < a.length ? a[i] : 0;
            int y = i < b.length ? b[i] : 0;
            if (x != y) return x > y;
        }
        return false;
    }

    private static int[] numbers(String version) {
        if (version == null) return new int[0];
        String v = version.trim();
        if (v.startsWith("v") || v.startsWith("V")) v = v.substring(1);
        String[] parts = v.split("\\.");
        int[] out = new int[parts.length];
        int count = 0;
        for (String part : parts) {
            int end = 0;
            while (end < part.length() && Character.isDigit(part.charAt(end))) end++;
            if (end == 0) continue;
            try {
                out[count++] = Integer.parseInt(part.substring(0, end));
            } catch (NumberFormatException err) {
                return new int[0];
            }
        }
        int[] trimmed = new int[count];
        System.arraycopy(out, 0, trimmed, 0, count);
        return trimmed;
    }
}
