package com.ronpark.interview;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
/** Debug APK only: no API connection or real microphone during simulated interviews. */
public final class InterviewPreviewActivity extends Activity {
    @Override public void onCreate(Bundle state) { super.onCreate(state);startActivity(new Intent(this,InterviewActivity.class).putExtra("demo",true));finish(); }
}
