package cl.lamina.study;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/** A private HTTPS origin backed entirely by bundled files; no server or Internet permission. */
public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/Lamina.html";
    private WebView browser;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        browser = new WebView(this);
        browser.setBackgroundColor(0xfff7f8f5);
        WebView.setWebContentsDebuggingEnabled(false);
        WebSettings settings = browser.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        if (Build.VERSION.SDK_INT >= 33) settings.setAlgorithmicDarkeningAllowed(false);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        browser.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if ("GET".equals(request.getMethod()) && isAppOrigin(uri)) {
                    String path = uri.getPath();
                    String asset = "/Lamina.html".equals(path) || "/".equals(path) ? "Lamina.html"
                        : "/pauta.pdf".equals(path) ? "pauta.pdf" : null;
                    if (asset != null) {
                        try {
                            WebResourceResponse response = new WebResourceResponse(
                                asset.endsWith(".pdf") ? "application/pdf" : "text/html",
                                asset.endsWith(".pdf") ? null : "UTF-8", getAssets().open(asset));
                            Map<String, String> headers = new HashMap<String, String>();
                            headers.put("Cache-Control", "no-store");
                            headers.put("X-Content-Type-Options", "nosniff");
                            headers.put("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'");
                            response.setResponseHeaders(headers);
                            return response;
                        } catch (IOException ignored) { /* Return a closed response below, never the network. */ }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && handleNavigation(request.getUrl());
            }
        });
        setContentView(browser);
        browser.loadUrl(START_URL);
    }

    private static boolean isAppOrigin(Uri uri) {
        return "https".equals(uri.getScheme()) && ASSET_HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null;
    }

    private boolean handleNavigation(Uri uri) {
        if (isAppOrigin(uri)) {
            if ("/pauta.pdf".equals(uri.getPath())) {
                Intent pdf = new Intent(Intent.ACTION_VIEW);
                pdf.setDataAndType(Uri.parse("content://cl.lamina.study.documents/pauta.pdf"), "application/pdf");
                pdf.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivity(pdf); }
                catch (ActivityNotFoundException ignored) {
                    Toast.makeText(this, "Para consultar la pauta completa, abre un visor PDF en tu tablet.", Toast.LENGTH_LONG).show();
                }
                return true;
            }
            return !("/Lamina.html".equals(uri.getPath()) || "/".equals(uri.getPath()));
        }
        if ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
            catch (ActivityNotFoundException ignored) {
                Toast.makeText(this, "No hay un navegador disponible para abrir el enlace.", Toast.LENGTH_SHORT).show();
            }
        }
        return true;
    }

    @Override public void onBackPressed() {
        if (browser != null && browser.canGoBack()) browser.goBack();
        else super.onBackPressed();
    }

    @Override protected void onDestroy() {
        if (browser != null) { browser.destroy(); browser = null; }
        super.onDestroy();
    }
}
