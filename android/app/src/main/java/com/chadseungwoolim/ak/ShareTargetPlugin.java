package com.chadseungwoolim.ak;

import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.OpenableColumns;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Receives an image or video from the system share sheet (ACTION_SEND) and hands it to the web layer as a
 * file inside the app cache, which the WebView can fetch through Capacitor's local server.
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {
    private JSObject pending = null;

    @Override
    public void load() {
        handle(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        handle(intent);
        JSObject p = pending;
        if (p != null) notifyListeners("shared", p, true);
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        JSObject out = new JSObject();
        if (pending != null) {
            out = pending;
            pending = null;
        } else {
            out.put("uri", JSObject.NULL);
        }
        call.resolve(out);
    }

    private void handle(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type == null || !(type.startsWith("image/") || type.startsWith("video/"))) return;
        Uri src;
        if (Build.VERSION.SDK_INT >= 33) src = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri.class);
        else src = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        if (src == null) return;
        // consume so that a configuration change does not deliver the same share twice
        intent.setAction(Intent.ACTION_MAIN);
        try {
            ContentResolver cr = getContext().getContentResolver();
            String name = "shared";
            try (Cursor c = cr.query(src, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    String n = c.getString(0);
                    if (n != null && !n.isEmpty()) name = n;
                }
            } catch (Exception ignored) {}
            name = name.replaceAll("[^A-Za-z0-9._-]", "_");
            File dir = new File(getContext().getCacheDir(), "shared");
            if (dir.exists()) {
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
            } else dir.mkdirs();
            File out = new File(dir, name);
            try (InputStream in = cr.openInputStream(src); OutputStream os = new FileOutputStream(out)) {
                if (in == null) return;
                byte[] buf = new byte[65536];
                int r;
                while ((r = in.read(buf)) > 0) os.write(buf, 0, r);
            }
            JSObject o = new JSObject();
            o.put("uri", "file://" + out.getAbsolutePath());
            o.put("name", name);
            o.put("type", type);
            pending = o;
        } catch (Exception e) {
            pending = null;
        }
    }
}
