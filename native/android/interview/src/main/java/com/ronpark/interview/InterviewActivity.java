package com.ronpark.interview;

import android.Manifest;
import android.app.*;
import android.content.pm.PackageManager;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;

/** Actual Android Views: no WebView, JavaScript renderer, or embedded HTML. */
public final class InterviewActivity extends Activity implements NativeInterviewCall.Listener {
    final int ink=Color.rgb(21,44,67),teal=Color.rgb(8,125,114),sub=Color.rgb(101,119,138),paper=Color.rgb(246,248,250);
    final Handler ui=new Handler(Looper.getMainLooper());final InterviewCamera camera=new InterviewCamera();
    InterviewApi api;NativeInterviewCall call;LinearLayout column;FrameLayout cameraBox;TextView status,questionView,questionCounter,transcriptView,timerView;Button answerButton,muteButton;ProgressBar meter;
    String screen="auth",question="",transcript="",spoken="",runId="",notice="연결 상태를 확인하고 있습니다.";boolean demo=false,destroyed=false,cameraOn=false,muted=false,answering=false,ready=false,captions=true;int questionNo=0,recordPage=0;long startedAt;
    volatile AudioRecord micCheck;MediaPlayer playback;JSONObject record;JSONArray demoTurns=new JSONArray();
    final String[] sample={"협업 중 의견 차이를 해결한 경험을 말씀해주세요.","그 과정에서 본인이 직접 맡은 역할은 무엇이었나요?","그 경험에서 배운 점을 말씀해주세요."};
    @Override public void onCreate(Bundle saved){super.onCreate(saved);api=new InterviewApi();demo=BuildConfig.DEBUG&&getIntent().getBooleanExtra("demo",false);getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->back());
        if(demo){ready=true;screen="prep";notice="무료 네이티브 시뮬레이션 · AI 음성과 실제 답변 인식은 사용하지 않습니다.";render();return;}
        Uri uri=getIntent().getData();String code=uri==null?null:uri.getQueryParameter("code");
        if(uri==null||!"ronpark-study".equals(uri.getScheme())||!"interview".equals(uri.getHost())||!"/start".equals(uri.getPath())||code==null||!code.matches("[A-Za-z0-9_-]{43}")){screen="error";notice="학생앱의 모의면접 메뉴에서 다시 열어주세요.";render();return;}
        // Remove the one-time code from the retained intent before network exchange.
        getIntent().setData(null);render();api.exchange(code,(d,e)->{if(destroyed)return;if(e!=null){screen="error";notice="앱 연결이 만료되었습니다. 학생앱에서 다시 열어주세요.";render();return;}screen="prep";checkReady();});
    }
    void checkReady(){if(demo){ready=true;screen="prep";render();return;}ready=false;notice="이용 가능 여부를 확인하고 있습니다.";render();api.command("ready",new JSONObject(),(d,e)->{if(destroyed)return;ready=e==null&&d.optBoolean("ready");notice=ready?"준비되면 면접을 시작해 주세요.":"면접 연결을 준비 중입니다. 수강 등록과 서버 연결 상태를 확인해주세요.";render();});}
    int dp(float n){return Math.round(n*getResources().getDisplayMetrics().density);}
    GradientDrawable bg(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    TextView text(String value,int size,int color){TextView v=new TextView(this);v.setText(value);v.setTextSize(size);v.setTextColor(color);v.setLineSpacing(dp(3),1);v.setPadding(0,dp(7),0,dp(7));return v;}
    void add(String value,int size,int color){column.addView(text(value,size,color));}
    Button button(String title,boolean primary,Runnable action){Button b=new Button(this);b.setText(title);b.setTextSize(14);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:teal);b.setBackground(bg(primary?teal:Color.WHITE,16));b.setMinHeight(dp(50));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(10);b.setLayoutParams(lp);b.setOnClickListener(v->action.run());column.addView(b);return b;}
    void render(){if(destroyed)return;stopPlayback();ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.setBackgroundColor(paper);column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);column.setPadding(dp(24),dp(20),dp(24),dp(32));scroll.addView(column);setContentView(scroll);
        scroll.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});scroll.requestApplyInsets();
        button("‹ 모의면접으로",false,()->back());
        if(demo)add("무료 테스트 · 가상 질문·답변 / Android 네이티브 화면",12,teal);
        if(screen.equals("prep"))prep();else if(screen.equals("live")||screen.equals("closing"))live();else if(screen.equals("result"))result(false);else if(screen.equals("records"))records();else add(screen.equals("auth")?"앱에 연결하고 있습니다.":"연결을 확인해주세요.",24,ink);
        status=text(notice,13,teal);status.setBackground(bg(Color.rgb(231,244,241),14));status.setPadding(dp(14),dp(14),dp(14),dp(14));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(16);column.addView(status,lp);
    }
    void prep(){add("BEFORE WE BEGIN",11,teal);add("편안하게 앉아 주세요.",27,ink);add("질문은 한 번에 하나씩, 충분히 듣겠습니다.",13,sub);
        cameraBox=new FrameLayout(this);cameraBox.setBackground(bg(Color.rgb(220,229,233),23));column.addView(cameraBox,new LinearLayout.LayoutParams(-1,dp(182)));TextView hint=text("카메라 미리보기\n영상은 전송·저장하지 않습니다.",14,sub);hint.setGravity(Gravity.CENTER);cameraBox.addView(hint,new FrameLayout.LayoutParams(-1,-1));if(cameraOn)camera.attach(cameraBox);
        button(cameraOn?"내 모습 함께 보기 · 켜짐":"내 모습 함께 보기 · 꺼짐",false,()->{if(cameraOn){camera.stop();cameraOn=false;render();}else if(checkSelfPermission(Manifest.permission.CAMERA)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.CAMERA},12);else startCamera();});
        button(micCheck==null?"마이크 확인":"마이크 확인 종료",false,()->{if(micCheck!=null){stopMic();render();return;}if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},11);else testMic();});
        meter=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(100);column.addView(meter,new LinearLayout.LayoutParams(-1,dp(12)));
        add("기본 질문 3개  ·  꼬리 질문 최대 2개씩  ·  최대 10분",14,ink);add("이어폰 사용을 권장합니다. 음성과 대화 기록은 수강 종료 후 30일까지 보관됩니다. 확정 점수는 부여하지 않습니다.",12,sub);
        button("면접 시작하기 →",true,()->{if(!demo&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},10);else start();}).setEnabled(ready);
        button("내 면접 기록",false,()->{stopMic();camera.stop();cameraOn=false;recordPage=0;screen="records";render();});if(!ready)button("연결 상태 다시 확인",false,()->checkReady());
    }
    void live(){add("실전 모의면접",19,ink);timerView=text("0:00 / 10:00",12,sub);column.addView(timerView);FrameLayout stage=new FrameLayout(this);column.addView(stage,new LinearLayout.LayoutParams(-1,dp(180)));stage.addView(new Orb(this),new FrameLayout.LayoutParams(-1,-1));
        cameraBox=new FrameLayout(this);FrameLayout.LayoutParams cam=new FrameLayout.LayoutParams(dp(72),dp(96),Gravity.RIGHT|Gravity.TOP);stage.addView(cameraBox,cam);if(cameraOn)camera.attach(cameraBox);
        questionCounter=text("진행 질문 "+String.format(Locale.KOREA,"%02d",questionNo),11,teal);column.addView(questionCounter);questionView=text(question,22,ink);questionView.setGravity(Gravity.CENTER);column.addView(questionView);
        transcriptView=text("면접관\n"+spoken+"\n\n내 답변 · 실시간 자막\n"+transcript,14,sub);transcriptView.setBackground(bg(Color.WHITE,18));transcriptView.setPadding(dp(16),dp(16),dp(16),dp(16));transcriptView.setVisibility(captions?View.VISIBLE:View.GONE);column.addView(transcriptView);
        muteButton=button(muted?"마이크 켜기":"마이크 끄기",false,()->{muted=!muted;if(call!=null)call.mute(muted);muteButton.setText(muted?"마이크 켜기":"마이크 끄기");setNotice(muted?"마이크를 꺼도 제한 시간은 계속 흐릅니다.":"천천히 답변해주세요.");});muteButton.setEnabled(screen.equals("live"));
        button(captions?"자막 숨기기":"자막 보기",false,()->{captions=!captions;render();});
        answerButton=button(answering?"답변 확인 중…":"답변 완료 →",true,()->answer());answerButton.setEnabled(screen.equals("live")&&!answering);
        button(screen.equals("closing")?"종료·저장 중…":"면접 종료",false,()->confirmEnd()).setEnabled(screen.equals("live"));updateClock();
    }
    void start(){if(call!=null||screen.equals("connecting"))return;stopMic();questionNo=1;transcript="";spoken="";muted=false;answering=false;record=null;screen="connecting";notice="마이크와 AI 면접관을 연결하고 있습니다.";render();getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(demo){demoTurns=new JSONArray();runId="demo";question=sample[0];screen="live";startedAt=System.currentTimeMillis();notice="가상 질문입니다. 답변 완료를 누르면 다음 질문으로 이동합니다.";render();tick();return;}
        call=new NativeInterviewCall(this,api,this);call.start();
    }
    public void ready(String id,String q){if(destroyed)return;runId=id;question=q;startedAt=System.currentTimeMillis();screen="live";notice="AI 면접관의 질문을 듣고 답해주세요.";render();tick();}
    public void event(JSONObject event){if(destroyed||!screen.equals("live"))return;String type=event.optString("type");if(type.equals("interview.question")){String next=event.optString("question");if(!next.equals(question)){question=next;questionNo++;questionCounter.setText(String.format(Locale.KOREA,"%02d",questionNo));spoken="";transcript="";questionView.setText(question);}}
        if(type.equals("session.input_transcript.delta"))transcript=tail(transcript+event.optString("delta"),4000);if(type.equals("session.output_transcript.delta"))spoken=tail(spoken+event.optString("delta"),2000);
        transcriptView.setText("면접관\n"+spoken+"\n\n내 답변 · 실시간 자막\n"+transcript);
    }
    String tail(String s,int n){return s.length()>n?s.substring(s.length()-n):s;}
    void answer(){if(answering||!screen.equals("live"))return;if(muted){setNotice("마이크를 켠 뒤 답변해주세요.");return;}answering=true;answerButton.setEnabled(false);answerButton.setText("답변 확인 중…");
        if(demo){demoTurns.put(InterviewApi.json("kind",questionNo==2?"followup":"initial","question",question,"answer","화면 확인용 가상 답변입니다. 의견을 듣고 역할을 조정했습니다.","complete",true));if(questionNo==3){end();return;}question=sample[questionNo++];spoken=question;transcript="";answering=false;render();return;}
        final NativeInterviewCall current=call;call.answer((d,e)->{if(destroyed||call!=current||!screen.equals("live"))return;answering=false;answerButton.setEnabled(true);answerButton.setText("답변 완료 →");setNotice(e!=null?"답변 처리 상태를 확인하지 못했습니다. 종료 후 기록을 확인해주세요.":d.optBoolean("waiting")?"아직 인식된 답변이 없습니다. 마이크를 확인해주세요.":"다음 질문을 듣고 답해주세요.");});
    }
    void tick(){if(!screen.equals("live")||destroyed)return;updateClock();if(System.currentTimeMillis()-startedAt>=600000){end();return;}ui.postDelayed(()->tick(),1000);}
    void updateClock(){if(timerView==null)return;long seconds=Math.min(600,Math.max(0,(System.currentTimeMillis()-startedAt)/1000));timerView.setText(String.format(Locale.KOREA,"%d:%02d / 10:00",seconds/60,seconds%60));}
    void confirmEnd(){new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.").setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,w)->end()).show();}
    void end(){if(screen.equals("closing"))return;screen="closing";notice="마이크를 끄고 면접 기록을 저장하고 있습니다.";camera.stop();cameraOn=false;stopMic();render();if(demo){record=InterviewApi.json("run",InterviewApi.json("turns",demoTurns,"state","completed","retain_until","테스트 데이터 · 앱 종료 시 초기화"));ended("demo",null);}else if(call!=null)call.stop(null);else ended(runId,"connection_lost");}
    public void ended(String id,String error){call=null;camera.stop();cameraOn=false;stopMic();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(destroyed)return;runId=id;screen="result";answering=false;notice=error==null?"면접을 종료했습니다. 기록을 확인해주세요.":"연결이 종료되었습니다. 저장 상태를 다시 확인해주세요.";render();if(!demo&&!runId.isEmpty())loadRecord(runId);}
    void loadRecord(String id){api.command("get",InterviewApi.json("runId",id),(d,e)->{if(destroyed||!screen.equals("result"))return;if(e==null)record=d;else setNotice("기록을 불러오지 못했습니다. 다시 확인해주세요.");render();});}
    void result(boolean details){add("INTERVIEW RECORD",11,teal);add("내 답변을 돌아보고,\n다음 연습을 준비해요.",26,ink);add("실제 기록 기반 · 확정 채점 결과 아님",13,sub);
        button(details?"종합 보기":"질문별 기록",false,()->{renderResult(!details);});
        if(record==null)add("기록을 확인하고 있습니다. 잠시 후 다시 확인해주세요.",14,sub);else{JSONObject run=record.optJSONObject("run");if(run==null)run=new JSONObject();JSONArray turns=run==null?new JSONArray():run.optJSONArray("turns");if(turns==null)turns=new JSONArray();if(details){if(run.optBoolean("recording_partial"))add("중단 후 복구된 음성으로 일부 구간이 누락될 수 있습니다.",13,sub);JSONObject files=record.optJSONObject("recordings");if(files!=null){button("학생 음성 재생",false,()->play(files.optString("input")));button("면접관 음성 재생",false,()->play(files.optString("output")));button("재생 중지",false,()->stopPlayback());}for(int i=0;i<turns.length();i++){JSONObject t=turns.optJSONObject(i);if(t==null)continue;add((i+1)+" · "+("followup".equals(t.optString("kind"))?"꼬리 질문":"기본 질문"),11,teal);add(t.optString("question"),18,ink);add(t.optString("answer","인식된 답변 없음"),14,sub);}}
            else{int count=0;for(int i=0;i<turns.length();i++)if(turns.optJSONObject(i).optBoolean("complete"))count++;add("완료한 답변 "+count+"개",20,teal);add("보관 종료: "+run.optString("retain_until"),12,sub);add("질문별 기록에서 답변과 원음을 확인하세요. 강점·보완점 자동 분석은 아직 제공하지 않습니다.",14,sub);}}
        if(!demo)button("기록 다시 확인",false,()->loadRecord(runId));button("다시 연습하기",true,()->{screen="prep";checkReady();});button("내 면접 기록",false,()->{recordPage=0;screen="records";render();});
    }
    void renderResult(boolean details){render();if(!details)return;column.removeAllViews();button("‹ 모의면접으로",false,()->back());result(true);status=text(notice,13,teal);column.addView(status);}
    void records(){add("내 면접 기록",26,ink);button("면접 준비로",false,()->{screen="prep";checkReady();});if(demo){add("무료 테스트 기록은 결과 화면에서만 확인할 수 있습니다.",14,sub);return;}
        final LinearLayout target=column;final int page=recordPage;api.command("list",InterviewApi.json("page",page),(d,e)->{if(destroyed||!screen.equals("records")||column!=target||page!=recordPage)return;if(e!=null){setNotice("기록을 불러오지 못했습니다.");button("다시 확인",false,()->render());return;}JSONArray runs=d.optJSONArray("runs");if(runs==null||runs.length()==0)add("저장된 면접 기록이 없습니다.",14,sub);else for(int i=0;i<runs.length();i++){JSONObject r=runs.optJSONObject(i);if(r==null)continue;button(r.optString("created_at")+" · 기록 보기",false,()->{runId=r.optString("id");record=null;screen="result";render();loadRecord(runId);});}if(page>0)button("이전 기록",false,()->{recordPage--;render();});if(d.optBoolean("hasMore"))button("다음 기록",false,()->{recordPage++;render();});});}
    void play(String url){stopPlayback();if(!url.startsWith("https://")){setNotice("재생 링크를 다시 확인해주세요.");return;}try{MediaPlayer p=playback=new MediaPlayer();p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(url);p.setOnPreparedListener(v->{if(playback==v)v.start();});p.setOnErrorListener((v,a,b)->{setNotice("음성을 재생하지 못했습니다. 기록을 다시 열어주세요.");stopPlayback();return true;});p.prepareAsync();}catch(Exception e){setNotice("음성을 재생하지 못했습니다.");stopPlayback();}}
    void stopPlayback(){if(playback!=null){playback.release();playback=null;}}
    void startCamera(){try{camera.start(this,cameraBox);cameraOn=true;render();}catch(Exception e){camera.stop();cameraOn=false;setNotice("카메라를 열지 못했습니다. 카메라 없이도 면접할 수 있습니다.");}}
    void testMic(){stopMic();try{int size=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));AudioRecord recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);if(recorder.getState()!=AudioRecord.STATE_INITIALIZED){recorder.release();throw new IllegalStateException();}micCheck=recorder;recorder.startRecording();render();setNotice("10초 동안 말해보세요. 음성은 저장하거나 전송하지 않습니다.");new Thread(()->{short[] bytes=new short[1024];try{while(micCheck==recorder){int n=recorder.read(bytes,0,bytes.length);if(n<=0)break;double sum=0;for(int i=0;i<n;i++)sum+=(double)bytes[i]*bytes[i];int level=(int)Math.min(100,Math.sqrt(sum/n)/32768*500);ui.post(()->{if(micCheck==recorder&&meter!=null)meter.setProgress(level);});}}catch(Exception ignored){}},"InterviewMicCheck").start();ui.postDelayed(()->{if(micCheck==recorder){stopMic();if(screen.equals("prep"))render();}},10000);}catch(Exception e){stopMic();setNotice("마이크 권한과 연결을 확인해주세요.");}}
    void stopMic(){AudioRecord r=micCheck;micCheck=null;if(r!=null){try{r.stop();}catch(Exception ignored){}r.release();}}
    void setNotice(String value){notice=value;if(status!=null&&!destroyed)status.setText(value);}
    void back(){if(screen.equals("live")){confirmEnd();return;}if(screen.equals("connecting")||screen.equals("closing")){setNotice("연결 종료를 확인하고 있습니다.");if(call!=null)call.stop(null);return;}finish();}
    @Override public void onBackPressed(){back();}
    @Override public void onRequestPermissionsResult(int code,String[] p,int[] grants){super.onRequestPermissionsResult(code,p,grants);if(destroyed)return;if(grants.length==0||grants[0]!=PackageManager.PERMISSION_GRANTED){setNotice("권한이 허용되지 않았습니다. 기기 설정에서 변경할 수 있습니다.");return;}if(!screen.equals("prep"))return;if(code==10)start();if(code==11)testMic();if(code==12)startCamera();}
    @Override protected void onRestart(){super.onRestart();if(screen.equals("prep"))render();}
    @Override protected void onStop(){super.onStop();camera.stop();cameraOn=false;stopMic();stopPlayback();if(call!=null)call.stop("backgrounded");else if(demo&&screen.equals("live"))end();}
    @Override protected void onDestroy(){destroyed=true;ui.removeCallbacksAndMessages(null);camera.stop();stopMic();stopPlayback();if(call!=null){NativeInterviewCall c=call;c.stop("closed");ui.postDelayed(()->api.clear(),22000);}else api.clear();super.onDestroy();}
    final class Orb extends View {final Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);Orb(android.content.Context c){super(c);setContentDescription("AI 면접관");}protected void onDraw(Canvas c){float x=getWidth()/2f,y=getHeight()/2f,r=dp(56);paint.setShader(null);paint.setColor(0x08087d72);c.drawCircle(x,y,r+dp(30),paint);c.drawCircle(x,y,r+dp(15),paint);paint.setShader(new RadialGradient(x-r/3,y-r/3,r*1.6f,new int[]{0xffd7fdf2,0xff8bd6c4,0xff36899a,0xff28465f},null,Shader.TileMode.CLAMP));c.drawCircle(x,y,r,paint);}}
}
