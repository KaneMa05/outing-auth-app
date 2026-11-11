package com.ronpark.interview;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.*;
import android.widget.*;

/** Native layout shared by the synchronized Debug screens only. */
abstract class InterviewTestScreen extends Activity {
    final int ink=0xff152c43,teal=0xff087d72,sub=0xff65778a,paper=0xfff6f8fa;
    LinearLayout content;
    @Override public void onCreate(android.os.Bundle state){super.onCreate(state);if(android.os.Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::onBackPressed);}
    int dp(float value){return Math.round(value*getResources().getDisplayMetrics().density);}
    GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    TextView text(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(7),0,dp(7));return t;}
    TextView add(String value,int size,int color){TextView t=text(value,size,color);content.addView(t);return t;}
    void title(String value){TextView t=add(value,26,ink);t.setTypeface(null,Typeface.BOLD);}
    Button button(String title,boolean primary,Runnable action){Button b=new Button(this);b.setText(title);b.setAllCaps(false);b.setTextSize(15);b.setTextColor(primary?Color.WHITE:teal);b.setBackground(bg(primary?teal:Color.WHITE,16));b.setMinHeight(dp(50));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(12);content.addView(b,lp);b.setOnClickListener(v->action.run());return b;}
    void beginLayout(String name){
        getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(paper);content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(24),dp(14),dp(24),dp(28));scroll.addView(content);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i;});scroll.requestApplyInsets();
        LinearLayout header=new LinearLayout(this);TextView back=text("돌아가기",15,teal);back.setPadding(0,dp(12),dp(16),dp(12));back.setOnClickListener(v->onBackPressed());header.addView(back);TextView label=text(name,16,ink);label.setTypeface(null,Typeface.BOLD);header.addView(label);content.addView(header);
    }
}
