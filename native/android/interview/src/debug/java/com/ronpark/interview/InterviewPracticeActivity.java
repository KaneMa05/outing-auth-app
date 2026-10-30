package com.ronpark.interview;

import android.Manifest;
import android.animation.ValueAnimator;
import android.app.*;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.File;
import java.util.*;

/** Debug-only real practice. Production authentication/Live Activity is unchanged. */
public final class InterviewPracticeActivity extends Activity {
    private final int ink=0xff152c43,teal=0xff087d72,sub=0xff65778a,paper=0xfff6f8fa;
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final PracticeCamera camera=new PracticeCamera();
    private final PracticeCapture capture=new PracticeCapture();
    private final InterviewVoiceLevel outputLevel=new InterviewVoiceLevel();
    private InterviewLocalStore store;private InterviewQuestionAudio bank;private PracticeBridge bridge;
    private LinearLayout content;private FrameLayout cameraHost;private PracticeAvatar avatar;private Stage stage;
    private TextView status,questionText,turnText,clock,countdownText,recordingBadge;private ProgressBar silence,meter;
    private Button answerButton,replayButton,startButton;private Bars leftBars,rightBars;
    private String screen="prep",mode="ai",track="공채",run="",question="",transcript="",notice="",avatarFile="";
    private String[] questions=new String[0];private int number,generation;private long created,started;
    private boolean recordingVideo,videoSaving,bridgeReady,consent,destroyed,talking,answering,recordingReady,counting,opening;
    private double noiseDb=InterviewMicLevel.DEFAULT_NOISE_DB;
    private PracticeVideo video;private MediaPlayer player;private InterviewLiveCaptions captions;
    private final Set<InterviewLiveCaptions> pendingCaptions=new HashSet<>();
    private final Map<InterviewLiveCaptions,Runnable> interruptedCaptions=new HashMap<>();
    private JSONObject record;private JSONArray turns=new JSONArray();
    private String videoRun="";private Dialog videoDialog;private final Runnable ticker=this::tick;
    private volatile AudioRecord checkMic;private volatile int checkGeneration;private InterviewNoiseControl checkNoise=new InterviewNoiseControl();

    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);
        store=new InterviewLocalStore(this);bank=new InterviewQuestionAudio(this);bridge=new PracticeBridge(this);
        String requested=getIntent().getStringExtra("practiceMode");mode="job".equals(requested)?"job":"personality".equals(requested)?"personality":"ai";
        track=getSharedPreferences("interview-preview",MODE_PRIVATE).getString("track","공채");if(!InterviewQuestionPolicy.validTrack(track))track="공채";
        if(getIntent().getBooleanExtra("showRecords",false))screen="records";
        refreshQuestions();render();checkBridge();
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::back);
    }
    private void refreshQuestions(){questions=bank.sample(mode,track,3);}
    private String title(){return mode.equals("job")?"전공(직무) 시험모드":mode.equals("personality")?"인성 연습모드":"실전 모의면접 (AI)";}
    private void checkBridge(){bridge.status((data,error)->{if(destroyed)return;bridgeReady=error==null&&data.optBoolean("ready");if(!screen.equals("live"))setNotice(bridgeReady?"AI 테스트 연결됨 · 테스트용 답변만 사용해주세요.":"기기 내 녹음·재생 · AI 서버 연결 대기");});}
    private int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private GradientDrawable background(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String value,int size,int color){TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);t.setPadding(0,dp(6),0,dp(6));return t;}
    private void add(String value,int size,int color){content.addView(text(value,size,color));}
    private Button button(String title,boolean primary,Runnable action){
        Button b=new Button(this);b.setText(title);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:teal);b.setBackground(background(primary?teal:Color.WHITE,14));b.setMinHeight(dp(50));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(10);content.addView(b,lp);b.setOnClickListener(v->action.run());
        b.setOnTouchListener((v,event)->{if(Build.VERSION.SDK_INT<26||ValueAnimator.areAnimatorsEnabled()){if(event.getActionMasked()==MotionEvent.ACTION_DOWN)v.animate().scaleX(.98f).scaleY(.98f).setDuration(90).start();if(event.getActionMasked()==MotionEvent.ACTION_UP||event.getActionMasked()==MotionEvent.ACTION_CANCEL)v.animate().scaleX(1).scaleY(1).setDuration(150).start();}return false;});return b;
    }
    private void render(){
        if(destroyed)return;if(avatar!=null){avatar.close();avatar=null;}stopPlayback();
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(paper);
        content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(16),dp(20),dp(28));scroll.addView(content);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});scroll.requestApplyInsets();
        LinearLayout header=new LinearLayout(this);header.setGravity(Gravity.CENTER_VERTICAL);TextView label=text(title(),16,teal);header.addView(label,new LinearLayout.LayoutParams(0,-2,1));
        TextView selected=text(track+(screen.equals("prep")?" ▾":""),15,teal);selected.setPadding(dp(10),dp(10),dp(10),dp(10));selected.setContentDescription("직렬 "+track);
        if(screen.equals("prep"))selected.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("직렬 선택").setItems(InterviewQuestionPolicy.TRACKS,(d,i)->{track=InterviewQuestionPolicy.TRACKS[i];getSharedPreferences("interview-preview",MODE_PRIVATE).edit().putString("track",track).apply();refreshQuestions();render();}).show());header.addView(selected);content.addView(header);
        if(screen.equals("prep"))preparation();else if(screen.equals("live"))live();else if(screen.equals("records"))records();else result();
        status=text(notice,13,teal);status.setVisibility(notice.isEmpty()?View.GONE:View.VISIBLE);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);content.addView(status);
    }
    private void preparation(){
        add("면접 준비",25,ink);cameraHost=new FrameLayout(this);cameraHost.setBackground(background(0xffdce5e9,20));
        LinearLayout.LayoutParams frame=new LinearLayout.LayoutParams(dp(216),dp(288));frame.gravity=Gravity.CENTER_HORIZONTAL;content.addView(cameraHost,frame);
        TextView placeholder=text("카메라 미리보기",14,sub);placeholder.setGravity(Gravity.CENTER);cameraHost.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));camera.attach(cameraHost);
        button("카메라 및 마이크 확인",false,this::checkMedia);
        meter=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(100);meter.setProgressTintList(ColorStateList.valueOf(teal));meter.setContentDescription("마이크 입력 음량");content.addView(meter,new LinearLayout.LayoutParams(-1,dp(8)));
        Switch toggle=new Switch(this);toggle.setText("내 모습과 답변 영상 녹화");toggle.setChecked(recordingVideo);toggle.setPadding(0,dp(16),0,dp(10));toggle.setOnCheckedChangeListener((b,on)->recordingVideo=on);content.addView(toggle);
        add("영상은 기기에만 저장되며 기록 삭제 시 함께 삭제됩니다.",12,sub);
        if(questions.length==0)add("해당 직렬에 음성이 준비된 질문이 없습니다.",14,sub);
        startButton=button(videoSaving?"영상 저장 중…":"면접 시작하기 →",true,this::requestStart);startButton.setEnabled(questions.length>0&&!videoSaving&&video==null&&!opening);
        button("내 면접 기록",false,()->{stopChecks();camera.stop();screen="records";render();});
        button("AI 연결 다시 확인",false,this::checkBridge);
    }
    private void live(){
        LinearLayout heading=new LinearLayout(this);TextView label=text("실전 모의면접",19,ink);heading.addView(label,new LinearLayout.LayoutParams(0,-2,1));
        replayButton=new Button(this);replayButton.setText("다시 듣기");replayButton.setAllCaps(false);replayButton.setTextSize(12);replayButton.setOnClickListener(v->{if(!counting&&!answering)speakQuestion();});heading.addView(replayButton);content.addView(heading);
        clock=text("0:00 / 10:00",12,sub);content.addView(clock);stage=new Stage();content.addView(stage,new LinearLayout.LayoutParams(-1,-2));
        LinearLayout panes=new LinearLayout(this);stage.addView(panes,new FrameLayout.LayoutParams(-1,-1));
        FrameLayout interviewer=new FrameLayout(this);cameraHost=new FrameLayout(this);cameraHost.setBackgroundColor(0xffdce5e9);
        panes.addView(interviewer,new LinearLayout.LayoutParams(0,-1,1));panes.addView(cameraHost,new LinearLayout.LayoutParams(0,-1,1));
        if(!avatarFile.isEmpty()){avatar=new PracticeAvatar(this,avatarFile);interviewer.addView(avatar,new FrameLayout.LayoutParams(-1,-1));}else interviewer.setBackgroundColor(0xffdce5e9);
        TextView left=text(" AI 면접관 ",12,ink);left.setBackground(background(0xddffffff,12));interviewer.addView(left,new FrameLayout.LayoutParams(-2,-2,Gravity.LEFT|Gravity.TOP));
        TextView right=text(" 내 모습 ",12,ink);right.setBackground(background(0xddffffff,12));cameraHost.addView(right,new FrameLayout.LayoutParams(-2,-2,Gravity.LEFT|Gravity.TOP));
        leftBars=new Bars();rightBars=new Bars();FrameLayout.LayoutParams bars=new FrameLayout.LayoutParams(dp(96),dp(30),Gravity.BOTTOM|Gravity.RIGHT);interviewer.addView(leftBars,bars);cameraHost.addView(rightBars,new FrameLayout.LayoutParams(dp(96),dp(30),Gravity.BOTTOM|Gravity.RIGHT));
        recordingBadge=text(" ● 녹화 중 ",11,0xffbf2932);recordingBadge.setBackground(background(0xeeffffff,10));FrameLayout.LayoutParams badge=new FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM|Gravity.LEFT);cameraHost.addView(recordingBadge,badge);recordingBadge.setVisibility(videoSaving?View.VISIBLE:View.GONE);camera.attach(cameraHost);
        add("진행 질문 "+String.format(Locale.KOREA,"%02d",number),11,teal);questionText=text(question,21,ink);questionText.setGravity(Gravity.CENTER);content.addView(questionText);
        countdownText=text("",40,teal);countdownText.setGravity(Gravity.CENTER);content.addView(countdownText);
        turnText=text("",17,teal);turnText.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);content.addView(turnText);
        silence=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);silence.setMax(4000);silence.setProgressTintList(ColorStateList.valueOf(teal));content.addView(silence,new LinearLayout.LayoutParams(-1,dp(5)));
        answerButton=button("면접 준비 중",true,this::answer);answerButton.setEnabled(false);button("면접 종료",false,this::confirmEnd);updateLive();
    }
    private void requestStart(){
        if(opening||!screen.equals("prep")||videoSaving||video!=null)return;
        if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},31);return;}
        if(bridgeReady&&!consent){new AlertDialog.Builder(this).setTitle("AI 테스트").setMessage("답변 음성이 테스트 서버를 거쳐 Google Gemini로 전송됩니다. 개인정보 없는 테스트용 답변을 사용해주세요.").setNegativeButton("기기에서만 연습",(d,w)->begin(false)).setPositiveButton("동의하고 테스트",(d,w)->begin(true)).show();return;}
        begin(consent);
    }
    private void begin(boolean allowAI){
        if(!screen.equals("prep")||opening)return;opening=true;consent=allowAI;stopChecks();refreshQuestions();if(questions.length==0){opening=false;return;}
        run=store.create();turns=new JSONArray();created=System.currentTimeMillis();number=1;question=questions[0];transcript="";record=InterviewApi.json("id",run,"mode",mode,"track",track,"created_at",created,"run",InterviewApi.json("turns",turns,"state","interrupted"));
        if(!save()){opening=false;return;}
        try{String[] files=getAssets().list("interview-avatar");List<String> available=new ArrayList<>();for(String file:files)if(file.matches("interviewer-(man-[12]|woman)\\.mp4"))available.add(file);avatarFile=available.isEmpty()?"":available.get(new Random().nextInt(available.size()));}catch(Exception e){avatarFile="";}
        screen="live";notice="";counting=true;talking=true;recordingReady=false;int active=++generation;getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();
        final String captureRun=run;
        capture.start(this,noiseDb,ready->{
            if(destroyed||!run.equals(captureRun)||!screen.equals("live"))return;
            if(!ready){setNotice("마이크를 준비하지 못했습니다. 기록을 보존하고 종료합니다.");end();return;}
            if(active!=generation)return;
            prepareVideo(active);
        });
        if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera.start(this,cameraHost,ok->{if(!ok&&screen.equals("live"))setNotice("카메라 없이 음성으로 진행합니다.");});
        else requestPermissions(new String[]{Manifest.permission.CAMERA},33);
        ui.postDelayed(()->{if(active==generation&&counting&&opening){setNotice("마이크 입력을 확인하지 못했습니다. 다시 시작해주세요.");end();}},6000);
    }
    private void prepareVideo(int active){
        opening=false;
        if(!recordingVideo){countdown(active,3);return;}
        long began=SystemClock.elapsedRealtime();Runnable wait=new Runnable(){public void run(){
            if(active!=generation||!screen.equals("live"))return;
            if(!camera.ready()){if(SystemClock.elapsedRealtime()-began<10000){ui.postDelayed(this,100);return;}setNotice("카메라를 준비하지 못해 음성만 저장합니다.");countdown(active,3);return;}
            File file=new File(store.audio(run,1).getParentFile(),"interview.mp4");final String id=run;
            PracticeVideo movie=new PracticeVideo(file,new PracticeVideo.Listener(){
                public void started(boolean success){if(active!=generation||!screen.equals("live")){if(video!=null)video.stop();return;}videoSaving=success;if(!success)setNotice("영상을 녹화하지 못해 음성만 저장합니다.");if(recordingBadge!=null)recordingBadge.setVisibility(success?View.VISIBLE:View.GONE);countdown(active,3);}
                public void finished(File file,boolean success){
                    if(video!=null)camera.removeSink(video);capture.video(null);if(recordingBadge!=null)recordingBadge.setVisibility(View.GONE);
                    videoSaving=false;video=null;
                    try{JSONObject saved=store.load(id);if(success){saved.put("video","interview.mp4");store.save(id,saved);}if(run.equals(id))record=saved;}catch(Exception ignored){}
                    if(!screen.equals("live")){if(destroyed)camera.close();else camera.stop();}
                    if(!destroyed){if(!success)setNotice("영상을 저장하지 못했습니다. 답변 음성은 별도로 보관됩니다.");if(screen.equals("result")&&run.equals(id))render();if(screen.equals("prep"))render();}
                }
            });
            video=movie;videoRun=id;videoSaving=true;camera.addSink(movie);capture.video(movie);movie.start(camera.context());
        }};wait.run();
    }
    private void countdown(int active,int seconds){
        if(active!=generation||!screen.equals("live"))return;
        if(seconds==0){counting=false;started=SystemClock.elapsedRealtime();speakQuestion();tick();return;}
        countdownText.setText(String.valueOf(seconds));turnText.setText(seconds+"초 후 시작");ui.postDelayed(()->countdown(active,seconds-1),1000);
    }
    private void speakQuestion(){
        if(!screen.equals("live")||counting||answering)return;stopTurn(true);talking=true;recordingReady=false;int active=++generation;updateLive();
        player=bank.create(this,question);if(player==null){setNotice("질문 음성을 열지 못했습니다.");end();return;}outputLevel.playback(player.getAudioSessionId());
        player.setOnCompletionListener(p->{if(active==generation&&screen.equals("live")){stopPlayback();beginAnswer(active);}});
        player.setOnErrorListener((p,a,b)->{if(active==generation){stopPlayback();beginAnswer(active);setNotice("화면의 질문을 확인해주세요.");}return true;});player.start();animateMeters(active);
    }
    private void beginAnswer(int active){
        if(active!=generation||!screen.equals("live"))return;talking=true;recordingReady=false;updateLive();turnText.setText("마이크 준비 중…");
        if(bridgeReady&&consent)captions=bridge.captions(question,mode,transcript,new InterviewLiveCaptions.Listener(){
            public void text(String value,boolean speech){if(active==generation&&!destroyed){transcript=value;updateLive();}}
            public void failed(){if(active==generation)setNotice("자막 연결이 끊겼습니다. 녹음은 계속됩니다.");}
        });
        final InterviewLiveCaptions current=captions;
        capture.beginAnswer(store.audio(run,number),current==null?null:(bytes,time)->current.pcm(bytes),ready->{
            if(active!=generation||!screen.equals("live"))return;
            if(!ready){setNotice("마이크 녹음을 시작하지 못했습니다.");end();return;}
            try{player=MediaPlayer.create(this,com.ronpark.interview.R.raw.interview_answer_cue);player.setOnCompletionListener(p->{if(active==generation){stopPlayback();answerReady(active);}});player.start();}catch(Exception error){stopPlayback();answerReady(active);}
        });
        ui.postDelayed(()->{if(active==generation&&!recordingReady&&talking&&screen.equals("live")){setNotice("마이크 입력을 확인하지 못했습니다.");end();}},5000);
    }
    private void answerReady(int active){talking=false;recordingReady=true;updateLive();watch(active,new PracticeTiming(SystemClock.elapsedRealtime()));}
    private void watch(int active,PracticeTiming gate){
        if(active!=generation||!screen.equals("live")||!recordingReady||talking)return;
        long now=SystemClock.elapsedRealtime();int state=gate.sample(now,capture.speaking);if(state==PracticeTiming.COMPLETE){answer();return;}
        long remaining=gate.remaining(now);silence.setProgress((int)remaining);silence.setVisibility(state==PracticeTiming.PAUSE?View.VISIBLE:View.INVISIBLE);
        if(transcript.isEmpty())turnText.setText(state==PracticeTiming.PAUSE?"다음 질문까지 "+((remaining+999)/1000)+"초":state==PracticeTiming.SPEAKING?"답변을 듣는 중":"이제 답변해 주세요");
        ui.postDelayed(()->watch(active,gate),100);
    }
    private void tick(){if(!screen.equals("live"))return;long seconds=(SystemClock.elapsedRealtime()-started)/1000;clock.setText(String.format(Locale.KOREA,"%d:%02d / 10:00",seconds/60,seconds%60));if(seconds>=600){end();return;}ui.postDelayed(ticker,1000);}
    private void animateMeters(int active){if(active!=generation||!screen.equals("live"))return;if(leftBars!=null){leftBars.level=talking?outputLevel.level:0;leftBars.invalidate();rightBars.level=!talking?capture.level:0;rightBars.invalidate();stage.invalidate();}ui.postDelayed(()->animateMeters(active),60);}
    private void updateLive(){if(!screen.equals("live")||answerButton==null)return;questionText.setText(question);countdownText.setVisibility(counting?View.VISIBLE:View.GONE);answerButton.setEnabled(!counting&&!talking&&recordingReady&&!answering);answerButton.setText(counting?"면접 준비 중":talking?"질문을 듣고 답변해 주세요":"답변 완료 →");replayButton.setEnabled(!counting&&!answering);turnText.setText(counting?"잠시 후 첫 질문을 시작합니다.":talking?"질문을 듣는 중":transcript.isEmpty()?"이제 답변해 주세요":transcript);if(stage!=null)stage.invalidate();}
    private void answer(){if(!screen.equals("live")||counting||talking||!recordingReady||answering)return;answering=true;captureAnswer();if(number>=questions.length){finishRecord(true);return;}number++;question=questions[number-1];transcript="";answering=false;speakQuestion();}
    private void captureAnswer(){
        boolean captured=recordingReady,wavSaved=capture.finishAnswer();recordingReady=false;
        final InterviewLiveCaptions current=captions;captions=null;
        if(!captured||!wavSaved){if(current!=null)current.close();if(!wavSaved)setNotice("답변 음성을 저장하지 못했습니다. 저장 공간을 확인해주세요.");return;}
        File file=store.audio(run,number);if(file.length()<=44){if(current!=null)current.close();return;}
        for(int i=0;i<turns.length();i++)if(turns.optJSONObject(i).optInt("number")==number){if(current!=null)current.close();return;}
        final String id=run,prompt=question,selectedMode=mode;final int index=number;final boolean analyze=bridgeReady&&consent;
        turns.put(InterviewApi.json("number",index,"kind","initial","question",question,"answer",transcript,"audio",file.getName(),"duration_ms",(file.length()-44)*1000/32000,"analysis_pending",analyze));save();
        InterviewLiveCaptions.FinalReply completed=(text,confirmed)->{
            pendingCaptions.remove(current);interruptedCaptions.remove(current);updateTurn(id,index,t->{t.put("answer",text);t.put("caption_final",confirmed);});
            if(analyze)bridge.analyze(file,prompt,selectedMode,confirmed?text:"",(data,error)->updateTurn(id,index,t->{t.remove("analysis_pending");if(error==null){JSONObject result=data.optJSONObject("result");t.put("analysis",result);if(result!=null)t.put("answer",result.optString("transcript",text));}else t.put("analysis_error",error);}));
        };
        if(current!=null){pendingCaptions.add(current);interruptedCaptions.put(current,()->updateTurn(id,index,t->{t.remove("analysis_pending");t.put("analysis_error","interrupted");}));current.finish(completed);}else completed.done(transcript,false);
    }
    private interface Change{void apply(JSONObject turn)throws Exception;}
    private void updateTurn(String id,int index,Change change){try{JSONObject saved=store.load(id);JSONArray rows=saved.getJSONObject("run").getJSONArray("turns");for(int i=0;i<rows.length();i++)if(rows.getJSONObject(i).optInt("number")==index)change.apply(rows.getJSONObject(i));store.save(id,saved);if(run.equals(id)){record=saved;turns=rows;if(!destroyed&&screen.equals("result")&&player==null)render();}}catch(Exception ignored){}}
    private boolean save(){try{if(record!=null){record.getJSONObject("run").put("turns",turns);store.save(run,record);}return true;}catch(Exception error){setNotice("기록을 저장하지 못했습니다. 저장 공간을 확인해주세요.");return false;}}
    private void stopTurn(boolean closeCaptions){generation++;capture.finishAnswer();stopPlayback();recordingReady=false;if(closeCaptions&&captions!=null){captions.close();captions=null;}}
    private void confirmEnd(){new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("지금까지의 답변을 저장합니다.").setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,w)->end()).show();}
    private void end(){if(!screen.equals("live"))return;captureAnswer();finishRecord(false);}
    private void finishRecord(boolean completed){
        stopTurn(true);ui.removeCallbacks(ticker);counting=false;opening=false;talking=false;answering=false;screen="result";
        try{record.getJSONObject("run").put("state",completed?"completed":"interrupted");}catch(Exception ignored){}save();
        if(video!=null){camera.removeSink(video);capture.video(null);video.stop();}else camera.stop();capture.stop();stopChecks();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();
    }
    private void result(){
        add("면접 결과",25,ink);if(record==null){add("기록을 불러오지 못했습니다.",14,sub);return;}
        add("음성·영상은 이 기기에만 저장됩니다.",12,sub);if(videoSaving)add("영상 저장 중…",13,teal);
        if(record.optString("video").equals("interview.mp4"))button("면접 영상 보기",false,this::playVideo);
        JSONArray rows=record.optJSONObject("run").optJSONArray("turns");
        for(int i=0;i<rows.length();i++){
            JSONObject turn=rows.optJSONObject(i);int index=turn.optInt("number",i+1);add((i+1)+". "+turn.optString("question"),18,ink);add(turn.optLong("duration_ms")/1000+"초",12,sub);button("내 답변 듣기",false,()->playAudio(index));
            if(!turn.optString("answer").isEmpty())add(turn.optString("answer"),14,ink);JSONObject analysis=turn.optJSONObject("analysis");
            if(analysis!=null){add("AI 연습 피드백",12,teal);for(String key:new String[]{"summary","strength","improvement"})if(!analysis.optString(key).isEmpty())add(analysis.optString(key),14,sub);}
            else add(turn.optBoolean("analysis_pending")?"AI 분석 중 · 녹음은 저장되었습니다.":turn.has("analysis_error")?"AI 분석을 완료하지 못했습니다. 녹음은 보관되었습니다.":"AI 평가 미연결",12,sub);
        }
        button("다시 연습하기",true,()->{stopPlayback();screen="prep";refreshQuestions();render();});button("내 면접 기록",false,()->{screen="records";render();});button("모의면접 메뉴",false,this::finish);
    }
    private void records(){add("내 면접 기록",25,ink);List<JSONObject> saved=store.list();if(saved.isEmpty())add("아직 저장된 기록이 없습니다.",14,sub);
        for(JSONObject row:saved){String id=row.optString("id");String date=new java.text.SimpleDateFormat("MM.dd HH:mm",Locale.KOREA).format(new Date(row.optLong("created_at")));
            button(row.optString("track")+" · "+date,false,()->{stopPlayback();run=id;record=row;mode=row.optString("mode","ai");track=row.optString("track",track);screen="result";render();});
            button("기록 삭제",false,()->new AlertDialog.Builder(this).setTitle("기록을 삭제할까요?").setMessage("이 기기의 답변 음성과 영상도 삭제됩니다.").setNegativeButton("취소",null).setPositiveButton("삭제",(d,w)->{try{if(videoSaving&&id.equals(videoRun)){setNotice("영상 저장이 끝난 후 삭제해주세요.");return;}stopPlayback();store.delete(id);render();}catch(Exception error){setNotice("기록을 삭제하지 못했습니다.");}}).show());
        }button("면접 준비로",false,()->{screen="prep";refreshQuestions();render();});button("모의면접 메뉴",false,this::finish);
    }
    private void playAudio(int index){stopPlayback();try{player=new MediaPlayer();player.setDataSource(store.audio(run,index).getAbsolutePath());player.setOnPreparedListener(MediaPlayer::start);player.setOnCompletionListener(p->stopPlayback());player.prepareAsync();}catch(Exception e){setNotice("녹음을 재생하지 못했습니다.");}}
    private void playVideo(){
        stopPlayback();final Dialog dialog=new Dialog(this,android.R.style.Theme_Material_Light_NoActionBar_Fullscreen);videoDialog=dialog;LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
        VideoView view=new VideoView(this);layout.addView(view,new LinearLayout.LayoutParams(-1,0,1));Button close=new Button(this);close.setText("닫기");close.setOnClickListener(v->dialog.dismiss());layout.addView(close);
        view.setVideoPath(new File(store.audio(run,1).getParentFile(),"interview.mp4").getAbsolutePath());MediaController controls=new MediaController(this);controls.setAnchorView(view);view.setMediaController(controls);view.setOnPreparedListener(p->view.start());view.setOnErrorListener((p,a,b)->{setNotice("저장된 영상을 재생하지 못했습니다.");dialog.dismiss();return true;});dialog.setContentView(layout);dialog.setOnDismissListener(d->{view.stopPlayback();if(videoDialog==dialog)videoDialog=null;});dialog.show();
    }
    private void stopPlayback(){outputLevel.stop();if(player!=null){player.release();player=null;}if(videoDialog!=null){Dialog old=videoDialog;videoDialog=null;old.dismiss();}}
    private void checkMedia(){if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},32);return;}camera.start(this,cameraHost,ok->{if(!ok)setNotice("카메라 없이도 면접할 수 있습니다.");});checkMicrophone();}
    private void checkMicrophone(){
        stopChecks();final int checking=checkGeneration;setNotice("주변 소음을 확인 중입니다.");new Thread(()->{
            try{int size=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));AudioRecord microphone=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);if(checking!=checkGeneration){microphone.release();return;}checkMic=microphone;checkNoise.attach(microphone.getAudioSessionId());InterviewMicLevel signal=new InterviewMicLevel();signal.calibrate();microphone.startRecording();short[] samples=new short[1024];long limit=SystemClock.elapsedRealtime()+10000,last=0;while(checkMic==microphone&&checking==checkGeneration&&SystemClock.elapsedRealtime()<limit){int n=microphone.read(samples,0,samples.length);if(n<=0)break;signal.sample(samples,n);if(!signal.calibrating())noiseDb=signal.noiseDb();long now=SystemClock.elapsedRealtime();if(now-last>=50){last=now;int level=Math.round(signal.level()*100);ui.post(()->{if(screen.equals("prep")&&checkMic==microphone&&meter!=null)meter.setProgress(level);});}}if(checkMic==microphone)ui.post(this::stopChecks);}catch(Exception error){if(checking==checkGeneration)ui.post(()->setNotice("마이크를 확인하지 못했습니다."));}
        },"PracticeMicCheck").start();
    }
    private void stopChecks(){checkGeneration++;AudioRecord old=checkMic;checkMic=null;if(old!=null){try{old.stop();}catch(Exception ignored){}checkNoise.close();old.release();}if(meter!=null)meter.setProgress(0);}
    private void setNotice(String value){notice=value;if(status!=null&&!destroyed){status.setText(value);status.setVisibility(value.isEmpty()?View.GONE:View.VISIBLE);}}
    private void back(){if(screen.equals("live"))confirmEnd();else finish();}
    @Override public void onBackPressed(){back();}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){super.onRequestPermissionsResult(code,permissions,grants);if(destroyed)return;if(code==31){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)requestStart();else setNotice("마이크 권한을 허용해주세요.");}if(code==32&&screen.equals("prep")){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)checkMicrophone();if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera.start(this,cameraHost,ok->{});}if(code==33&&screen.equals("live")&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)camera.start(this,cameraHost,ok->{});}
    @Override protected void onStop(){super.onStop();if(screen.equals("live"))end();stopPlayback();stopChecks();if(avatar!=null)avatar.paused(true);if(video==null)camera.stop();}
    @Override protected void onDestroy(){if(screen.equals("live"))end();destroyed=true;generation++;ui.removeCallbacksAndMessages(null);if(avatar!=null)avatar.close();capture.stop();stopChecks();stopPlayback();for(Runnable cancel:new ArrayList<>(interruptedCaptions.values()))cancel.run();interruptedCaptions.clear();for(InterviewLiveCaptions c:pendingCaptions)c.close();pendingCaptions.clear();bridge.close();if(video==null)camera.close();super.onDestroy();}
    private final class Stage extends FrameLayout {
        private final Paint paint=new Paint(3);private final Path mask=new Path();Stage(){super(InterviewPracticeActivity.this);setWillNotDraw(false);}
        protected void onMeasure(int width,int height){super.onMeasure(width,MeasureSpec.makeMeasureSpec(MeasureSpec.getSize(width)*7/8,MeasureSpec.EXACTLY));}
        protected void dispatchDraw(Canvas canvas){super.dispatchDraw(canvas);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(dp(2));paint.setColor(counting?Color.TRANSPARENT:teal);float half=getWidth()/2f;canvas.drawRect(talking?0:half,1,talking?half:getWidth()-1,getHeight()-1,paint);paint.setStyle(Paint.Style.FILL);paint.setColor(paper);mask.reset();mask.setFillType(Path.FillType.EVEN_ODD);mask.addRect(0,0,getWidth(),getHeight(),Path.Direction.CW);mask.addRoundRect(0,0,getWidth(),getHeight(),dp(20),dp(20),Path.Direction.CW);canvas.drawPath(mask,paint);}
    }
    private final class Bars extends View {
        float level;final Paint paint=new Paint(3);Bars(){super(InterviewPracticeActivity.this);setContentDescription("음성 입력 크기");}
        protected void onDraw(Canvas c){paint.setColor(0xddffffff);c.drawRoundRect(0,0,getWidth(),getHeight(),dp(10),dp(10),paint);paint.setColor(teal);for(int i=0;i<5;i++){float h=dp(3)+level*dp(18)*(i==2?1:.6f);float x=dp(12+i*13);c.drawRoundRect(x,(getHeight()-h)/2,x+dp(5),(getHeight()+h)/2,dp(3),dp(3),paint);}}
    }
}
