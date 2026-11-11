package com.ronpark.interview;

import android.Manifest;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.media.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;

/** Debug-only counterpart of iOS InterviewView. The server owns questions, voices and billing. */
public final class InterviewTestLiveActivity extends InterviewTestScreen implements NativeInterviewCall.Listener {
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final InterviewApi api=new InterviewApi(true);
    private final InterviewCamera camera=new InterviewCamera();
    private NativeInterviewCall call;
    private PracticeAvatar avatar;
    private FrameLayout cameraBox;
    private ProgressBar meter;
    private TextView status,questionView,progress,transcriptView,clock;
    private Button answerButton;
    private volatile AudioRecord mic;
    private MediaPlayer playback;
    private String screen="auth",notice="앱에 연결하고 있습니다.",run="",question="",transcript="";
    private boolean ready,unlimited,destroyed,cameraOn,answering,showCaptions=true,details,analysisLoading;
    private int questionNumber,page,requestGeneration;
    private long startedAt;
    private JSONObject record;
    private Integer remaining,used,limit;
    private final String interviewer=new String[]{"interviewer-woman","interviewer-man-1","interviewer-man-2"}[new Random().nextInt(3)];

    @Override public void onCreate(Bundle state){
        super.onCreate(state);api.interviewer=interviewer;
        String code=getIntent().getStringExtra("launchCode");getIntent().removeExtra("launchCode");
        render();if(!InterviewTestPolicy.code(code)){screen="error";notice="학생앱의 모의면접 메뉴에서 다시 열어주세요.";render();return;}
        api.exchange(code,(data,error)->{if(destroyed)return;if(error!=null){screen="error";notice="앱 연결이 만료되었습니다. 학생앱의 모의면접 메뉴에서 다시 열어주세요.";render();}else checkReady();});
    }
    private void render(){
        if(destroyed)return;if(avatar!=null){avatar.close();avatar=null;}
        beginLayout("모의면접");
        switch(screen){case "prep":prep();break;case "live":case "closing":live();break;case "result":result();break;case "records":records();break;default:title(screen.equals("auth")?"앱에 연결하고 있습니다.":screen.equals("connecting")?"AI 면접관 연결 중":"학생앱에서 모의면접을 다시 열어주세요.");}
        status=add(notice,13,teal);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    }
    private void prep(){
        add("BEFORE WE BEGIN",12,teal);title("편안하게 앉아 주세요.");add("질문은 한 번에 하나씩, 충분히 듣겠습니다.",14,sub);
        cameraBox=new FrameLayout(this);cameraBox.setBackground(bg(0xffdce5e9,20));LinearLayout.LayoutParams preview=new LinearLayout.LayoutParams(dp(216),dp(288));preview.gravity=Gravity.CENTER_HORIZONTAL;content.addView(cameraBox,preview);
        TextView placeholder=text("카메라 미리보기",14,sub);placeholder.setGravity(Gravity.CENTER);cameraBox.addView(placeholder,new FrameLayout.LayoutParams(-1,-1));if(cameraOn)camera.attach(cameraBox);
        button("카메라 및 마이크 확인",false,this::checkMedia);
        meter=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(100);meter.setContentDescription("마이크 입력 음량");content.addView(meter);
        add("메인 질문 2개 · 질문마다 꼬리질문 2개 · 총 6문답 · 최대 10분",14,ink);
        if(unlimited)add("테스트앱 · 이용 횟수 제한 없음",17,teal);
        else if(remaining!=null){add("오늘 남은 면접 "+remaining+"회",17,teal);add("하루 "+limit+"회 · 오늘 "+used+"회 사용",13,sub);}
        add("이어폰 사용을 권장합니다. 음성과 대화 기록은 수강 종료 후 30일까지 보관합니다. 확정 점수는 부여하지 않습니다.",12,sub);
        button("면접 시작하기 →",true,this::requestStart).setEnabled(ready);
        button("내 면접 기록",false,()->loadRecords(0));if(!ready)button("연결 다시 확인",false,this::checkReady);
    }
    private void checkReady(){
        stopPlayback();screen="prep";ready=false;notice="연결 상태를 확인하고 있습니다.";render();final int generation=++requestGeneration;
        api.command("ready",InterviewApi.json(),(data,error)->{
            if(destroyed||!screen.equals("prep")||generation!=requestGeneration)return;
            ready=error==null&&data.optBoolean("ready");unlimited=error==null&&data.optBoolean("unlimited");
            limit=error==null&&data.has("dailyLimit")?data.optInt("dailyLimit"):null;used=error==null&&data.has("usedToday")?data.optInt("usedToday"):null;remaining=error==null&&data.has("remainingToday")?data.optInt("remainingToday"):null;
            if(ready&&!unlimited&&(limit==null||used==null||remaining==null)){ready=false;notice="오늘 이용 가능 횟수를 확인하지 못했습니다. 연결 다시 확인을 눌러주세요.";}
            else notice=error!=null?"연결을 확인하지 못했습니다. 다시 시도해주세요.":ready?"마이크와 카메라를 확인한 뒤 면접을 시작해주세요.":InterviewTestPolicy.failure(data.optString("reason"));render();
        });
    }
    private void requestStart(){if(!ready||!screen.equals("prep")||call!=null)return;if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},81);return;}start();}
    private void start(){
        if(!ready||!screen.equals("prep")||call!=null)return;requestGeneration++;stopMic();stopPlayback();run="";record=null;questionNumber=1;transcript="";question="";answering=false;screen="connecting";notice="마이크와 AI 면접관을 연결하고 있습니다.";render();getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        call=new NativeInterviewCall(this,api,this);call.start();
    }
    @Override public void ready(String id,String first){if(destroyed)return;run=id;question=first;startedAt=SystemClock.elapsedRealtime();screen="live";notice="AI 면접관의 질문을 듣고 답해주세요.";render();if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)startCamera();tick();}
    private void live(){
        title("실전 모의면접");clock=add("0:00 / 10:00",12,sub);
        LinearLayout panes=new LinearLayout(this){@Override protected void onMeasure(int w,int h){int width=View.MeasureSpec.getSize(w);super.onMeasure(w,View.MeasureSpec.makeMeasureSpec(width*7/8,View.MeasureSpec.EXACTLY));}};
        content.addView(panes,new LinearLayout.LayoutParams(-1,-2));FrameLayout left=new FrameLayout(this);cameraBox=new FrameLayout(this);cameraBox.setBackgroundColor(0xffdce5e9);panes.addView(left,new LinearLayout.LayoutParams(0,-1,1));panes.addView(cameraBox,new LinearLayout.LayoutParams(0,-1,1));
        avatar=new PracticeAvatar(this,interviewer+".mp4");left.addView(avatar,new FrameLayout.LayoutParams(-1,-1));TextView label=text(" AI 면접관 ",12,ink);label.setBackgroundColor(0xddffffff);left.addView(label,new FrameLayout.LayoutParams(-2,-2,Gravity.TOP|Gravity.LEFT));
        if(cameraOn)camera.attach(cameraBox);else{Button enable=new Button(this);enable.setText("카메라 켜기");enable.setOnClickListener(v->{if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},83);else startCamera();});cameraBox.addView(enable,new FrameLayout.LayoutParams(-1,-2,Gravity.CENTER));}
        progress=add(InterviewTestPolicy.progress(questionNumber),12,teal);questionView=add(question,22,ink);questionView.setGravity(Gravity.CENTER);
        transcriptView=add("내 답변 · 실시간 자막\n"+transcript,15,ink);transcriptView.setVisibility(showCaptions?View.VISIBLE:View.GONE);transcriptView.setBackground(bg(0xffffffff,18));
        button(showCaptions?"자막 숨기기":"자막 보기",false,()->{showCaptions=!showCaptions;render();});
        answerButton=button(answering?"답변 확인 중…":"답변 완료 →",true,this::answer);answerButton.setEnabled(screen.equals("live")&&!answering);
        button(screen.equals("closing")?"종료·저장 중…":"면접 종료",false,this::confirmEnd).setEnabled(screen.equals("live"));updateClock();
    }
    @Override public void event(JSONObject event){
        if(destroyed||!screen.equals("live"))return;String type=event.optString("type");
        if(type.equals("interview.question")&&!event.optString("question").equals(question)){question=event.optString("question");questionNumber++;transcript="";questionView.setText(question);progress.setText(InterviewTestPolicy.progress(questionNumber));}
        if(type.equals("session.input_transcript.delta"))transcript=(transcript+event.optString("delta"));if(transcript.length()>4000)transcript=transcript.substring(transcript.length()-4000);transcriptView.setText("내 답변 · 실시간 자막\n"+transcript);
        // The question remains visible; interviewer speech subtitles stay hidden like iOS Debug.
    }
    private void answer(){if(call==null||!screen.equals("live")||answering)return;answering=true;answerButton.setEnabled(false);answerButton.setText("답변 확인 중…");NativeInterviewCall active=call;call.answer((data,error)->{if(destroyed||call!=active||!screen.equals("live"))return;answering=false;answerButton.setEnabled(true);answerButton.setText("답변 완료 →");setNotice(error!=null?"답변 처리 상태를 확인하지 못했습니다. 종료 후 기록을 확인해주세요.":data.optBoolean("waiting")?"아직 인식한 답변이 없습니다. 마이크를 확인해주세요.":"다음 질문을 듣고 답해주세요.");});}
    private void confirmEnd(){new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.").setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,w)->stop()).show();}
    private void stop(){if(call==null||screen.equals("closing"))return;screen="closing";notice="마이크를 끄고 면접 기록을 저장하고 있습니다.";stopHardware();render();call.stop(null);}
    @Override public void ended(String id,String error){
        boolean hadStarted=!id.isEmpty()&&id.equals(run);call=null;stopHardware();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(destroyed){api.clear();return;}answering=false;
        if(!hadStarted){run="";record=null;questionNumber=0;screen="prep";ready=InterviewTestPolicy.retryable(error);notice=InterviewTestPolicy.failure(error);render();return;}
        run=id;screen="result";notice=error==null?"면접이 종료되었습니다. 기록을 확인해주세요.":"연결이 종료되었습니다. 기록 저장 상태를 다시 확인해주세요.";render();loadRecord(id);
    }
    private void result(){
        add("INTERVIEW RECORD",12,teal);title("내 답변을 돌아보고,\n다음 연습을 준비해요.");add("실제 기록 기반 · 확정 채점 결과 아님",12,sub);
        button(details?"종합 보기":"질문별 기록",false,()->{details=!details;render();});JSONObject row=record==null?null:record.optJSONObject("run");JSONArray turns=row==null?null:row.optJSONArray("turns");
        if(record==null)add("기록을 확인하고 있습니다. 잠시 후 다시 확인해주세요.",14,sub);
        else if(details){
            if(row!=null&&row.optBoolean("recording_partial"))add("일부 음성 기록이 누락되었습니다.",13,sub);JSONObject files=record.optJSONObject("recordings");if(files!=null){for(String key:new String[]{"input","output"})if(!files.optString(key).isEmpty()){String url=files.optString(key);button(key.equals("input")?"학생 음성 재생":"면접관 음성 재생",false,()->play(url));}button("재생 중지",false,this::stopPlayback);}
            if(turns!=null)for(int i=0;i<turns.length();i++){JSONObject t=turns.optJSONObject(i);if(t==null)continue;add((i+1)+" · "+(t.optString("kind").equals("followup")?"꼬리 질문":"기본 질문"),12,teal);add(t.optString("question"),18,ink);add(t.optString("answer","인식한 답변 없음"),14,sub);}
        }else{
            int count=0;if(turns!=null)for(int i=0;i<turns.length();i++)if(turns.optJSONObject(i)!=null&&turns.optJSONObject(i).optBoolean("complete"))count++;add("완료한 답변 "+count+"개",20,teal);add("보관 종료: "+(row==null?"확인 중":row.optString("retain_until","확인 중")),12,sub);add("질문별 기록에서 답변과 녹음을 확인하세요.",14,sub);
            if(record.optBoolean("analysisEnabled"))analysis();
        }
        button("기록 다시 확인",false,()->loadRecord(run));button("다시 연습하기",true,this::checkReady);button("내 면접 기록",false,()->loadRecords(0));
    }
    private void analysis(){JSONObject processing=record.optJSONObject("processing"),report=processing==null?null:processing.optJSONObject("report"),feedback=report==null?null:report.optJSONObject("analysis");
        if(feedback!=null){add(feedback.optString("summary"),15,ink);for(String key:new String[]{"strengths","improvements","nextPractice"}){JSONArray rows=feedback.optJSONArray(key);if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null){add(row.optString("quote"),12,sub);add(row.optString("feedback"),14,ink);}}}add("저장된 전사에 근거한 연습 피드백이며 확정 성적이 아닙니다.",12,sub);}
        else if(processing!=null)add(processing.optString("state").equals("running")?"저장된 답변을 분석하고 있습니다. 기록 다시 확인으로 결과를 확인해주세요.":"분석 완료 여부를 확인해야 합니다. 자동으로 다시 실행하지 않습니다.",14,sub);
        else button(analysisLoading?"분석 중…":"종합 피드백 받기",false,()->{if(analysisLoading)return;analysisLoading=true;String id=run;api.command("analysis_request",InterviewApi.json("runId",id),(data,error)->{analysisLoading=false;if(destroyed||!run.equals(id)||record==null)return;if(error==null)try{record.put("processing",data.optJSONObject("processing"));}catch(Exception ignored){}else notice="분석 상태를 확인하지 못했습니다. 기록 다시 확인을 눌러주세요.";render();});}).setEnabled(!analysisLoading);
    }
    private void loadRecord(String id){stopPlayback();run=id;screen="result";final int generation=++requestGeneration;api.command("get",InterviewApi.json("runId",id),(data,error)->{if(destroyed||!screen.equals("result")||!run.equals(id)||generation!=requestGeneration)return;if(error==null)record=data;else notice="기록을 불러오지 못했습니다. 다시 확인해주세요.";render();});}
    private void loadRecords(int target){stopHardware();stopPlayback();page=target;screen="records";render();}
    private void records(){title("내 면접 기록");final LinearLayout target=content;final int requested=page,generation=++requestGeneration;api.command("list",InterviewApi.json("page",requested),(data,error)->{if(destroyed||!screen.equals("records")||target!=content||generation!=requestGeneration)return;if(error!=null){setNotice("기록을 불러오지 못했습니다.");return;}JSONArray rows=data.optJSONArray("runs");if(rows==null||rows.length()==0)add("저장된 면접 기록이 없습니다.",14,sub);else for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row==null)continue;String id=row.optString("id");button(row.optString("created_at")+" · 기록 보기",false,()->{record=null;loadRecord(id);render();});}if(requested>0)button("이전 기록",false,()->loadRecords(requested-1));if(data.optBoolean("hasMore"))button("다음 기록",false,()->loadRecords(requested+1));button("새로고침",false,()->loadRecords(page));button("면접 준비로",false,this::checkReady);});}
    private void play(String url){stopPlayback();if(!url.startsWith("https://")){setNotice("재생 링크를 다시 확인해주세요.");return;}try{MediaPlayer p=playback=new MediaPlayer();p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(url);p.setOnPreparedListener(v->{if(playback==v)v.start();});p.setOnErrorListener((v,a,b)->{stopPlayback();setNotice("음성을 재생하지 못했습니다.");return true;});p.prepareAsync();}catch(Exception e){stopPlayback();setNotice("음성을 재생하지 못했습니다.");}}
    private void stopPlayback(){if(playback!=null){playback.release();playback=null;}}
    private void tick(){if(destroyed||!screen.equals("live"))return;updateClock();if(SystemClock.elapsedRealtime()-startedAt>=600000){stop();return;}ui.postDelayed(this::tick,1000);}
    private void updateClock(){if(clock!=null){long seconds=Math.min(600,Math.max(0,(SystemClock.elapsedRealtime()-startedAt)/1000));clock.setText(String.format(Locale.KOREA,"%d:%02d / 10:00",seconds/60,seconds%60));}}
    private void checkMedia(){if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED||checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.CAMERA,Manifest.permission.RECORD_AUDIO},82);return;}startCamera();checkMic();}
    private void startCamera(){try{camera.start(this,cameraBox);cameraOn=true;}catch(Exception e){camera.stop();cameraOn=false;setNotice("카메라를 열지 못했습니다. 카메라 없이도 면접할 수 있습니다.");}}
    private void checkMic(){stopMic();try{AudioRecord active=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT)));mic=active;active.startRecording();InterviewMicLevel signal=new InterviewMicLevel();signal.calibrate();setNotice("1초만 조용히 기다려 주세요. 주변 소음을 확인합니다.");new Thread(()->{short[] pcm=new short[1024];try{while(mic==active){int n=active.read(pcm,0,pcm.length);if(n<=0)break;signal.sample(pcm,n);int level=Math.round(signal.level()*100);ui.post(()->{if(mic==active&&meter!=null)meter.setProgress(level);});}}catch(Exception ignored){}},"TestMicCheck").start();ui.postDelayed(()->{if(mic==active){stopMic();setNotice("마이크 확인이 끝났습니다.");}},10000);}catch(Exception e){stopMic();setNotice("마이크 권한과 연결을 확인해주세요.");}}
    private void stopMic(){AudioRecord active=mic;mic=null;if(active!=null){try{active.stop();}catch(Exception ignored){}active.release();}}
    private void stopHardware(){camera.stop();cameraOn=false;stopMic();if(avatar!=null){avatar.close();avatar=null;}}
    private void setNotice(String value){notice=value;if(status!=null&&!destroyed)status.setText(value);}
    @Override public void onBackPressed(){if(screen.equals("live")){confirmEnd();return;}if(call!=null){call.stop(null);return;}super.onBackPressed();}
    @Override public void onRequestPermissionsResult(int code,String[] p,int[] result){super.onRequestPermissionsResult(code,p,result);if(destroyed)return;if(code==81&&screen.equals("prep")){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)requestStart();else setNotice("설정에서 마이크 권한을 허용해주세요.");}if(code==82&&screen.equals("prep")&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)checkMedia();if(code==83&&screen.equals("live")&&checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)startCamera();}
    @Override protected void onStop(){stopHardware();stopPlayback();if(call!=null)call.stop("backgrounded");super.onStop();}
    @Override protected void onDestroy(){destroyed=true;requestGeneration++;ui.removeCallbacksAndMessages(null);stopHardware();stopPlayback();if(call!=null)call.stop("closed");else api.clear();super.onDestroy();}
}
