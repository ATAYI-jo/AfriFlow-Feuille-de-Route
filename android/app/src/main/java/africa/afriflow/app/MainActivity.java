package africa.afriflow.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.os.Build;
import android.os.Bundle;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.webkit.CookieManager;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.JavaScriptReplyProxy;
import java.util.Collections;
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
  private static final String HOME = "https://afriflow.pages.dev/";
  private static final String NATIVE_PUSH_ENDPOINT =
    "https://jgvwdpzevghfavmpjbqp.supabase.co/functions/v1/afriflow-fcm";
  private final ExecutorService worker=Executors.newSingleThreadExecutor();
  private boolean allowed(String raw) {
    try{
      Uri u=Uri.parse(raw);
      return "https".equals(u.getScheme()) &&
        ("afriflow.pages.dev".equals(u.getHost()) || "afriflow-africa.onrender.com".equals(u.getHost()) || "atayi-jo.github.io".equals(u.getHost()));
    }catch(Exception e){return false;}
  }
  private String pendingAuthToken;
  private void enablePush(String accessToken) {
    if(web==null || !allowed(web.getUrl()))return;
    if(FirebaseApp.getApps(this).isEmpty() || accessToken==null || accessToken.length()<30 || accessToken.length()>6000)return;
    if(Build.VERSION.SDK_INT>=33 &&
        checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
      pendingAuthToken=accessToken;
      requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION);
      return;
    }
    FirebaseMessaging.getInstance().getToken().addOnSuccessListener(token->
      worker.execute(()->registerDevice(token,accessToken)));
  }
  @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
    super.onRequestPermissionsResult(requestCode,permissions,grantResults);
    if(requestCode==NOTIFICATION_PERMISSION){
      String jwt=pendingAuthToken;pendingAuthToken=null;
      if(jwt!=null && grantResults.length>0 && grantResults[0]==PackageManager.PERMISSION_GRANTED)enablePush(jwt);
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
  // Public GitHub release check: never silently installs an APK or deletes local data.
  // Android only installs over an existing app when applicationId and signing certificate match.
  private void checkForAppUpdate() {
    long now=System.currentTimeMillis();
    android.content.SharedPreferences pref=getSharedPreferences("afriflow_update",MODE_PRIVATE);
    if(now-pref.getLong("last_check",0)<24L*60*60*1000)return;
    pref.edit().putLong("last_check",now).apply();
    worker.execute(()->{
      HttpURLConnection conn=null;
      try{
        URL u=new URL("https://api.github.com/repos/ATAYI-jo/AfriFlow-Feuille-de-Route/releases/latest");
        conn=(HttpURLConnection)u.openConnection();
        conn.setConnectTimeout(8000);conn.setReadTimeout(8000);
        conn.setRequestProperty("Accept","application/vnd.github+json");
        conn.setRequestProperty("User-Agent","AfriFloW-Android");
        if(conn.getResponseCode()!=200)return;
        java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();
        try(java.io.InputStream in=conn.getInputStream()){
          byte[] b=new byte[4096];int n;
          while((n=in.read(b))!=-1 && out.size()<64000)out.write(b,0,n);
        }
        JSONObject response=new JSONObject(out.toString("UTF-8"));
        String tag=response.optString("tag_name","");
        if(!tag.matches("v[0-9]+\\.[0-9]+\\.[0-9]+"))return;
        String latest=tag.substring(1);
        String current=getPackageManager().getPackageInfo(getPackageName(),0).versionName;
        if(!newerVersion(latest,current))return;
        runOnUiThread(()->{
          if(isFinishing() || isDestroyed())return;
          new AlertDialog.Builder(this)
            .setTitle("Mise à jour AfriFloW disponible")
            .setMessage("Version "+latest+" disponible. L'installation peut conserver vos données si la signature correspond à celle de l'application déjà installée.")
            .setNegativeButton("Plus tard",null)
            .setPositiveButton("Voir la mise à jour",(dialog,which)->{
              Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/ATAYI-jo/AfriFlow-Feuille-de-Route/releases/latest"));
              try{startActivity(intent);}catch(Exception ex){android.util.Log.w("AfriFloW","Update page unavailable",ex);}
            }).show();
        });
      }catch(Exception ex){android.util.Log.w("AfriFloW","Update check failed",ex);}
      finally{if(conn!=null)conn.disconnect();}
    });
  }
  private static boolean newerVersion(String latest,String current){
    try{
      String[] a=latest.split("\\."),b=current.split("\\.");
      for(int i=0;i<3;i++){
        int x=Integer.parseInt(a[i]),y=Integer.parseInt(b[i]);
        if(x!=y)return x>y;
      }
    }catch(Exception ignored){}
    return false;
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
    // Origin-scoped bridge: never expose privileged APIs to cross-origin iframes.
    if(WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
      java.util.Set<String> origins=new java.util.HashSet<>();
      origins.add("https://afriflow.pages.dev");
      origins.add("https://afriflow-africa.onrender.com");
      origins.add("https://atayi-jo.github.io");
      WebViewCompat.addWebMessageListener(web,"AfriFlowAndroid",origins,
        (view,message,sourceOrigin,isMainFrame,replyProxy)->{
          if(!isMainFrame || !allowed(sourceOrigin.toString()))return;
          try{
            JSONObject json=new JSONObject(message.getData());
            if("enablePush".equals(json.optString("action")))
              runOnUiThread(()->enablePush(json.optString("accessToken")));
          }catch(Exception e){android.util.Log.w("AfriFloW","Invalid native bridge request");}
        });
    }
    web.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String host = uri.getHost();
        if ("https".equals(uri.getScheme()) && ("afriflow.pages.dev".equals(host) || "afriflow-africa.onrender.com".equals(host) || "atayi-jo.github.io".equals(host))) return false;
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
    checkForAppUpdate();
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
