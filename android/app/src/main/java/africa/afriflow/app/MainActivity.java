package africa.afriflow.app;

import android.Manifest;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
  private WebView web;
  private ValueCallback<Uri[]> fileCallback;
  private static final int PICK_FILE = 818;
  private static final int NOTIFICATION_PERMISSION = 740;
  private static final String HOME = "https://afriflow-africa.onrender.com/";
  private static final String NATIVE_PUSH_ENDPOINT =
    "https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-fcm";
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private boolean allowed(String raw) {
    try{
      Uri u=Uri.parse(raw);
      return "https".equals(u.getScheme()) &&
        ("afriflow-africa.onrender.com".equals(u.getHost()) || "atayi-jo.github.io".equals(u.getHost()));
    }catch(Exception e){return false;}
  }
  private final class NativeBridge {
    @JavascriptInterface public void enablePush(String accessToken) {
      runOnUiThread(()->{
        if(web==null || !allowed(web.getUrl()))return;
        if(!FirebaseApp.getApps(MainActivity.this).isEmpty() &&
          accessToken!=null && accessToken.length()>30 && accessToken.length()<6000) {
          if(Build.VERSION.SDK_INT>=33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION);
          }
          FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->
            worker.execute(()->registerDevice(token,accessToken)));
        }
      });
    }
  }
  private void registerDevice(String token, String jwt) {
    HttpURLConnection connection=null;
    try {
      URL u=new URL(NATIVE_PUSH_ENDPOINT);
      connection=(HttpURLConnection)u.openConnection();
      connection.setRequestMethod("POST");
      connection.setConnectTimeout(12000);
      connection.setReadTimeout(12000);
      connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type","application/json");
      connection.setRequestProperty("Authorization","Bearer "+jwt);
      JSONObject body=new JSONObject();
      body.put("action","register");
      body.put("token",token);
      byte[] bytes=body.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
      try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
      int code=connection.getResponseCode();
      if(code>=400)android.util.Log.w("AfriFloW","FCM device registration rejected: HTTP "+code);
    }catch(Exception e){android.util.Log.w("AfriFloW","FCM registration unavailable",e);}
    finally{if(connection!=null)connection.disconnect();}
  }
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    web = new WebView(this);
    setContentView(web);
    WebSettings settings = web.getSettings();
    settings.setJavaScriptEnabled(true);
    settings.setDomStorageEnabled(true);
    settings.setAllowFileAccess(false);
    settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
    CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
    // Only allow privileged registration when top-level WebView URL is trusted.
    web.addJavascriptInterface(new NativeBridge(),"AfriFlowAndroid");
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String host = uri.getHost();
        if ("https".equals(uri.getScheme()) && ("afriflow-africa.onrender.com".equals(host) || "atayi-jo.github.io".equals(host))) return false;
        if ("https".equals(uri.getScheme())) {
          try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); } catch (Exception ignored) {}
        }
        return true;
      }
    });
    web.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        fileCallback = callback;
        try { startActivityForResult(params.createIntent(), PICK_FILE); return true; }
        catch (Exception e) { fileCallback = null; return false; }
      }
    });
    web.loadUrl(HOME);
  }
  @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
    super.onActivityResult(requestCode,resultCode,data);
    if(requestCode == PICK_FILE && fileCallback != null) {
      fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data));
      fileCallback=null;
    }
  }
  @Override public void onBackPressed() { if(web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
  @Override protected void onDestroy() { if(web!=null)web.destroy(); worker.shutdown(); super.onDestroy(); }
}
