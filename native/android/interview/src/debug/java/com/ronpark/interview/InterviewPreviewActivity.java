package com.ronpark.interview;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.widget.*;
/** Debug-only entry menu. Uses app-private recordings without paid APIs. */
public final class InterviewPreviewActivity extends Activity {
    TextView trackLabel;InterviewQuestionAudio audio;
    String currentTrack(){String value=getSharedPreferences("interview-preview",MODE_PRIVATE).getString("track","공채");return InterviewQuestionPolicy.validTrack(value)?value:"공채";}
    void selectTrack(){
        String[] choices=new String[InterviewQuestionPolicy.TRACKS.length];
        for(int i=0;i<choices.length;i++){String track=InterviewQuestionPolicy.TRACKS[i];choices[i]=track+" · 직무 음성 "+audio.eligible("job",track).size()+"개";}
        new android.app.AlertDialog.Builder(this).setTitle("직렬 선택").setItems(choices,(dialog,index)->{
            getSharedPreferences("interview-preview",MODE_PRIVATE).edit().putString("track",InterviewQuestionPolicy.TRACKS[index]).apply();updateTrack();
        }).show();
    }
    void updateTrack(){if(trackLabel!=null){trackLabel.setText(currentTrack()+" ▾");trackLabel.setContentDescription("직렬 "+currentTrack()+", 변경 가능");}}
    @Override protected void onResume(){super.onResume();updateTrack();}
    int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);int paper=Color.rgb(242,245,247),ink=Color.rgb(23,59,81);
        getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);
        LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(paper);root.setPadding(dp(18),dp(22),dp(18),dp(24));
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(18)+insets.getSystemWindowInsetLeft(),dp(22)+insets.getSystemWindowInsetTop(),dp(18)+insets.getSystemWindowInsetRight(),dp(24)+insets.getSystemWindowInsetBottom());return insets;});
        TextView brand=new TextView(this);brand.setText("론박스터디 · 면접반");brand.setTextSize(12);brand.setTextColor(Color.rgb(97,120,137));root.addView(brand);
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);TextView title=new TextView(this);title.setText("모의면접");title.setTextSize(25);title.setTypeface(null,Typeface.BOLD);title.setTextColor(ink);header.addView(title,new LinearLayout.LayoutParams(0,dp(56),1));
        audio=new InterviewQuestionAudio(this);trackLabel=new TextView(this);trackLabel.setTextSize(16);trackLabel.setTextColor(ink);trackLabel.setTypeface(null,Typeface.BOLD);trackLabel.setGravity(Gravity.CENTER);trackLabel.setMinHeight(dp(48));trackLabel.setOnClickListener(v->selectTrack());trackLabel.setFocusable(true);trackLabel.setBackgroundColor(Color.WHITE);header.addView(trackLabel,new LinearLayout.LayoutParams(dp(98),dp(48)));root.addView(header);updateTrack();
        String[][] modes={{"job","전공(직무) 시험모드"},{"personality","인성 연습모드"},{"ai","실전 모의면접 (AI)"}};
        for(String[] mode:modes){Button card=new Button(this);card.setText(mode[1]+"     ›");card.setTextSize(16);card.setTextColor(ink);card.setAllCaps(false);card.setGravity(Gravity.CENTER_VERTICAL|Gravity.LEFT);card.setPadding(dp(20),0,dp(16),0);GradientDrawable bg=new GradientDrawable();bg.setColor(Color.WHITE);bg.setCornerRadius(dp(12));bg.setStroke(dp(1),Color.rgb(217,229,242));card.setBackground(bg);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(80));lp.topMargin=dp(14);root.addView(card,lp);card.setOnClickListener(v->startActivity(new Intent(this,InterviewActivity.class).putExtra("demo",true).putExtra("practiceMode",mode[0])));}
        TextView note=new TextView(this);note.setText("기기 내 테스트 · USB 연결 시 무료 AI 사용");note.setTextColor(Color.rgb(101,119,138));note.setTextSize(12);note.setPadding(0,dp(20),0,dp(12));root.addView(note);
        Button records=new Button(this);records.setText("내 면접 기록");records.setAllCaps(false);records.setOnClickListener(v->startActivity(new Intent(this,InterviewActivity.class).putExtra("demo",true).putExtra("showRecords",true)));root.addView(records);
        setContentView(root);root.requestApplyInsets();
    }
}
