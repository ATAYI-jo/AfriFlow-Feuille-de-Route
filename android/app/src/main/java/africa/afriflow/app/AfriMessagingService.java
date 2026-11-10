package africa.afriflow.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.Context;
import android.graphics.BitmapFactory;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.net.URI;
import java.util.Map;

public class AfriMessagingService extends FirebaseMessagingService {
  static final String CHANNEL = "afriflow_meetings";
  public static boolean safeTeamsUrl(String candidate) {
    try {
      URI url = new URI(candidate);
      String host = url.getHost();
      return "https".equalsIgnoreCase(url.getScheme()) &&
        ("teams.microsoft.com".equalsIgnoreCase(host) ||
         "teams.live.com".equalsIgnoreCase(host) ||
         "teams.microsoft.us".equalsIgnoreCase(host));
    } catch (Exception ignored) { return false; }
  }
  @Override public void onNewToken(String token) {
    super.onNewToken(token);
    getSharedPreferences("afri_notifications",MODE_PRIVATE)
      .edit().putString("fcm_token", token).apply();
    // Token is registered with the account only after explicit notification opt-in.
    // Next launch of the signed-in app re-registers it through MainActivity.
  }
  @Override public void onMessageReceived(RemoteMessage message) {
    Map<String,String> data = message.getData();
    if(data == null || data.isEmpty()) return;
    String title = data.getOrDefault("title", "AfriFloW");
    String body = data.getOrDefault("body", "Nouvelle notification");
    String teams = data.getOrDefault("teamsUrl", "");
    boolean meeting = "meeting".equals(data.get("kind"));
    NotificationManager mgr = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    if(mgr == null) return;
    if(Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(CHANNEL,
        "Réunions et messages AfriFloW",NotificationManager.IMPORTANCE_HIGH);
      channel.enableVibration(true);
      mgr.createNotificationChannel(channel);
    }
    Intent open = new Intent(this,MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent openPi = PendingIntent.getActivity(this,1,open,
      PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
    NotificationCompat.Builder notification = new NotificationCompat.Builder(this,CHANNEL)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setLargeIcon(BitmapFactory.decodeResource(getResources(),R.mipmap.ic_launcher))
      .setContentTitle(title.substring(0,Math.min(title.length(),100)))
      .setContentText(body.substring(0,Math.min(body.length(),220)))
      .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
      .setAutoCancel(true).setContentIntent(openPi)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setDefaults(NotificationCompat.DEFAULT_ALL)
      .setCategory(meeting?NotificationCompat.CATEGORY_REMINDER:NotificationCompat.CATEGORY_MESSAGE);
    if(meeting && safeTeamsUrl(teams)){
      Intent join = new Intent(Intent.ACTION_VIEW,android.net.Uri.parse(teams));
      join.addCategory(Intent.CATEGORY_BROWSABLE);
      PendingIntent joinPi = PendingIntent.getActivity(this,2,join,
        PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      notification.addAction(0,"Rejoindre Teams",joinPi);
    }
    // This is a meeting reminder, not a VoIP call. No restricted full-screen call intent.
    mgr.notify((int)(System.currentTimeMillis()&0x7FFFFFFF),notification.build());
  }
}
