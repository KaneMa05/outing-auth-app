package com.ronpark.interview;

import android.Manifest;
import android.app.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import java.io.File;

/** Actual Android Views: no WebView, JavaScript renderer, or embedded HTML. */
public final class InterviewActivity extends Activity implements NativeInterviewCall.Listener {
    final int ink=Color.rgb(21,44,67),teal=Color.rgb(8,125,114),sub=Color.rgb(101,119,138),paper=Color.rgb(246,248,250);
    final Handler ui=new Handler(Looper.getMainLooper());final InterviewCamera camera=new InterviewCamera();
    InterviewApi api;NativeInterviewCall call;LinearLayout column;FrameLayout cameraBox;TextView status,questionView,questionCounter,transcriptView,timerView;Button answerButton,muteButton;ProgressBar meter;
    String screen="auth",question="",transcript="",spoken="",runId="",notice="연결 상태를 확인하고 있습니다.";boolean demo=false,destroyed=false,cameraOn=false,muted=false,answering=false,ready=false,captions=true;int questionNo=0,recordPage=0;long startedAt;
    volatile AudioRecord micCheck;volatile double micNoiseDb=InterviewMicLevel.DEFAULT_NOISE_DB;MediaPlayer playback;JSONObject record;JSONArray demoTurns=new JSONArray();
    TextToSpeech questionSpeech;boolean speechReady=false;MediaPlayer questionAudio;InterviewQuestionAudio questionFiles;
    final InterviewVoiceLevel voiceLevel=new InterviewVoiceLevel();
    final InterviewNoiseControl micNoiseControl=new InterviewNoiseControl();
    final Set<InterviewLiveCaptions> finishingCaptions=new HashSet<>();
    InterviewLocalStore localStore;InterviewFreeApi freeApi;String practiceMode="ai",selectedTrack="";int availableQuestions;long localCreated;boolean localSaved,customPracticeQuestions,freeReady,freeConsent;
    void loadPracticeQuestions(){
        if(questionFiles==null)questionFiles=new InterviewQuestionAudio(this);
        availableQuestions=questionFiles.eligible(practiceMode,selectedTrack).size();
        sample=questionFiles.sample(practiceMode,selectedTrack,3);ready=sample.length>0;
    }
    void chooseTrack(){
        if(!demo||!screen.equals("prep"))return;
        new AlertDialog.Builder(this).setTitle("직렬 선택").setItems(InterviewQuestionPolicy.TRACKS,(dialog,index)->{
            selectedTrack=InterviewQuestionPolicy.TRACKS[index];getSharedPreferences("interview-preview",MODE_PRIVATE).edit().putString("track",selectedTrack).apply();
            loadPracticeQuestions();notice=ready?"선택한 직렬의 음성 질문으로 연습합니다.":"해당 직렬에 음성이 준비된 질문이 없습니다.";render();
        }).show();
    }
    void advancePractice(){
        if(questionNo==sample.length){end();return;}
        question=sample[questionNo++];spoken=question;transcript="";answering=false;render();speakQuestion();
    }
    void analyzePractice(){
        queuePracticeAnswer();advancePractice();
    }
    void queuePracticeAnswer(){
        final InterviewLiveCaptions captions=liveCaptions;liveCaptions=null;
        stopQuestionAudio();
        for(int i=0;i<demoTurns.length();i++)if(demoTurns.optJSONObject(i).optInt("number")==questionNo){if(captions!=null)captions.close();return;}
        captureLocalAnswer();saveLocal(false);
        final String currentRun=runId;final int currentNo=questionNo;
        final File audio=localAudio();final String prompt=question,mode=practiceMode,interim=transcript;
        final boolean analyze=freeReady&&freeConsent&&audio.exists()&&audio.length()>44;
        for(int i=0;i<demoTurns.length();i++)if(demoTurns.optJSONObject(i).optInt("number")==currentNo)try{demoTurns.optJSONObject(i).put("analysis_pending",analyze);}catch(Exception ignored){}
        saveLocal(false);
        InterviewLiveCaptions.FinalReply completed=(text,confirmed)->{
            if(captions!=null)finishingCaptions.remove(captions);
            try{
                JSONObject saved=localStore.load(currentRun);JSONArray turns=saved.getJSONObject("run").getJSONArray("turns");
                for(int i=0;i<turns.length();i++){JSONObject turn=turns.optJSONObject(i);if(turn.optInt("number")==currentNo){turn.put("answer",text);turn.put("caption_final",confirmed);}}
                localStore.save(currentRun,saved);refreshPracticeRecord(currentRun,saved);
            }catch(Exception ignored){}
            // An unfinished live transcript is re-read from the existing WAV in the analysis call.
            if(analyze&&!destroyed)analyzePracticeRecording(currentRun,currentNo,audio,prompt,mode,confirmed?text:"");
        };
        if(captions!=null){finishingCaptions.add(captions);captions.finish(completed);}else completed.done(interim,false);
    }
    void refreshPracticeRecord(String id,JSONObject saved)throws JSONException{
        if(destroyed||!runId.equals(id))return;
        demoTurns=saved.getJSONObject("run").getJSONArray("turns");record=saved;
        if(screen.equals("result")&&playback==null)render();
    }
    void analyzePracticeRecording(String currentRun,int currentNo,File audio,String prompt,String mode,String confirmedTranscript){
        freeApi.analyze(audio,prompt,mode,confirmedTranscript,(data,error)->{
            try{
                JSONObject saved=localStore.load(currentRun),run=saved.getJSONObject("run");JSONArray turns=run.getJSONArray("turns");
                JSONObject feedback=error==null?data.optJSONObject("result"):null;
                for(int i=0;i<turns.length();i++){JSONObject turn=turns.optJSONObject(i);if(turn.optInt("number")!=currentNo)continue;turn.remove("analysis_pending");
                    if(feedback!=null){turn.put("analysis",feedback);turn.put("answer",feedback.optString("transcript"));}else turn.put("analysis_error",error==null?"invalid_output":error);
                }
                localStore.save(currentRun,saved);
                if(!destroyed&&runId.equals(currentRun)){
                    refreshPracticeRecord(currentRun,saved);
                    // Audio-only preview keeps the selected, packaged question set fixed.
                }
            }catch(Exception ignored){}
        });
    }
    String modeTitle(){return practiceMode.equals("job")?"전공(직무) 시험모드":practiceMode.equals("personality")?"인성 연습모드":"실전 모의면접 (AI)";}
    File localAudio(){return localStore.audio(runId,questionNo);}
    void captureLocalAnswer(){
        if(!demo||runId.isEmpty())return;
        voiceLevel.stop();
        for(int i=0;i<demoTurns.length();i++)if(demoTurns.optJSONObject(i).optInt("number")==questionNo)return;
        File audio=localAudio();long bytes=audio.exists()?Math.max(0,audio.length()-44):0;
        if(bytes==0)return;
        demoTurns.put(InterviewApi.json("number",questionNo,"kind","initial","question",question,"complete",true,"duration_ms",bytes*1000/32000,"audio",audio.getName(),"answer",transcript));
    }
    void saveLocal(boolean completed){
        record=InterviewApi.json("id",runId,"mode",practiceMode,"track",selectedTrack,"created_at",localCreated,"run",InterviewApi.json("turns",demoTurns,"state",completed?"completed":"interrupted"));
        try{localStore.save(runId,record);localSaved=true;}catch(Exception error){notice="기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요.";localSaved=false;}
    }
    void playLocal(int number){
        stopPlayback();try{File file=localStore.audio(runId,number);if(!file.exists()||file.length()<=44)throw new IllegalStateException();MediaPlayer p=playback=new MediaPlayer();p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(file.getAbsolutePath());p.setOnPreparedListener(v->{if(playback==v)v.start();});p.setOnCompletionListener(v->{if(playback==v)stopPlayback();});p.setOnErrorListener((v,a,b)->{stopPlayback();setNotice("음성을 재생하지 못했습니다.");return true;});p.prepareAsync();}catch(Exception error){setNotice("저장된 음성을 재생하지 못했습니다.");}
    }
    int answerGeneration=0;InterviewLiveCaptions liveCaptions;long lastCaptionAt;
    boolean questionTalking=false;TextView turnHint;Orb voiceOrb;ToneGenerator answerTone;ProgressBar silenceBar;
    void updateTurn(boolean talking){
        questionTalking=talking;
        if(turnHint!=null){turnHint.setText(talking?"질문을 듣는 중":"이제 답변해 주세요");turnHint.setTextColor(talking?sub:teal);}
        if(silenceBar!=null){silenceBar.setProgress(InterviewAnswerGate.SILENCE_MS);silenceBar.setVisibility(View.INVISIBLE);}
        if(demo&&transcriptView!=null)transcriptView.setText(talking?"질문이 끝나면 답변을 시작해 주세요.":transcript.isEmpty()?"말씀하시면 자막이 표시됩니다.":transcript);
        if(answerButton!=null){answerButton.setEnabled(screen.equals("live")&&!answering&&!talking);answerButton.setAlpha(talking?0.45f:1f);answerButton.setText(talking?"질문을 듣고 답변해 주세요":"답변 완료 →");}
        if(voiceOrb!=null){voiceOrb.setContentDescription(talking?"면접관이 질문하고 있습니다":"답변할 차례입니다");voiceOrb.invalidate();}
    }
    MediaPlayer answerCue;
    void answerTurn(){
        if(destroyed||!screen.equals("live"))return;
        final int generation=answerGeneration;
        int cue=getResources().getIdentifier("interview_answer_cue","raw",getPackageName());
        if(cue!=0)try{
            answerCue=MediaPlayer.create(this,cue,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build(),0);
            if(answerCue!=null){
                answerCue.setVolume(1f,1f);
                answerCue.setOnCompletionListener(p->{if(answerCue==p){answerCue.release();answerCue=null;if(generation==answerGeneration)beginAnswer();}});
                answerCue.setOnErrorListener((p,a,b)->{if(answerCue==p){answerCue.release();answerCue=null;if(generation==answerGeneration)beginAnswer();}return true;});
                answerCue.start();return;
            }
        }catch(Exception ignored){}
        beginAnswer();
    }
    void beginAnswer(){
        if(destroyed||!screen.equals("live"))return;
        updateTurn(false);
        if(demo&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){
            final int generation=++answerGeneration;
            lastCaptionAt=0;
            if(freeReady&&freeConsent)liveCaptions=freeApi.captions(question,practiceMode,transcript,new InterviewLiveCaptions.Listener(){
                public void text(String text,boolean speech){if(destroyed||generation!=answerGeneration||questionTalking)return;if(speech)lastCaptionAt=SystemClock.elapsedRealtime();transcript=text;if(transcriptView!=null)transcriptView.setText(text);}
                public void failed(){if(!destroyed&&generation==answerGeneration&&transcriptView!=null)transcriptView.setText(transcript.isEmpty()?"실시간 자막 연결이 끊겼습니다. 녹음은 계속됩니다.":transcript);}
            });
            final InterviewLiveCaptions captions=liveCaptions;
            voiceLevel.microphone(localAudio(),captions==null?null:captions::pcm,micNoiseDb);watchAnswer(generation,new InterviewAnswerGate(SystemClock.elapsedRealtime()));
        }
    }
    void watchAnswer(int generation,InterviewAnswerGate gate){
        if(destroyed||generation!=answerGeneration||!demo||!screen.equals("live")||questionTalking||answering)return;
        long now=SystemClock.elapsedRealtime();boolean online=liveCaptions!=null&&liveCaptions.available();
        int state=gate.sample(now,online?lastCaptionAt>0&&now-lastCaptionAt<700:voiceLevel.speaking,online&&voiceLevel.speaking);
        if(state==InterviewAnswerGate.COMPLETE){answer();return;}
        long remaining=gate.remaining(SystemClock.elapsedRealtime());
        if(turnHint!=null)turnHint.setText(state==InterviewAnswerGate.SPEAKING?"답변을 듣는 중":state==InterviewAnswerGate.PAUSE?"다음 질문까지 "+((remaining+999)/1000)+"초":"이제 답변해 주세요");
        if(silenceBar!=null){silenceBar.setVisibility(state==InterviewAnswerGate.PAUSE?View.VISIBLE:View.INVISIBLE);silenceBar.setProgress((int)remaining,true);}
        ui.postDelayed(()->watchAnswer(generation,gate),100);
    }
    void stopQuestionAudio(){answerGeneration++;if(liveCaptions!=null){liveCaptions.close();liveCaptions=null;}if(answerCue!=null){answerCue.release();answerCue=null;}voiceLevel.stop();if(questionAudio!=null){questionAudio.release();questionAudio=null;}}
    void speakQuestion(){
        if(!demo||destroyed||!screen.equals("live"))return;
        updateTurn(true);
        stopQuestionAudio();
        if(questionFiles==null)questionFiles=new InterviewQuestionAudio(this);
        int audio=customPracticeQuestions||practiceMode.equals("job")?0:getResources().getIdentifier("interview_question_"+questionNo,"raw",getPackageName());
        MediaPlayer filePlayer=questionFiles.create(this,question);
        if(demo&&filePlayer==null){screen="prep";loadPracticeQuestions();notice="질문 음성 파일을 열지 못했습니다. 다시 시작해 주세요.";render();return;}
        if(filePlayer!=null||audio!=0){
            if(questionSpeech!=null)questionSpeech.stop();
            try{
                MediaPlayer player=questionAudio=filePlayer!=null?filePlayer:MediaPlayer.create(this,audio,new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build(),0);
                if(player==null)throw new IllegalStateException();
                if(filePlayer!=null){spoken=questionFiles.spokenPrompt(question);if(questionView!=null)questionView.setText(spoken);}
                player.setOnCompletionListener(p->{if(questionAudio==p){stopQuestionAudio();answerTurn();}});
                player.setOnErrorListener((p,a,b)->{if(questionAudio==p){stopQuestionAudio();answerTurn();setNotice("질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요.");}return true;});
                voiceLevel.playback(player.getAudioSessionId());player.start();return;
            }catch(Exception error){stopQuestionAudio();}
        }
        if(questionSpeech==null){questionSpeech=new TextToSpeech(this,result->ui.post(()->{
            if(destroyed||questionSpeech==null)return;
            if(result!=TextToSpeech.SUCCESS){answerTurn();setNotice("질문 음성을 준비하지 못했습니다. 화면의 질문을 확인해주세요.");return;}
            int language=questionSpeech.setLanguage(Locale.KOREAN);
            speechReady=language!=TextToSpeech.LANG_MISSING_DATA&&language!=TextToSpeech.LANG_NOT_SUPPORTED;
            questionSpeech.setSpeechRate(0.95f);questionSpeech.setPitch(1.0f);
            questionSpeech.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            questionSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                public void onStart(String id){}
                public void onDone(String id){ui.post(()->{if(id.equals("question-"+questionNo))answerTurn();});}
                public void onError(String id){ui.post(()->{if(id.equals("question-"+questionNo))answerTurn();});}
            });
            if(speechReady)speakQuestion();else {answerTurn();setNotice("기기의 한국어 TTS 음성을 확인해주세요. 화면의 질문으로도 진행할 수 있습니다.");}
        }));return;}
        if(speechReady&&questionSpeech.speak(question,TextToSpeech.QUEUE_FLUSH,null,"question-"+questionNo)==TextToSpeech.ERROR){answerTurn();setNotice("질문을 읽지 못했습니다. 화면의 질문을 확인해주세요.");}
    }
    String[] sample={"협업 중 의견 차이를 해결한 경험을 말씀해주세요.","그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?","그 경험에서 배운 점을 말씀해주세요."};
    @Override public void onCreate(Bundle saved){super.onCreate(saved);api=new InterviewApi();demo=BuildConfig.DEBUG&&getIntent().getBooleanExtra("demo",false);getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->back());
        if(demo){localStore=new InterviewLocalStore(this);String requested=getIntent().getStringExtra("practiceMode");practiceMode="job".equals(requested)?"job":"personality".equals(requested)?"personality":"ai";
            selectedTrack=getSharedPreferences("interview-preview",MODE_PRIVATE).getString("track","공채");if(!InterviewQuestionPolicy.validTrack(selectedTrack))selectedTrack="공채";
            loadPracticeQuestions();
            freeApi=new InterviewFreeApi(this);screen=getIntent().getBooleanExtra("showRecords",false)?"records":"prep";notice="답변 음성은 이 기기에만 저장됩니다.";render();
            freeApi.status((data,error)->{if(destroyed)return;freeReady=error==null&&data.optBoolean("ready");if(screen.equals("prep")){notice=freeReady?"무료 AI 테스트 연결됨 · 테스트용 답변만 사용해주세요.":"기기 내 녹음·재생 · AI 서버 연결 대기";setNotice(notice);}});return;}
        Uri uri=getIntent().getData();String code=uri==null?null:uri.getQueryParameter("code");
        if(uri==null||!"ronpark-study".equals(uri.getScheme())||!"interview".equals(uri.getHost())||!"/start".equals(uri.getPath())||code==null||!code.matches("[A-Za-z0-9_-]{43}")){screen="error";notice="학생앱의 모의면접 메뉴에서 다시 열어주세요.";render();return;}
        // Remove the one-time code from the retained intent before network exchange.
        getIntent().setData(null);render();api.exchange(code,(d,e)->{if(destroyed)return;if(e!=null){screen="error";notice="앱 연결이 만료되었습니다. 학생앱에서 다시 열어주세요.";render();return;}selectedTrack=d.optString("track","");screen="prep";checkReady();});
    }
    void checkReady(){if(demo){loadPracticeQuestions();screen="prep";render();return;}ready=false;notice="이용 가능 여부를 확인하고 있습니다.";render();api.command("ready",new JSONObject(),(d,e)->{if(destroyed)return;ready=e==null&&d.optBoolean("ready");notice=ready?"준비되면 면접을 시작해 주세요.":"면접 연결을 준비 중입니다. 수강 등록과 서버 연결 상태를 확인해주세요.";render();});}
    int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setLineSpacing(dp(3),1);v.setPadding(0,dp(7),0,dp(7));return v;}
    void add(String value,int size,int color){column.addView(text(value,size,color));}
    Button button(String title,boolean primary,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:teal);b.setBackground(bg(primary?teal:Color.WHITE,16));b.setMinHeight(dp(50));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(10);b.setLayoutParams(lp);b.setOnClickListener(v->action.run());column.addView(b);return b;}
    void render(){if(destroyed)return;stopPlayback();ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(paper);column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(dp(24),dp(20),dp(24),dp(32));scroll.addView(column);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});scroll.requestApplyInsets();

        LinearLayout menuHeader=new LinearLayout(this);menuHeader.setGravity(Gravity.CENTER_VERTICAL);
        TextView menuTitle=text(demo?modeTitle():"모의면접",16,teal);menuHeader.addView(menuTitle,new LinearLayout.LayoutParams(0,-2,1));
        TextView trackLabel=text(selectedTrack.isEmpty()?"직렬 확인 중":selectedTrack+(demo&&screen.equals("prep")?" ▾":""),15,teal);trackLabel.setGravity(Gravity.CENTER);trackLabel.setMinHeight(dp(48));trackLabel.setPadding(dp(12),0,dp(8),0);trackLabel.setContentDescription("직렬 "+(selectedTrack.isEmpty()?"확인 중":selectedTrack)+(demo&&screen.equals("prep")?", 변경 가능":", 고정"));
        if(demo&&screen.equals("prep"))trackLabel.setOnClickListener(v->chooseTrack());menuHeader.addView(trackLabel);column.addView(menuHeader);
        if(screen.equals("prep"))prep();else if(screen.equals("live")||screen.equals("closing"))live();else if(screen.equals("result"))result(false);else if(screen.equals("records"))records();else add(screen.equals("auth")?"앱에 연결하고 있습니다.":"연결을 확인해주세요.",24,ink);
        status=text(notice,13,teal);if(screen.equals("live")||(screen.equals("result")&&(demo||record!=null)))status.setVisibility(View.GONE);status.setBackground(bg(Color.rgb(231,244,241),14));status.setPadding(dp(14),dp(14),dp(14),dp(14));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(16);column.addView(status,lp);
    }
    void prep(){add("면접 준비",25,ink);
        cameraBox=new FrameLayout(this);cameraBox.setBackground(bg(Color.rgb(220,229,233),23));LinearLayout.LayoutParams preview=new LinearLayout.LayoutParams(dp(216),dp(288));preview.gravity=Gravity.CENTER_HORIZONTAL;column.addView(cameraBox,preview);TextView hint=text("카메라 미리보기\n영상은 전송·저장하지 않습니다.",14,sub);hint.setGravity(Gravity.CENTER);cameraBox.addView(hint,new FrameLayout.LayoutParams(-1,-1));if(cameraOn)camera.attach(cameraBox);
        button("카메라 및 마이크 확인",false,()->checkMedia());
        meter=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(100);column.addView(meter,new LinearLayout.LayoutParams(-1,dp(12)));
        add(demo?"음성 준비 "+availableQuestions+"개 · 회당 "+sample.length+"개 · 답변 후 7초간 말이 없으면 자동 진행":"최대 10분 · 음성·대화 기록은 수강 종료 후 30일까지 보관",12,sub);
        if(demo&&!ready)add("해당 직렬에 음성이 준비된 질문이 없습니다.",14,sub);

        button("면접 시작하기 →",true,()->{if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},10);else start();}).setEnabled(ready);
        button("내 면접 기록",false,()->{stopMic();camera.stop();cameraOn=false;recordPage=0;screen="records";render();});if(!ready)button("연결 상태 다시 확인",false,()->checkReady());
    }
    void live(){LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);TextView title=text("실전 모의면접",19,ink);heading.addView(title,new LinearLayout.LayoutParams(0,-2,1));Button replay=new Button(this);replay.setText("다시 듣기");replay.setTextSize(12);replay.setAllCaps(false);replay.setTextColor(teal);replay.setBackgroundColor(Color.TRANSPARENT);replay.setMinWidth(0);replay.setMinimumWidth(0);replay.setMinHeight(dp(48));replay.setEnabled(demo&&screen.equals("live"));replay.setOnClickListener(v->{if(!answering)speakQuestion();});heading.addView(replay,new LinearLayout.LayoutParams(-2,-2));column.addView(heading);timerView=text("0:00 / 10:00",12,sub);column.addView(timerView);FrameLayout stage=new FrameLayout(this);column.addView(stage,new LinearLayout.LayoutParams(-1,dp(180)));voiceOrb=new Orb(this);stage.addView(voiceOrb,new FrameLayout.LayoutParams(-1,-1));turnHint=text("",20,teal);turnHint.setGravity(Gravity.CENTER);turnHint.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);column.addView(turnHint);silenceBar=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);silenceBar.setMax(InterviewAnswerGate.SILENCE_MS);silenceBar.setProgressTintList(android.content.res.ColorStateList.valueOf(teal));silenceBar.setProgressBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(220,229,233)));silenceBar.setVisibility(View.INVISIBLE);column.addView(silenceBar,new LinearLayout.LayoutParams(-1,dp(6)));
        cameraBox=new FrameLayout(this);FrameLayout.LayoutParams cam=new FrameLayout.LayoutParams(dp(72),dp(96),Gravity.RIGHT|Gravity.TOP);stage.addView(cameraBox,cam);if(cameraOn)camera.attach(cameraBox);
        questionCounter=text("진행 질문 "+String.format(Locale.KOREA,"%02d",questionNo),11,teal);column.addView(questionCounter);questionView=text(question,22,ink);questionView.setGravity(Gravity.CENTER);column.addView(questionView);
        transcriptView=text("내 답변\n"+(demo?"실제 음성 인식은 API 연결 후 제공됩니다.":transcript),14,sub);transcriptView.setBackground(bg(Color.WHITE,18));transcriptView.setPadding(dp(16),dp(16),dp(16),dp(16));transcriptView.setVisibility(captions?View.VISIBLE:View.GONE);column.addView(transcriptView);
        answerButton=button(answering?"답변 확인 중…":"답변 완료 →",true,()->answer());answerButton.setEnabled(screen.equals("live")&&!answering);
        button(screen.equals("closing")?"종료·저장 중…":"면접 종료",false,()->confirmEnd()).setEnabled(screen.equals("live"));updateTurn(questionTalking);updateClock();
    }
    void start(){if(call!=null||screen.equals("connecting"))return;
        if(demo){loadPracticeQuestions();if(!ready){notice="해당 직렬에 음성이 준비된 질문이 없습니다.";render();return;}}
        if(demo&&freeReady&&!freeConsent){new AlertDialog.Builder(this).setTitle("무료 AI 테스트").setMessage("답변 음성이 PC 서버를 거쳐 Google Gemini로 전송됩니다. 무료 서비스의 제품 개선에 이용될 수 있으므로 개인정보 없는 테스트용 답변만 사용해주세요.").setNegativeButton("기기에서만 연습",(d,w)->{freeReady=false;start();}).setPositiveButton("동의하고 테스트",(d,w)->{freeConsent=true;start();}).show();return;}
        stopMic();questionNo=1;transcript="";spoken="";muted=false;answering=false;record=null;screen="connecting";notice="마이크와 AI 면접관을 연결하고 있습니다.";render();getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(demo){demoTurns=new JSONArray();runId=localStore.create();localCreated=System.currentTimeMillis();localSaved=false;question=sample[0];screen="live";startedAt=System.currentTimeMillis();notice="말씀이 끝나면 자동으로 넘어갑니다.";saveLocal(false);render();speakQuestion();tick();return;}
        call=new NativeInterviewCall(this,api,this);call.start();
    }
    public void ready(String id,String q){if(destroyed)return;runId=id;question=q;startedAt=System.currentTimeMillis();screen="live";notice="AI 면접관의 질문을 듣고 답해주세요.";render();tick();}
    public void event(JSONObject event){if(destroyed||!screen.equals("live"))return;String type=event.optString("type");if(type.equals("interview.question")){String next=event.optString("question");if(!next.equals(question)){question=next;questionNo++;questionCounter.setText(String.format(Locale.KOREA,"%02d",questionNo));spoken="";transcript="";questionView.setText(question);}}
        if(type.equals("session.input_transcript.delta"))transcript=tail(transcript+event.optString("delta"),4000);if(type.equals("session.output_transcript.delta"))spoken=tail(spoken+event.optString("delta"),2000);
        transcriptView.setText("내 답변\n"+(demo?"실제 음성 인식은 API 연결 후 제공됩니다.":transcript));
    }
    String tail(String s,int n){return s.length()>n?s.substring(s.length()-n):s;}
    void answer(){if(questionTalking||answering||!screen.equals("live"))return;if(muted){setNotice("마이크를 켠 뒤 답변해주세요.");return;}answering=true;answerButton.setEnabled(false);answerButton.setText("답변 확인 중…");
        if(demo){analyzePractice();return;}
        stopQuestionAudio();
        final NativeInterviewCall current=call;call.answer((d,e)->{if(destroyed||call!=current||!screen.equals("live"))return;answering=false;answerButton.setEnabled(true);answerButton.setText("답변 완료 →");setNotice(e!=null?"답변 처리 상태를 확인하지 못했습니다. 종료 후 기록을 확인해주세요.":d.optBoolean("waiting")?"아직 인식된 답변이 없습니다. 마이크를 확인해주세요.":"다음 질문을 듣고 답해주세요.");});
    }
    void tick(){if(!screen.equals("live")||destroyed)return;updateClock();if(System.currentTimeMillis()-startedAt>=600000){end();return;}ui.postDelayed(()->tick(),1000);}
    void updateClock(){if(timerView==null)return;long seconds=Math.min(600,Math.max(0,(System.currentTimeMillis()-startedAt)/1000));timerView.setText(String.format(Locale.KOREA,"%d:%02d / 10:00",seconds/60,seconds%60));}
    void confirmEnd(){new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.").setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,w)->end()).show();}
    void end(){if(screen.equals("closing"))return;if(demo)queuePracticeAnswer();else stopQuestionAudio();if(questionSpeech!=null)questionSpeech.stop();screen="closing";notice="마이크를 끄고 면접 기록을 저장하고 있습니다.";camera.stop();cameraOn=false;stopMic();render();if(demo){saveLocal(questionNo==sample.length);ended(runId,null);}else if(call!=null)call.stop(null);else ended(runId,"connection_lost");}
    public void ended(String id,String error){call=null;camera.stop();cameraOn=false;stopMic();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(destroyed)return;runId=id;screen="result";answering=false;notice=error==null?"면접을 종료했습니다. 기록을 확인해주세요.":"연결이 종료되었습니다. 저장 상태를 다시 확인해주세요.";render();if(!demo&&!runId.isEmpty())loadRecord(runId);}
    void loadRecord(String id){api.command("get",InterviewApi.json("runId",id),(d,e)->{if(destroyed||!screen.equals("result"))return;if(e==null)record=d;else setNotice("기록을 불러오지 못했습니다. 다시 확인해주세요.");render();});}
    void result(boolean details){
        add("면접 결과",25,ink);
        if(record==null)add("기록을 불러오는 중…",14,sub);
        else{
            JSONObject run=record.optJSONObject("run");JSONArray turns=run==null?null:run.optJSONArray("turns");
            int count=turns==null?0:turns.length();add("질문 "+count+"개",13,teal);
            if(demo)add(localSaved?"음성은 이 기기에 저장되었습니다.":"기록을 저장하지 못했습니다.",12,sub);
            if(run!=null&&run.optBoolean("recording_partial"))add("일부 음성 기록이 누락되었습니다.",12,sub);
            for(int i=0;i<count;i++){
                JSONObject t=turns.optJSONObject(i);if(t==null)continue;
                add((i+1)+". "+t.optString("question"),18,ink);
                if(!demo)add(t.optString("answer","인식된 답변 없음"),14,sub);
                else {final int number=t.optInt("number",i+1);long seconds=t.optLong("duration_ms")/1000;add(seconds+"초",12,sub);button("내 답변 듣기",false,()->playLocal(number));
                    if(!t.optString("answer").isEmpty())add(t.optString("answer"),14,ink);
                    JSONObject feedback=t.optJSONObject("analysis");if(feedback!=null){add("AI 연습 피드백",12,teal);add(feedback.optString("summary"),14,ink);if(!feedback.optString("strength").isEmpty())add(feedback.optString("strength"),14,sub);if(!feedback.optString("improvement").isEmpty())add(feedback.optString("improvement"),14,sub);}
                    else add(t.optBoolean("analysis_pending")?"AI 분석 중 · 녹음은 저장되었습니다.":t.has("analysis_error")?"AI 분석을 완료하지 못했습니다. 녹음은 보관되었습니다.":"AI 평가 미연결",12,sub);
                }
            }
            JSONObject files=record.optJSONObject("recordings");
            if(files!=null){
                if(!files.optString("input").isEmpty())button("내 답변 듣기",false,()->play(files.optString("input")));
                if(!files.optString("output").isEmpty())button("질문 듣기",false,()->play(files.optString("output")));
                button("재생 중지",false,()->stopPlayback());
            }
        }
        button("다시 연습하기",true,()->{screen="prep";checkReady();});
        button("내 면접 기록",false,()->{recordPage=0;screen="records";render();});if(!demo&&record==null)button("다시 불러오기",false,()->loadRecord(runId));
        if(demo)button("모의면접 메뉴",false,()->finish());
    }
    void renderResult(boolean details){render();}
    void records(){add("내 면접 기록",26,ink);button("면접 준비로",false,()->{screen="prep";checkReady();});if(demo){
        List<JSONObject> saved=localStore.list();if(saved.isEmpty())add("아직 저장된 기록이 없습니다.",14,sub);
        for(JSONObject item:saved){String id=item.optString("id"),mode=item.optString("mode");String title=mode.equals("job")?"전공 시험":mode.equals("personality")?"인성 연습":"실전 모의면접";
            String date=new java.text.SimpleDateFormat("MM.dd HH:mm",Locale.KOREA).format(new Date(item.optLong("created_at")));
            button(title+" · "+date,false,()->{stopPlayback();runId=id;practiceMode=mode;record=item;localSaved=true;screen="result";render();});
            button("기록 삭제",false,()->new AlertDialog.Builder(this).setTitle("기록을 삭제할까요?").setMessage("이 기기에 저장된 답변 음성도 삭제됩니다.").setNegativeButton("취소",null).setPositiveButton("삭제",(d,w)->{try{stopPlayback();localStore.delete(id);render();}catch(Exception error){setNotice("기록을 삭제하지 못했습니다.");}}).show());
        }button("모의면접 메뉴",false,()->finish());return;}
        final LinearLayout target=column;final int page=recordPage;api.command("list",InterviewApi.json("page",page),(d,e)->{if(destroyed||!screen.equals("records")||column!=target||page!=recordPage)return;if(e!=null){setNotice("기록을 불러오지 못했습니다.");button("다시 확인",false,()->render());return;}JSONArray runs=d.optJSONArray("runs");if(runs==null||runs.length()==0)add("저장된 면접 기록이 없습니다.",14,sub);else for(int i=0;i<runs.length();i++){JSONObject r=runs.optJSONObject(i);if(r==null)continue;button(r.optString("created_at")+" · 기록 보기",false,()->{runId=r.optString("id");record=null;screen="result";render();loadRecord(runId);});}if(page>0)button("이전 기록",false,()->{recordPage--;render();});if(d.optBoolean("hasMore"))button("다음 기록",false,()->{recordPage++;render();});});}
    void play(String url){stopPlayback();if(!url.startsWith("https://")){setNotice("재생 링크를 다시 확인해주세요.");return;}try{MediaPlayer p=playback=new MediaPlayer();p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(url);p.setOnPreparedListener(v->{if(playback==v)v.start();});p.setOnErrorListener((v,a,b)->{setNotice("음성을 재생하지 못했습니다. 기록을 다시 열어주세요.");stopPlayback();return true;});p.prepareAsync();}catch(Exception e){setNotice("음성을 재생하지 못했습니다.");stopPlayback();}}
    void stopPlayback(){if(playback!=null){playback.release();playback=null;}}
    void checkMedia(){if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},14);return;}if(!cameraOn)startCamera();testMic();}
    void startCamera(){try{camera.start(this,cameraBox);cameraOn=true;render();}catch(Exception e){camera.stop();cameraOn=false;setNotice("카메라를 열지 못했습니다. 카메라 없이도 면접할 수 있습니다.");}}
    void testMic(){
        stopMic();
        try{
            int size=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
            AudioRecord recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);
            if(recorder.getState()!=AudioRecord.STATE_INITIALIZED){recorder.release();throw new IllegalStateException();}
            InterviewMicLevel signal=new InterviewMicLevel();signal.calibrate();
            micCheck=recorder;micNoiseControl.attach(recorder.getAudioSessionId());recorder.startRecording();render();
            setNotice("1초만 조용히 기다려 주세요. 주변 소음을 확인합니다.");
            new Thread(()->{
                short[] samples=new short[1024];
                try{
                    while(micCheck==recorder){
                        int n=recorder.read(samples,0,samples.length);if(n<=0)break;
                        boolean calibrating=signal.calibrating();signal.sample(samples,n);
                        boolean calibrated=calibrating&&!signal.calibrating();
                        if(calibrated&&micCheck==recorder)micNoiseDb=signal.noiseDb();
                        int level=Math.round(signal.level()*100);
                        ui.post(()->{
                            if(micCheck!=recorder)return;
                            if(calibrated)setNotice("평소 목소리로 말해보세요. 음성은 저장·전송하지 않습니다.");
                            if(meter!=null)meter.setProgress(level);
                        });
                    }
                }catch(Exception ignored){}
            },"InterviewMicCheck").start();
            ui.postDelayed(()->{if(micCheck==recorder){stopMic();if(screen.equals("prep")){notice="마이크 확인이 끝났습니다.";render();}}},10000);
        }catch(Exception e){stopMic();setNotice("마이크 권한과 연결을 확인해주세요.");}
    }
    void stopMic(){AudioRecord r=micCheck;micCheck=null;if(r!=null){try{r.stop();}catch(Exception ignored){}micNoiseControl.close();r.release();}}
    void setNotice(String value){notice=value;if(status!=null&&!destroyed)status.setText(value);}
    void back(){if(screen.equals("live")){confirmEnd();return;}if(screen.equals("connecting")||screen.equals("closing")){setNotice("연결 종료를 확인하고 있습니다.");if(call!=null)call.stop(null);return;}finish();}
    @Override public void onBackPressed(){back();}
    @Override public void onRequestPermissionsResult(int code,String[] p,int[] grants){super.onRequestPermissionsResult(code,p,grants);if(destroyed)return;if(grants.length==0||grants[0]!=PackageManager.PERMISSION_GRANTED){setNotice("권한이 허용되지 않았습니다. 기기 설정에서 변경할 수 있습니다.");return;}if(!screen.equals("prep"))return;if(code==14){if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)checkMedia();else setNotice("카메라와 마이크 권한을 모두 허용해주세요.");return;}if(code==10)start();if(code==11)testMic();if(code==12)startCamera();}
    @Override protected void onRestart(){super.onRestart();if(screen.equals("prep"))render();}
    @Override protected void onStop(){super.onStop();if(demo&&screen.equals("live"))end();else stopQuestionAudio();if(questionSpeech!=null)questionSpeech.stop();camera.stop();cameraOn=false;stopMic();stopPlayback();if(call!=null)call.stop("backgrounded");}
    @Override protected void onDestroy(){destroyed=true;for(InterviewLiveCaptions captions:finishingCaptions)captions.close();finishingCaptions.clear();if(freeApi!=null)freeApi.close();if(answerTone!=null){answerTone.release();answerTone=null;}stopQuestionAudio();if(questionSpeech!=null){questionSpeech.stop();questionSpeech.shutdown();questionSpeech=null;}ui.removeCallbacksAndMessages(null);camera.stop();stopMic();stopPlayback();if(call!=null){NativeInterviewCall c=call;c.stop("closed");ui.postDelayed(()->api.clear(),22000);}else api.clear();super.onDestroy();}
    final class Orb extends View {final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);float amplitude=0;Orb(android.content.Context c){super(c);setContentDescription("AI 면접관");}protected void onDraw(Canvas c){amplitude+=(voiceLevel.level-amplitude)*0.3f;float x=getWidth()/2f,y=getHeight()/2f,r=dp(54)+dp(18)*amplitude;paint.setShader(null);paint.setColor(0x08087d72);c.drawCircle(x,y,r+dp(30),paint);c.drawCircle(x,y,r+dp(15),paint);paint.setShader(new RadialGradient(x-r/3,y-r/3,r*1.6f,new int[]{0xffffffff,0xffdcf7ff,0xff38b8ff,0xff0866df},null,Shader.TileMode.CLAMP));c.drawCircle(x,y,r,paint);if(screen.equals("live")&&!destroyed)postInvalidateDelayed(33);}}
}
