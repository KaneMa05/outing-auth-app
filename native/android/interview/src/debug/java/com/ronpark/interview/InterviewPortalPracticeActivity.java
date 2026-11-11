package com.ronpark.interview;

import android.Manifest;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.media.*;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Authenticated job/personality practice; same publication, filters and analysis API as iOS Debug. */
public final class InterviewPortalPracticeActivity extends InterviewTestScreen {
    private final Handler ui=new Handler(Looper.getMainLooper());
    private final PracticeCapture capture=new PracticeCapture();
    private InterviewPortalSession portal;
    private InterviewLocalStore store;
    private InterviewQuestionAudio audio;
    private String screen="prep",mode="job",track="",account="",field="",region="",notice="연습 화면을 불러오고 있습니다.",run="";
    private JSONArray bank=new JSONArray(),fields=new JSONArray(),turns=new JSONArray();
    private List<JSONObject> questions=new ArrayList<>();
    private JSONObject record;
    private int count=3,number,generation;
    private long created,started,reviewStarted;
    private boolean destroyed,loading,catalogLoaded,analysisReady,talking,answering,recordingReady,counting;
    private MediaPlayer player;
    private TextView status,hint,clock;
    private ProgressBar meter;
    private Button answerButton;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);String id=getIntent().getStringExtra("portalSession");getIntent().removeExtra("portalSession");portal=InterviewPortalSession.take(id);audio=new InterviewQuestionAudio(this);
        if(portal==null){notice="연결이 만료되었습니다. 돌아간 뒤 연습을 다시 열어주세요.";render();return;}mode=portal.mode;load(false);
    }
    private void load(boolean startAfter){
        if(portal==null||loading)return;loading=true;catalogLoaded=false;analysisReady=false;render();portal.bootstrap((data,error)->{
            if(destroyed)return;loading=false;
            if(error!=null){notice="연습 권한과 연결 상태를 확인해주세요.";render();return;}
            try{String next=data.getString("accountId");if(next.isEmpty()||!account.isEmpty()&&!account.equals(next))throw new IllegalStateException();account=next;track=data.getString("track");bank=data.getJSONArray("questions");fields=data.optJSONArray("fields");if(fields==null)fields=new JSONArray();
                StringBuilder scope=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(account.getBytes(StandardCharsets.UTF_8)))scope.append(String.format(Locale.ROOT,"%02x",b&255));store=new InterviewLocalStore(this,scope.toString());
                refreshQuestions();catalogLoaded=true;notice="녹음은 이 기기에 저장됩니다.";
                portal.analysis("status",InterviewApi.json("accountId",account),(result,err)->{if(destroyed)return;analysisReady=err==null&&result.optBoolean("ready");notice=analysisReady?"AI 연결됨":"음성 분석 연결을 확인해주세요.";render();if(startAfter&&analysisReady)requestStart();});
            }catch(Exception invalid){notice="연습 정보를 확인하지 못했습니다. 다시 열어주세요.";}render();
        });
    }
    private static boolean contains(JSONArray values,String value){if(values!=null)for(int i=0;i<values.length();i++)if(value.equals(values.optString(i)))return true;return false;}
    private List<JSONObject> eligible(boolean selection){List<JSONObject> result=new ArrayList<>();for(int i=0;i<bank.length();i++){JSONObject q=bank.optJSONObject(i);if(q==null)continue;JSONArray tracks=q.optJSONArray("tracks");boolean category=mode.equals("job")?q.optString("category").equals("job")&&contains(tracks,track):q.optString("category").equals("personality");if(!category)continue;if(selection&&(!field.isEmpty()&&!contains(q.optJSONArray("fieldIds"),field)||mode.equals("job")&&!region.isEmpty()&&!contains(q.optJSONArray("regions"),region)))continue;result.add(q);}return result;}
    private void refreshQuestions(){questions=eligible(true);Collections.shuffle(questions);if(questions.size()>count)questions=new ArrayList<>(questions.subList(0,count));}
    private void render(){
        if(destroyed)return;stopPlayback();beginLayout(mode.equals("job")?"직무(전공) 연습모드":"인성 연습모드");
        if(screen.equals("prep"))prep();else if(screen.equals("live"))live();else if(screen.equals("review"))review();else if(screen.equals("records"))records();else result();
        status=add(notice,13,teal);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
    }
    private void prep(){
        title("면접 준비");add("지원 직렬 · "+(track.isEmpty()?"확인 중":track),15,teal);
        if(portal==null){button("돌아가기",false,this::finish);return;}
        if(!catalogLoaded){
            add(loading?"승인된 문항 목록을 불러오고 있습니다.":"문항 목록을 불러오지 못했습니다. 로그인 상태와 연결을 확인한 뒤 다시 시도해주세요.",14,sub);
            button(loading?"불러오는 중…":"문항 목록 다시 불러오기",true,()->load(false)).setEnabled(!loading);
            if(store!=null)button("내 면접 기록",false,()->{screen="records";render();});
            return;
        }
        List<JSONObject> available=eligible(false);List<String> ids=new ArrayList<>(),labels=new ArrayList<>();ids.add("");labels.add("전체 분야");
        for(int i=0;i<fields.length();i++){JSONObject f=fields.optJSONObject(i);if(f==null)continue;String id=f.optString("id");boolean used=false;for(JSONObject q:available)if(contains(q.optJSONArray("fieldIds"),id))used=true;if(used&&(!mode.equals("job")||InterviewTestPolicy.fieldAllowed(id,track))){ids.add(id);labels.add(f.optString("label",id));}}
        String selected=ids.contains(field)?labels.get(ids.indexOf(field)):"전체 분야";
        button((mode.equals("job")?"내용 분야":"인성 분야")+" · "+selected+" ▾",false,()->new AlertDialog.Builder(this).setTitle("분야 선택").setItems(labels.toArray(new String[0]),(d,index)->{field=ids.get(index);refreshQuestions();render();}).show());
        if(mode.equals("job")){TreeSet<String> set=new TreeSet<>();for(JSONObject q:available){JSONArray regions=q.optJSONArray("regions");if(regions!=null)for(int i=0;i<regions.length();i++)set.add(regions.optString(i));}List<String> regions=new ArrayList<>();regions.add("");regions.addAll(set);String[] options=new String[regions.size()];for(int i=0;i<options.length;i++)options[i]=i==0?"전체 지역":regions.get(i);button("기출 지역 · "+(region.isEmpty()?"전체 지역":region)+" ▾",false,()->new AlertDialog.Builder(this).setTitle("기출 지역").setItems(options,(d,index)->{region=regions.get(index);refreshQuestions();render();}).show());}
        button("연습 문항 수 · "+count+"문항 ▾",false,()->new AlertDialog.Builder(this).setTitle("연습 문항 수").setItems(new String[]{"3문항","5문항","10문항","15문항","20문항"},(d,index)->{count=new int[]{3,5,10,15,20}[index];refreshQuestions();render();}).show());
        add("선택 조건 공개 승인 문항 "+eligible(true).size()+"개 · 이번 연습 "+questions.size()+"개",13,sub);
        if(questions.isEmpty()&&!loading)add("선택 조건에 맞는 공개 승인 문항이 없습니다. 분야나 지역을 변경해주세요.",14,sub);
        button(loading?"준비 중…":"연습 시작",true,()->load(true)).setEnabled(!loading&&!questions.isEmpty()&&analysisReady);
        button("음성 분석 연결 다시 확인",false,()->load(false));button("내 면접 기록",false,()->{screen="records";render();});
    }
    private void requestStart(){if(!screen.equals("prep")||!analysisReady||questions.isEmpty()||loading)return;if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},91);return;}begin();}
    private void begin(){
        if(!screen.equals("prep"))return;run=store.create();turns=new JSONArray();created=System.currentTimeMillis();number=1;record=InterviewApi.json("id",run,"mode",mode,"track",track,"created_at",created,"run",InterviewApi.json("turns",turns,"state","interrupted"));if(!save())return;
        screen="live";counting=true;talking=true;answering=false;recordingReady=false;notice="마이크 입력을 확인하고 있습니다.";int active=++generation;getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();
        capture.start(this,InterviewMicLevel.DEFAULT_NOISE_DB,ok->{if(destroyed||!screen.equals("live"))return;if(!ok){notice="마이크를 준비하지 못했습니다. 기록을 보존하고 종료합니다.";end(false);return;}if(active==generation)countdown(active,3);});
        ui.postDelayed(()->{if(active==generation&&counting&&screen.equals("live")){notice="마이크 입력을 확인하지 못했습니다. 다시 시작해주세요.";end(false);}},6000);
    }
    private void countdown(int active,int n){if(active!=generation||!screen.equals("live"))return;if(hint!=null)hint.setText(n==0?"질문을 준비하고 있습니다.":String.valueOf(n));if(n==0){counting=false;started=SystemClock.elapsedRealtime();speak();tick();return;}ui.postDelayed(()->countdown(active,n-1),1000);}
    private JSONObject current(){return number>0&&number<=questions.size()?questions.get(number-1):new JSONObject();}
    private void live(){
        title("질문 "+number+" / "+questions.size());clock=add("",12,sub);TextView prompt=add(current().optString("prompt"),22,ink);prompt.setGravity(Gravity.CENTER);
        hint=add(counting?"면접 준비 중":talking?"질문을 듣는 중":"이제 답변해 주세요",19,teal);hint.setGravity(Gravity.CENTER);meter=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);meter.setMax(100);meter.setContentDescription("내 답변 음성");content.addView(meter);
        button("다시 듣기",false,()->{if(!counting&&!answering)speak();});answerButton=button("답변 완료 →",true,this::answer);answerButton.setEnabled(!counting&&!talking&&recordingReady&&!answering);button("면접 종료",false,this::confirmEnd);
    }
    private void speak(){
        generation++;capture.finishAnswer();recordingReady=false;talking=true;stopPlayback();final int active=generation;updateTurn();
        player=audio.create(this,current().optString("prompt"));if(player==null){notice="이 질문에 연결된 음성파일이 없습니다. 화면의 질문을 읽고 답변해주세요.";if(status!=null)status.setText(notice);beginAnswer(active);return;}
        player.setOnCompletionListener(p->{if(active==generation){stopPlayback();beginAnswer(active);}});player.setOnErrorListener((p,a,b)->{if(active==generation){stopPlayback();beginAnswer(active);}return true;});player.start();
    }
    private void beginAnswer(int active){
        if(active!=generation||!screen.equals("live"))return;
        try{player=MediaPlayer.create(this,com.ronpark.interview.R.raw.interview_answer_cue);if(player!=null){player.setOnCompletionListener(p->{if(active==generation){stopPlayback();recordAnswer(active);}});player.start();return;}}catch(Exception ignored){}recordAnswer(active);
    }
    private void recordAnswer(int active){if(active!=generation||!screen.equals("live"))return;talking=false;capture.beginAnswer(store.audio(run,number),null,ok->{if(active!=generation||!screen.equals("live"))return;recordingReady=ok;updateTurn();if(ok)watch(active,new PracticeTiming(SystemClock.elapsedRealtime()));else{notice="답변 녹음을 시작하지 못했습니다.";end(false);}});updateTurn();}
    private void watch(int active,PracticeTiming timing){if(active!=generation||!screen.equals("live")||!recordingReady||answering)return;if(meter!=null)meter.setProgress(Math.round(capture.level*100));int state=timing.sample(SystemClock.elapsedRealtime(),capture.speaking);if(state==PracticeTiming.COMPLETE){answer();return;}ui.postDelayed(()->watch(active,timing),80);}
    private void updateTurn(){if(hint!=null)hint.setText(talking?"질문을 듣는 중":"이제 답변해 주세요");if(answerButton!=null){answerButton.setEnabled(!talking&&recordingReady&&!answering);answerButton.setText(talking?"질문을 듣고 답변해 주세요":"답변 완료 →");}}
    private void tick(){if(destroyed||!screen.equals("live"))return;long seconds=Math.max(0,(SystemClock.elapsedRealtime()-started)/1000),limit=Math.max(600,questions.size()*120);if(clock!=null)clock.setText(String.format(Locale.KOREA,"%d:%02d / %d:%02d",seconds/60,seconds%60,limit/60,limit%60));if(seconds>=limit){end(false);return;}ui.postDelayed(this::tick,1000);}
    private void answer(){if(!screen.equals("live")||talking||counting||!recordingReady||answering)return;answering=true;captureAnswer();if(mode.equals("job")){screen="review";reviewStarted=SystemClock.elapsedRealtime();render();}else next();}
    private void next(){if(number>=questions.size()){end(true);return;}if(reviewStarted>0){started+=SystemClock.elapsedRealtime()-reviewStarted;reviewStarted=0;}screen="live";number++;answering=false;recordingReady=false;render();speak();tick();}
    private void captureAnswer(){
        generation++;capture.finishAnswer();recordingReady=false;stopPlayback();if(number<1)return;for(int i=0;i<turns.length();i++)if(turns.optJSONObject(i).optInt("number")==number)return;
        File file=store.audio(run,number);if(!file.exists()||file.length()<=44)return;String analysisId=UUID.randomUUID().toString();JSONObject q=current();JSONObject turn=InterviewApi.json("number",number,"kind","initial","question",q.optString("prompt"),"questionId",q.optString("id"),"complete",true,"audio",file.getName(),"duration_ms",(file.length()-44)*1000/32000,"analysis_id",analysisId,"analysis_state","uploading");turns.put(turn);save();submit(run,number,turn,file);
    }
    private void submit(String id,int index,JSONObject turn,File file){
        if(file.length()>3000000){updateAnalysis(id,index,null,"audio_too_large");return;}
        try{byte[] bytes=new byte[(int)file.length()];try(DataInputStream in=new DataInputStream(new FileInputStream(file))){in.readFully(bytes);}JSONObject payload=InterviewApi.json("id",turn.getString("analysis_id"),"accountId",account,"mode",mode,"questionId",turn.getString("questionId"),"questionPrompt",turn.getString("question"),"audioBase64",Base64.encodeToString(bytes,Base64.NO_WRAP));
            portal.analysis("submit",payload,(data,error)->{updateAnalysis(id,index,data,error);if(error==null)poll(id,index,turn.optString("analysis_id"),0);});
        }catch(Exception e){updateAnalysis(id,index,null,"recording_unavailable");}
    }
    private void poll(String id,int index,String analysisId,int attempt){if(destroyed||attempt>=100)return;ui.postDelayed(()->{if(destroyed)return;try{store.load(id);}catch(Exception deleted){return;}portal.analysis("get",InterviewApi.json("accountId",account,"id",analysisId),(data,error)->{updateAnalysis(id,index,data,error);if(error==null&&Arrays.asList("uploading","queued","running").contains(data.optString("state")))poll(id,index,analysisId,attempt+1);});},3000);}
    private void updateAnalysis(String id,int index,JSONObject data,String error){
        try{JSONObject saved=store.load(id);JSONArray rows=saved.getJSONObject("run").getJSONArray("turns");for(int i=0;i<rows.length();i++){JSONObject turn=rows.getJSONObject(i);if(turn.optInt("number")!=index)continue;turn.put("analysis_state",error==null?data.optString("state","unknown"):"unknown");if(error!=null)turn.put("analysis_error",error);else{turn.remove("analysis_error");if(data.has("report"))turn.put("report",data.optJSONObject("report"));if(data.has("referenceAnswer"))turn.put("referenceAnswer",data.optString("referenceAnswer"));JSONObject report=data.optJSONObject("report");JSONArray texts=report==null?null:report.optJSONArray("transcripts");if(texts!=null)turn.put("answer",texts.optString(0));}}
            store.save(id,saved);if(run.equals(id)){record=saved;turns=rows;if(!destroyed&&(screen.equals("result")||screen.equals("review"))&&player==null)render();}
        }catch(Exception ignored){}
    }
    private void review(){title("답변 돌아보기");JSONObject turn=turns.optJSONObject(turns.length()-1);if(turn!=null){showTurn(turn);button("내 답변 듣기",false,()->play(store.audio(run,number)));}add("답변 점검하기\n핵심 내용을 설명했나요?\n실무 상황이나 적용 예시를 덧붙였나요?",14,sub);button(number>=questions.size()?"결과 보기":"다음 질문 →",true,this::next);button("면접 종료",false,this::confirmEnd);}
    private void result(){title("내 면접 기록");if(record!=null){JSONArray rows=record.optJSONObject("run").optJSONArray("turns");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject turn=rows.optJSONObject(i);if(turn==null)continue;showTurn(turn);int index=turn.optInt("number");button("내 답변 듣기",false,()->play(store.audio(run,index)));}button("분석 상태 다시 확인",false,this::refreshAnalysis);}button("다시 연습하기",true,()->{screen="prep";load(false);});button("내 면접 기록",false,()->{screen="records";render();});}
    private void showTurn(JSONObject turn){
        add(turn.optInt("number")+". "+turn.optString("question"),18,ink);
        if(!turn.optString("answer").isEmpty())add("나의 답변\n"+turn.optString("answer"),14,sub);
        if(!turn.optString("referenceAnswer").isEmpty())add("예시답변\n"+turn.optString("referenceAnswer"),14,sub);
        JSONObject report=turn.optJSONObject("report"),feedback=report==null?null:report.optJSONObject("analysis");
        if(feedback!=null){
            add(feedback.optString("summary"),15,ink);
            for(String key:new String[]{"strengths","improvements","nextPractice"}){JSONArray rows=feedback.optJSONArray(key);if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null)add(row.optString("feedback")+"\n나의 답변: “"+row.optString("quote")+"”",14,sub);}}
        }
        if(report!=null){
            JSONArray assessment=report.optJSONArray("assessment");
            if(assessment!=null)for(int i=0;i<assessment.length();i++){
                JSONObject a=assessment.optJSONObject(i);if(a==null)continue;String state=a.optString("status"),symbol=state.equals("O")?"○":state.equals("partial")?"△":state.equals("X")?"×":"—";
                add(symbol+" "+a.optString("label"),16,ink);add(a.optString("claim"),14,ink);add(a.optString("reason"),14,sub);if(!a.optString("quote").isEmpty())add("나의 답변: “"+a.optString("quote")+"”",12,sub);
            }
            if(mode.equals("job")&&report.optString("assessmentBasis").equals("unavailable"))add("예시답변이 없어 ○·△·× 판정을 보류했습니다.",13,sub);
            else if(feedback==null&&report.optString("status").equals("review_required"))add("답변을 명확하게 인식하지 못해 판정을 보류했습니다. 녹음을 확인해주세요.",13,sub);
        }
        if(!turn.optString("analysis_state").equals("completed"))add(Arrays.asList("uploading","queued","running").contains(turn.optString("analysis_state"))?"답변 분석 중… 녹음은 저장되었습니다.":"분석 상태를 확인해야 합니다. 자동으로 다시 실행하지 않습니다.",13,sub);
    }
    private void refreshAnalysis(){if(record==null)return;JSONArray rows=record.optJSONObject("run").optJSONArray("turns");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject turn=rows.optJSONObject(i);if(turn==null||turn.optString("analysis_id").isEmpty())continue;int index=turn.optInt("number");String id=run;portal.analysis("get",InterviewApi.json("accountId",account,"id",turn.optString("analysis_id")),(data,error)->updateAnalysis(id,index,data,error));}}
    private void records(){title("내 면접 기록");if(store==null){add("연결 정보를 먼저 확인해주세요.",14,sub);return;}List<JSONObject> saved=store.list();int count=0;for(JSONObject item:saved){if(!mode.equals(item.optString("mode")))continue;count++;String id=item.optString("id"),date=new java.text.SimpleDateFormat("MM.dd HH:mm",Locale.KOREA).format(new Date(item.optLong("created_at")));button(date+" · 기록 보기",false,()->{run=id;record=item;turns=item.optJSONObject("run").optJSONArray("turns");screen="result";render();refreshAnalysis();});button("기록 삭제",false,()->new AlertDialog.Builder(this).setTitle("기록을 삭제할까요?").setMessage("이 기기에 저장된 답변 음성도 삭제됩니다.").setNegativeButton("취소",null).setPositiveButton("삭제",(d,w)->{try{stopPlayback();store.delete(id);render();}catch(Exception e){notice="기록을 삭제하지 못했습니다.";render();}}).show());}if(count==0)add("아직 저장된 기록이 없습니다.",14,sub);button("면접 준비로",false,()->{screen="prep";load(false);});}
    private boolean save(){try{store.save(run,record);return true;}catch(Exception e){notice="기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요.";return false;}}
    private void confirmEnd(){new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("지금까지의 답변을 저장합니다.").setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,w)->end(false)).show();}
    private void end(boolean complete){if(!screen.equals("live")&&!screen.equals("review"))return;if(screen.equals("live")&&!counting)captureAnswer();generation++;capture.stop();stopPlayback();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);try{record.getJSONObject("run").put("state",complete?"completed":"interrupted");}catch(Exception ignored){}save();screen="result";counting=false;answering=false;notice="녹음은 이 기기에 저장되었습니다.";render();}
    private void play(File file){stopPlayback();try{player=new MediaPlayer();player.setDataSource(file.getAbsolutePath());player.setOnPreparedListener(MediaPlayer::start);player.setOnCompletionListener(p->stopPlayback());player.prepareAsync();}catch(Exception e){notice="저장된 음성을 재생하지 못했습니다.";render();}}
    private void stopPlayback(){if(player!=null){player.release();player=null;}}
    @Override public void onBackPressed(){if(screen.equals("live")||screen.equals("review"))confirmEnd();else super.onBackPressed();}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==91&&screen.equals("prep")&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)requestStart();}
    @Override protected void onStop(){if(screen.equals("live")||screen.equals("review"))end(false);stopPlayback();super.onStop();}
    @Override protected void onDestroy(){destroyed=true;generation++;ui.removeCallbacksAndMessages(null);capture.stop();stopPlayback();if(portal!=null)portal.close();super.onDestroy();}
}
