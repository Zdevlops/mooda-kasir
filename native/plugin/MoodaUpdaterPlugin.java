package com.mooda.kasir;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * MoodaUpdater - jembatan JS ke pembaruan aplikasi.
 *
 * info()    -> versi yang terpasang
 * check()   -> ada rilis lebih baru?
 * install() -> unduh APK lalu buka pemasang Android
 */
@CapacitorPlugin(name = "MoodaUpdater")
public class MoodaUpdaterPlugin extends Plugin {

    @PluginMethod
    public void info(PluginCall call) {
        Context ctx = getContext();
        JSObject out = new JSObject();
        out.put("version", MoodaUpdater.versionName(ctx));
        out.put("code", MoodaUpdater.versionCode(ctx));
        out.put("canInstall", MoodaUpdater.canInstall(ctx));
        call.resolve(out);
    }

    @PluginMethod
    public void check(PluginCall call) {
        MoodaUpdater.check(getContext(), new MoodaUpdater.CheckCallback() {
            @Override
            public void onResult(MoodaUpdater.Release release, String error) {
                JSObject out = new JSObject();
                out.put("available", release != null);
                out.put("version", release == null ? "" : release.version);
                out.put("code", release == null ? 0 : release.code);
                out.put("error", error == null ? "" : error);
                call.resolve(out);
            }
        });
    }

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        if (!MoodaUpdater.canInstall(ctx)) {
            MoodaUpdater.openInstallPermission(ctx);
            JSObject out = new JSObject();
            out.put("ok", false);
            out.put("needsPermission", true);
            out.put("error", "");
            call.resolve(out);
            return;
        }
        MoodaUpdater.downloadAndInstall(ctx, new MoodaUpdater.InstallCallback() {
            @Override
            public void onResult(boolean ok, String error) {
                JSObject out = new JSObject();
                out.put("ok", ok);
                out.put("needsPermission", false);
                out.put("error", error == null ? "" : error);
                call.resolve(out);
            }
        });
    }
}
