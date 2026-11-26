package africa.afriflow.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.text.DateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

public class AfriMessagingService extends FirebaseMessagingService {
  static final String CHANNEL = "afriflow_meetings";
  static boolean validMeetingId(String id) {
    return id != null && id.matches("m[a-z0-9]{5,35}");
  }
  private static long number(Map<String,String> data,String key) {
    try { return Long.parseLong(data.getOrDefault(key,"0")); }
    catch (NumberFormatException ignored) { return 0; }
  }
  public static class DismissReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
      String tag=intent.getStringExtra("notificationTag");
      if(tag==null || !tag.matches("meeting:m[a-z0-9]{5,35}:[0-9]{10,17}:(soon|start)"))return;
      NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
      if(manager!=null)manager.cancel(tag,0);
    }
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
    String title = data.getOrDefault("title", "AfriFlow");
    String body = data.getOrDefault("body", "Nouvelle notification");
    boolean meeting = "meeting".equals(data.get("kind"));
    String meetingId=data.getOrDefault("meetingId","");
    String stage="soon".equals(data.get("stage"))?"soon":"start";
    long start=number(data,"start"),end=number(data,"end"),expiresAt=number(data,"expiresAt");
    long now=System.currentTimeMillis();
    if(meeting && (!validMeetingId(meetingId)||start<=0||end<=start||expiresAt<=now))return;
    String tag=meeting?"meeting:"+meetingId+":"+start+":"+stage:"";
    if(meeting){
      expiresAt=Math.min(expiresAt,end);
      if(expiresAt<=now)return;
      title="soon".equals(stage)?"AfriFlow · Réunion à venir":"AfriFlow · Réunion à rejoindre";
      String meetingTitle=data.getOrDefault("meetingTitle",body);
      String when=DateFormat.getDateTimeInstance(DateFormat.MEDIUM,DateFormat.SHORT,Locale.FRANCE).format(new Date(start));
      body=meetingTitle+" · "+when+" · "+((end-start)/60000)+" min";
    }
    NotificationManager mgr = (NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
    if(mgr == null) return;
    if(Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = new NotificationChannel(CHANNEL,
        "Réunions et messages AfriFlow",NotificationManager.IMPORTANCE_HIGH);
      channel.enableVibration(true);
      mgr.createNotificationChannel(channel);
    }
    Intent open = new Intent(this,MainActivity.class);
    open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if(meeting){
      // The tap opens the authenticated AfriFlow preview. Only its Join button
      // checks attendance and opens Teams; a push is never a check-in.
      Uri url=Uri.parse("https://afriflow.pages.dev/").buildUpon().appendQueryParameter("meeting",meetingId).build();
      open.setAction(Intent.ACTION_VIEW).setData(url);
    }
    int requestId=meeting?(tag.hashCode()&0x7FFFFFFF):1;
    PendingIntent openPi = PendingIntent.getActivity(this,requestId,open,
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
    if(meeting){
      Intent later=new Intent(this,DismissReceiver.class).setAction("africa.afriflow.DISMISS_MEETING")
        .setData(open.getData()).putExtra("notificationTag",tag);
      PendingIntent laterPi=PendingIntent.getBroadcast(this,requestId,later,
        PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
      notification.setTimeoutAfter(expiresAt-now).setOnlyAlertOnce(true)
        .addAction(0,"Plus tard",laterPi).addAction(0,"Rejoindre",openPi);
    }
    // This is a meeting reminder, not a VoIP call. No restricted full-screen call intent.
    try{
      if(meeting)mgr.notify(tag,0,notification.build());
      else mgr.notify((int)(now&0x7FFFFFFF),notification.build());
    }catch(SecurityException denied){android.util.Log.w("AfriFlow","Notification permission is unavailable");}
  }
}
