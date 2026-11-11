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
    private PracticeVoiceBars meter;
    private final InterviewVoiceLevel outputLevel=new InterviewVoiceLevel();
    private ImageView smallVoiceIcon;
    private TextView voiceCaption;
    private Button answerButton;
    private TextView questionText;
    private ImageView voiceIcon;
    private String renderedScreen="",activeRun="";
    private final Runnable ticker=this::tick;
    private final Set<String> polling=new HashSet<>();
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
                if(!field.isEmpty()){boolean valid=false;for(int i=0;i<fields.length();i++){JSONObject f=fields.optJSONObject(i);if(f!=null&&field.equals(f.optString("id"))&&(!mode.equals("job")||InterviewTestPolicy.fieldAllowed(field,track)))for(JSONObject q:eligible(false))if(contains(q.optJSONArray("fieldIds"),field))valid=true;}if(!valid)field="";}
                refreshQuestions();catalogLoaded=true;notice="녹음은 이 기기에 저장됩니다.";
                portal.analysis("status",InterviewApi.json("accountId",account),(result,err)->{if(destroyed)return;analysisReady=err==null&&result.optBoolean("ready");notice=analysisReady?"":"음성 분석 연결을 확인하지 못했습니다. 연결을 다시 확인해주세요.";render();if(startAfter&&analysisReady)requestStart();});
            }catch(Exception invalid){notice="연습 정보를 확인하지 못했습니다. 다시 열어주세요.";}render();
        });
    }
    private static boolean contains(JSONArray values,String value){if(values!=null)for(int i=0;i<values.length();i++)if(value.equals(values.optString(i)))return true;return false;}
    private List<JSONObject> eligible(boolean selection){List<JSONObject> result=new ArrayList<>();for(int i=0;i<bank.length();i++){JSONObject q=bank.optJSONObject(i);if(q==null)continue;JSONArray tracks=q.optJSONArray("tracks");boolean category=mode.equals("job")?q.optString("category").equals("job")&&contains(tracks,track):q.optString("category").equals("personality");if(!category)continue;if(selection&&(!field.isEmpty()&&!contains(q.optJSONArray("fieldIds"),field)||mode.equals("job")&&!region.isEmpty()&&!contains(q.optJSONArray("regions"),region)))continue;result.add(q);}return result;}
    private void refreshQuestions(){questions=eligible(true);Collections.shuffle(questions);if(questions.size()>count)questions=new ArrayList<>(questions.subList(0,count));}
    private void render(){
        if(destroyed)return;int oldY=screen.equals(renderedScreen)&&scroll!=null?scroll.getScrollY():0;renderedScreen=screen;stopPlayback();beginLayout("모의면접");
        LinearLayout heading=new LinearLayout(this);TextView modeName=text(mode.equals("job")?"직무(전공) 연습모드":"인성 연습모드",screen.equals("prep")?28:14,screen.equals("prep")?ink:teal);modeName.setTypeface(null,screen.equals("prep")?android.graphics.Typeface.BOLD:android.graphics.Typeface.NORMAL);modeName.setPadding(0,0,0,0);heading.addView(modeName,new LinearLayout.LayoutParams(0,-2,1));heading.addView(text(record!=null&&(screen.equals("result")||screen.equals("review"))?record.optString("track",track):track,14,teal));content.addView(heading);
        if(screen.equals("prep"))prep();else if(screen.equals("live"))live();else if(screen.equals("review"))review();else if(screen.equals("records"))records();else result();
        status=add(notice,13,teal);status.setVisibility(screen.equals("live")||loading||notice.isEmpty()?View.GONE:View.VISIBLE);status.setPadding(dp(14),dp(14),dp(14),dp(14));status.setBackground(bg(0x12087d72,14));status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);if(oldY>0)scroll.post(()->scroll.scrollTo(0,oldY));
    }
    private void prep(){
        if(portal==null){button("돌아가기",false,this::finish);return;}
        if(!catalogLoaded&&!loading){
            add(loading?"승인된 문항 목록을 불러오고 있습니다.":"문항 목록을 불러오지 못했습니다. 로그인 상태와 연결을 확인한 뒤 다시 시도해주세요.",14,sub);
            button(loading?"불러오는 중…":"문항 목록 다시 불러오기",true,()->load(false)).setEnabled(!loading);
            if(store!=null)button("내 면접 기록",false,()->{screen="records";render();});
            return;
        }
        List<JSONObject> available=eligible(false);List<String> ids=new ArrayList<>(),labels=new ArrayList<>();ids.add("");labels.add("전체 분야");
        for(int i=0;i<fields.length();i++){JSONObject f=fields.optJSONObject(i);if(f==null)continue;String id=f.optString("id");boolean used=false;for(JSONObject q:available)if(contains(q.optJSONArray("fieldIds"),id))used=true;if(used&&(!mode.equals("job")||InterviewTestPolicy.fieldAllowed(id,track))){ids.add(id);labels.add(f.optString("label",id));}}
        String selected=ids.contains(field)?labels.get(ids.indexOf(field)):"전체 분야";
        LinearLayout selections=new LinearLayout(this);LinearLayout.LayoutParams selectionLayout=new LinearLayout.LayoutParams(-1,-2);selectionLayout.topMargin=dp(18);content.addView(selections,selectionLayout);
        selections.addView(dropdown(mode.equals("job")?"내용 분야":"인성 분야",selected,anchor->choose(anchor,labels.toArray(new String[0]),Math.max(0,ids.indexOf(field)),index->{field=ids.get(index);refreshQuestions();render();}),!loading),new LinearLayout.LayoutParams(0,-2,1));
        if(mode.equals("job")){TreeSet<String> set=new TreeSet<>();for(JSONObject q:available){JSONArray regions=q.optJSONArray("regions");if(regions!=null)for(int i=0;i<regions.length();i++)set.add(regions.optString(i));}List<String> regions=new ArrayList<>();regions.add("");regions.addAll(set);String[] options=new String[regions.size()];for(int i=0;i<options.length;i++)options[i]=i==0?"전체 지역":regions.get(i);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);lp.leftMargin=dp(12);selections.addView(dropdown("기출 지역",region.isEmpty()?"전체 지역":region,anchor->choose(anchor,options,Math.max(0,regions.indexOf(region)),index->{region=regions.get(index);refreshQuestions();render();}),!loading),lp);}
        LinearLayout countChoice=dropdown("연습 문항 수",count+"문항",anchor->choose(anchor,new String[]{"3문항","5문항","10문항","15문항","20문항"},java.util.Arrays.binarySearch(new int[]{3,5,10,15,20},count),index->{count=new int[]{3,5,10,15,20}[index];refreshQuestions();render();}),!loading);LinearLayout.LayoutParams countLayout=new LinearLayout.LayoutParams(-1,-2);countLayout.topMargin=dp(18);content.addView(countChoice,countLayout);
        if(questions.isEmpty()&&!loading)add("선택 조건에 맞는 공개 승인 문항이 없습니다. 분야나 지역을 변경해주세요.",14,sub);
        button(loading?"준비 중…":"연습 시작",true,()->load(true)).setEnabled(!loading&&!questions.isEmpty()&&analysisReady);
        if(!analysisReady)button("음성 분석 연결 다시 확인",false,()->load(false));button("내 면접 기록",false,()->{screen="records";render();});
    }
    private void requestStart(){if(!screen.equals("prep")||!analysisReady||questions.isEmpty()||loading)return;if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},91);return;}begin();}
    private void begin(){
        if(!screen.equals("prep"))return;run=store.create();activeRun=run;turns=new JSONArray();created=System.currentTimeMillis();number=1;String fieldLabel="";for(int i=0;i<fields.length();i++){JSONObject selected=fields.optJSONObject(i);if(selected!=null&&field.equals(selected.optString("id")))fieldLabel=selected.optString("label");}record=InterviewApi.json("id",run,"mode",mode,"track",track,"created_at",created,"field",field,"field_label",fieldLabel,"region",region,"run",InterviewApi.json("turns",turns,"expected_questions",questions.size(),"state","interrupted"));if(!save())return;
        screen="live";counting=true;talking=true;answering=false;recordingReady=false;notice="마이크 입력을 확인하고 있습니다.";int active=++generation;getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);render();
        capture.start(this,InterviewMicLevel.DEFAULT_NOISE_DB,ok->{if(destroyed||!screen.equals("live"))return;if(!ok){notice="마이크를 준비하지 못했습니다. 기록을 보존하고 종료합니다.";end(false);return;}if(active==generation)countdown(active,3);});
        ui.postDelayed(()->{if(active==generation&&counting&&screen.equals("live")){notice="마이크 입력을 확인하지 못했습니다. 다시 시작해주세요.";end(false);}},6000);
    }
    private void countdown(int active,int n){if(active!=generation||!screen.equals("live"))return;if(hint!=null)hint.setText("잠시 후 첫 질문을 시작합니다.");if(questionText!=null){questionText.setTextSize(44);questionText.setText(n==0?"":String.valueOf(n));}if(n==0){counting=false;started=SystemClock.elapsedRealtime();speak();tick();return;}ui.postDelayed(()->countdown(active,n-1),1000);}
    private JSONObject current(){return number>0&&number<=questions.size()?questions.get(number-1):new JSONObject();}
    private void live(){
        LinearLayout heading=new LinearLayout(this);heading.setGravity(Gravity.CENTER_VERTICAL);TextView label=text("질문 "+number+" / "+questions.size(),18,ink);label.setTypeface(null,android.graphics.Typeface.BOLD);heading.addView(label,new LinearLayout.LayoutParams(0,-2,1));TextView replay=text("다시 듣기",14,teal);replay.setPadding(dp(12),dp(12),0,dp(12));replay.setEnabled(!counting&&!answering);replay.setOnClickListener(v->{if(!counting&&!answering)speak();});heading.addView(replay);content.addView(heading);
        long maximum=Math.max(600,questions.size()*120);clock=add(String.format(Locale.KOREA,"0:00 / %d:%02d",maximum/60,maximum%60),12,sub);LinearLayout original=content;LinearLayout voice=card();voice.setPadding(dp(28),dp(28),dp(28),dp(28));content=voice;
        voiceIcon=new ImageView(this);voiceIcon.setImageResource(talking?R.drawable.interview_speaker:R.drawable.interview_mic);voiceIcon.setContentDescription(talking?"질문 음성":"내 답변 음성");LinearLayout.LayoutParams icon=new LinearLayout.LayoutParams(dp(36),dp(36));icon.gravity=Gravity.CENTER_HORIZONTAL;content.addView(voiceIcon,icon);
        LinearLayout indicator=new LinearLayout(this);indicator.setGravity(Gravity.CENTER);smallVoiceIcon=new ImageView(this);smallVoiceIcon.setImageResource(talking?R.drawable.interview_speaker:R.drawable.interview_mic);indicator.addView(smallVoiceIcon,new LinearLayout.LayoutParams(dp(13),dp(13)));meter=new PracticeVoiceBars(this);meter.setContentDescription(counting?"면접 준비":talking?"면접관 질문 음성":"내 답변 음성");LinearLayout.LayoutParams bars=new LinearLayout.LayoutParams(dp(27),dp(24));bars.leftMargin=dp(8);indicator.addView(meter,bars);voiceCaption=text(counting?"준비":talking?"질문":"답변",11,teal);LinearLayout.LayoutParams caption=new LinearLayout.LayoutParams(-2,-2);caption.leftMargin=dp(8);indicator.addView(voiceCaption,caption);LinearLayout.LayoutParams row=new LinearLayout.LayoutParams(-1,dp(32));row.topMargin=dp(16);content.addView(indicator,row);content=original;
        hint=add(counting?"면접 준비 중":talking?"질문을 듣는 중":"이제 답변해 주세요",16,teal);hint.setGravity(Gravity.CENTER);
        questionText=add(counting?"":current().optString("prompt"),counting?44:22,ink);questionText.setTypeface(null,android.graphics.Typeface.BOLD);questionText.setGravity(Gravity.CENTER);
        answerButton=button(counting?"면접 준비 중":talking?"질문 듣는 중":"답변 완료 →",true,this::answer);answerButton.setEnabled(!counting&&!talking&&recordingReady&&!answering);button("면접 종료",false,this::confirmEnd);
    }
    private void speak(){
        generation++;capture.stop();recordingReady=false;talking=true;stopPlayback();final int active=generation;updateTurn();if(questionText!=null){questionText.setTextSize(22);questionText.setText(current().optString("prompt"));}
        capture.awaitStopped(stopped->{
            if(destroyed||active!=generation||!screen.equals("live"))return;
            if(!stopped){notice="마이크 종료를 확인하지 못했습니다. 면접을 종료한 뒤 다시 시도해주세요.";end(false);return;}
            player=audio.create(this,current().optString("id"),current().optString("prompt"));
            if(player==null){notice="이 질문에 연결된 음성파일이 없습니다. 화면의 질문을 읽고 답변해주세요.";add(notice,12,sub);beginAnswer(active);return;}
            player.setOnCompletionListener(p->{if(active==generation){stopPlayback();beginAnswer(active);}});player.setOnErrorListener((p,a,b)->{if(active==generation){stopPlayback();add("질문 음성을 재생하지 못했습니다. 화면의 질문을 확인해주세요.",12,sub);beginAnswer(active);}return true;});outputLevel.playback(player.getAudioSessionId());player.start();
        });
        animateVoice(active);
    }
    private void beginAnswer(int active){
        if(active!=generation||!screen.equals("live"))return;
        talking=true;recordingReady=false;if(hint!=null)hint.setText("마이크 준비 중…");
        capture.start(this,InterviewMicLevel.DEFAULT_NOISE_DB,ok->{if(destroyed||active!=generation||!screen.equals("live"))return;if(!ok){notice="마이크를 확인하지 못했습니다. 면접을 종료하고 다시 시도해주세요.";end(false);return;}recordAnswer(active);});
    }
    private void recordAnswer(int active){if(active!=generation||!screen.equals("live"))return;capture.beginAnswer(store.audio(run,number),null,ok->{if(active!=generation||!screen.equals("live"))return;if(!ok){notice="답변 녹음을 시작하지 못했습니다.";end(false);return;}Runnable ready=()->{if(active!=generation||!screen.equals("live"))return;stopPlayback();talking=false;recordingReady=true;updateTurn();watch(active,new PracticeTiming(SystemClock.elapsedRealtime()));};try{player=MediaPlayer.create(this,com.ronpark.interview.R.raw.interview_answer_cue);if(player!=null){player.setOnCompletionListener(p->ready.run());player.setOnErrorListener((p,a,b)->{ready.run();return true;});player.start();return;}}catch(Exception ignored){}ready.run();});}
    private void watch(int active,PracticeTiming timing){if(active!=generation||!screen.equals("live")||!recordingReady||answering)return;int state=timing.sample(SystemClock.elapsedRealtime(),capture.speaking);if(state==PracticeTiming.COMPLETE){answer();return;}ui.postDelayed(()->watch(active,timing),80);}
    private void animateVoice(int active){if(destroyed||active!=generation||!screen.equals("live"))return;if(meter!=null)meter.level(talking?outputLevel.level:capture.level);ui.postDelayed(()->animateVoice(active),80);}
    private void updateTurn(){if(hint!=null)hint.setText(talking?"질문을 듣는 중":"이제 답변해 주세요");if(voiceIcon!=null){voiceIcon.setImageResource(talking?R.drawable.interview_speaker:R.drawable.interview_mic);voiceIcon.setContentDescription(talking?"질문 음성":"내 답변 음성");}if(smallVoiceIcon!=null)smallVoiceIcon.setImageResource(talking?R.drawable.interview_speaker:R.drawable.interview_mic);if(voiceCaption!=null)voiceCaption.setText(talking?"질문":"답변");if(answerButton!=null){answerButton.setEnabled(!talking&&recordingReady&&!answering);answerButton.setText(talking?"질문 듣는 중":"답변 완료 →");}}
    private void tick(){if(destroyed||!screen.equals("live"))return;long seconds=Math.max(0,(SystemClock.elapsedRealtime()-started)/1000),limit=Math.max(600,questions.size()*120);if(clock!=null)clock.setText(String.format(Locale.KOREA,"%d:%02d / %d:%02d",seconds/60,seconds%60,limit/60,limit%60));if(seconds>=limit){end(false);return;}ui.postDelayed(ticker,1000);}
    private void answer(){if(!screen.equals("live")||talking||counting||!recordingReady||answering)return;answering=true;captureAnswer();if(mode.equals("job")){screen="review";reviewStarted=SystemClock.elapsedRealtime();ui.removeCallbacks(ticker);render();}else next();}
    private void next(){if(number>=questions.size()){end(true);return;}if(reviewStarted>0){started+=SystemClock.elapsedRealtime()-reviewStarted;reviewStarted=0;}screen="live";number++;answering=false;recordingReady=false;render();speak();ui.removeCallbacks(ticker);tick();}
    private void captureAnswer(){
        generation++;capture.finishAnswer();capture.stop();recordingReady=false;stopPlayback();if(number<1)return;for(int i=0;i<turns.length();i++)if(turns.optJSONObject(i).optInt("number")==number)return;
        File file=store.audio(run,number);if(!file.exists()||file.length()<=44)return;String analysisId=UUID.randomUUID().toString();JSONObject q=current();JSONObject turn=InterviewApi.json("number",number,"kind","initial","question",q.optString("prompt"),"questionId",q.optString("id"),"complete",true,"audio",file.getName(),"duration_ms",(file.length()-44)*1000/32000,"analysis_id",analysisId,"analysis_state","uploading");turns.put(turn);save();submit(run,number,turn,file);
    }
    private void submit(String id,int index,JSONObject turn,File file){
        if(file.length()>3000000){updateAnalysis(id,index,null,"audio_too_large");return;}
        try{byte[] bytes=new byte[(int)file.length()];try(DataInputStream in=new DataInputStream(new FileInputStream(file))){in.readFully(bytes);}JSONObject payload=InterviewApi.json("id",turn.getString("analysis_id"),"accountId",account,"mode",mode,"questionId",turn.getString("questionId"),"questionPrompt",turn.getString("question"),"audioBase64",Base64.encodeToString(bytes,Base64.NO_WRAP));
            portal.analysis("submit",payload,(data,error)->{updateAnalysis(id,index,data,error);if(error==null)poll(id,index,turn.optString("analysis_id"),0);});
        }catch(Exception e){updateAnalysis(id,index,null,"recording_unavailable");}
    }
    private void poll(String id,int index,String analysisId,int attempt){if(destroyed||!polling.add(analysisId))return;ui.postDelayed(()->{if(destroyed){polling.remove(analysisId);return;}try{store.load(id);}catch(Exception deleted){polling.remove(analysisId);return;}portal.analysis("get",InterviewApi.json("accountId",account,"id",analysisId),(data,error)->{polling.remove(analysisId);updateAnalysis(id,index,data,error);if(error==null&&Arrays.asList("uploading","queued","running").contains(data.optString("state")))poll(id,index,analysisId,attempt+1);});},2000);}
    private void updateAnalysis(String id,int index,JSONObject data,String error){
        try{JSONObject saved=store.load(id);JSONArray rows=saved.getJSONObject("run").getJSONArray("turns");for(int i=0;i<rows.length();i++){JSONObject turn=rows.getJSONObject(i);if(turn.optInt("number")!=index)continue;turn.put("analysis_state",error==null?data.optString("state","unknown"):"unknown");if(error!=null)turn.put("analysis_error",error);else{turn.remove("analysis_error");if(data.has("report"))turn.put("report",data.optJSONObject("report"));if(data.has("referenceAnswer"))turn.put("referenceAnswer",data.optString("referenceAnswer"));JSONObject report=data.optJSONObject("report");JSONArray texts=report==null?null:report.optJSONArray("transcripts");if(texts!=null)turn.put("answer",texts.optString(0));}}
            store.save(id,saved);if(run.equals(id)){record=saved;turns=rows;if(!destroyed&&(screen.equals("result")||screen.equals("review"))&&player==null)render();}
        }catch(Exception ignored){}
    }
    private void review(){
        title("답변 돌아보기");add("질문 "+number+" / "+questions.size(),12,teal);add(current().optString("prompt"),20,ink);
        JSONObject turn=turns.optJSONObject(turns.length()-1);
        if(turn!=null){add("답변 "+turn.optLong("duration_ms")/1000+"초",12,sub);button("내 답변 듣기",false,()->play(store.audio(run,number)));button("재생 중지",false,this::stopPlayback);if(!turn.optString("answer").isEmpty())disclosure("나의 답변",turn.optString("answer"));JSONObject report=turn.optJSONObject("report"),feedback=report==null?null:report.optJSONObject("analysis");if(feedback!=null){add("AI 연습 피드백",17,ink);add(feedback.optString("summary"),14,sub);showFeedback(feedback);}else add(Arrays.asList("uploading","queued","running").contains(turn.optString("analysis_state"))?"AI 분석 중 · 결과는 자동 저장됩니다.":"AI 분석 상태를 확인해주세요. 녹음은 저장됐습니다.",13,sub);}
        else add("저장된 답변이 없습니다. 마이크와 저장 공간을 확인해주세요.",14,sub);
        disclosure("답변 점검하기","질문의 핵심에 먼저 답했나요?\n전공 용어와 근거를 정확하게 설명했나요?\n실무 상황이나 적용 예시를 덧붙였나요?");
        button(number>=questions.size()?"연습 결과 보기":"다음 질문 →",true,this::next);button("연습 종료",false,this::confirmEnd);
    }
    private boolean completedRecord(){JSONObject row=record==null?null:record.optJSONObject("run");if(row==null||!row.optString("state").equals("completed"))return false;JSONArray rows=row.optJSONArray("turns");return rows!=null&&rows.length()>0&&(row.optInt("expected_questions",rows.length())==rows.length());}
    private void result(){
        title("면접 결과");if(mode.equals("job")&&run.equals(activeRun)&&!questions.isEmpty())button("같은 질문으로 다시 연습",false,()->{screen="prep";render();});
        if(record!=null){JSONObject saved=record.optJSONObject("run");JSONArray rows=saved==null?null:saved.optJSONArray("turns");add("질문 "+(rows==null?0:rows.length())+"개",14,teal);add("음성·영상은 이 기기에만 저장됩니다.",12,sub);
            boolean reconnect=false;if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject turn=rows.optJSONObject(i);if(turn==null)continue;LinearLayout original=content;content=card();showTurn(turn,completedRecord());content=original;if(turn.has("analysis_error"))reconnect=true;}
            button("재생 중지",false,this::stopPlayback);if(reconnect)button("연결 다시 확인",false,this::refreshAnalysis);
        }
        button("다시 연습하기",true,()->{screen="prep";load(false);});button("내 면접 기록",false,()->{screen="records";render();});button("면접 준비로",false,()->{stopPlayback();screen="prep";render();});
    }
    private void showFeedback(JSONObject feedback){for(String key:new String[]{"strengths","improvements","nextPractice"}){JSONArray rows=feedback.optJSONArray(key);if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject row=rows.optJSONObject(i);if(row!=null)add(row.optString("feedback")+"\n나의 답변: “"+row.optString("quote")+"”",14,sub);}}}
    private void showTurn(JSONObject turn,boolean completed){
        add(turn.optInt("number")+". "+turn.optString("question"),18,ink);
        add(turn.optLong("duration_ms")/1000+"초",12,sub);
        int index=turn.optInt("number");button("내 답변 듣기",false,()->play(store.audio(run,index)));
        if(!turn.optString("answer").isEmpty())disclosure("나의 답변",turn.optString("answer"));
        if(completed&&!turn.optString("referenceAnswer").isEmpty())disclosure("예시답변",turn.optString("referenceAnswer")+"\n\n학습 참고용 · 공식 정답이 아닙니다.");
        JSONObject report=turn.optJSONObject("report"),feedback=report==null?null:report.optJSONObject("analysis");
        if(report!=null){
            JSONArray assessment=report.optJSONArray("assessment");
            if(completed&&assessment!=null&&assessment.length()>0){
                boolean all=true,partial=false,uncertain=false;int confirmed=0;StringBuilder reasons=new StringBuilder();for(int i=0;i<assessment.length();i++){JSONObject a=assessment.optJSONObject(i);if(a==null){uncertain=true;continue;}String state=a.optString("status");boolean known=Arrays.asList("O","partial","X").contains(state);if(known)confirmed++;all&=state.equals("O");partial|=state.equals("O")||state.equals("partial");uncertain|=!known;String statusLabel=state.equals("O")?"충족":state.equals("partial")?"부분 충족":state.equals("X")?"미충족":"판정 보류";reasons.append(a.optString("label")).append(" · ").append(statusLabel).append('\n').append(a.optString("reason")).append('\n').append(a.optString("claim")).append('\n');if(!a.optString("quote").isEmpty())reasons.append("나의 답변: “").append(a.optString("quote")).append("”\n");reasons.append('\n');}
                boolean mixed=confirmed>0&&confirmed<assessment.length();String symbol=uncertain?"—":all?"○":partial?"△":"×",label=mixed?"일부 항목 확인":uncertain?"판정 보류":all?"충족":partial?"부분 충족":"미충족";int color=uncertain?sub:all?teal:partial?0xffff9500:0xffd93636;
                LinearLayout grade=new LinearLayout(this);grade.setGravity(Gravity.CENTER_VERTICAL);TextView mark=text(symbol,40,color);grade.addView(mark);LinearLayout summary=new LinearLayout(this);summary.setOrientation(LinearLayout.VERTICAL);summary.setPadding(dp(12),0,0,0);summary.addView(text(label,17,ink));summary.addView(text(mixed?"확인된 항목 "+confirmed+"/"+assessment.length()+" · 나머지 항목은 녹음 확인 필요":"답변 전체 · 예시답변 기준",12,sub));grade.addView(summary);grade.setContentDescription("practice.overall-grade."+turn.optInt("number"));content.addView(grade);disclosure("판정 근거",reasons.toString().trim());
            }
            if(mode.equals("job")&&report.optString("assessmentBasis").equals("unavailable"))add("예시답변이 없어 ○·△·× 판정을 보류했습니다.",13,sub);
            else if(feedback==null&&report.optString("status").equals("review_required"))add("답변을 명확하게 인식하지 못해 판정을 보류했습니다. 녹음을 확인해주세요.",13,sub);
        }
        if(Arrays.asList("uploading","queued","running").contains(turn.optString("analysis_state"))){LinearLayout pending=new LinearLayout(this);pending.setGravity(Gravity.CENTER_VERTICAL);pending.addView(new ProgressBar(this),new LinearLayout.LayoutParams(dp(20),dp(20)));TextView label=text("답변 분석 중…",14,sub);label.setPadding(dp(8),0,0,0);pending.addView(label);content.addView(pending);}
        else if(!turn.optString("analysis_state").equals("completed"))add("분석 상태를 확인해야 합니다. 자동으로 다시 실행하지 않습니다.",13,sub);
        if(feedback!=null){add("AI 연습 피드백",12,teal);add(feedback.optString("summary"),15,ink);showFeedback(feedback);}
    }
    private void refreshAnalysis(){if(record==null)return;JSONArray rows=record.optJSONObject("run").optJSONArray("turns");if(rows!=null)for(int i=0;i<rows.length();i++){JSONObject turn=rows.optJSONObject(i);if(turn==null||turn.optString("analysis_id").isEmpty())continue;int index=turn.optInt("number");String id=run;portal.analysis("get",InterviewApi.json("accountId",account,"id",turn.optString("analysis_id")),(data,error)->updateAnalysis(id,index,data,error));}}
    private void records(){
        title("내 면접 기록");button("면접 준비로",false,()->{screen="prep";load(false);});if(store==null){add("연결 정보를 먼저 확인해주세요.",14,sub);return;}
        List<JSONObject> saved=store.list();int count=0;
        for(JSONObject item:saved){if(!mode.equals(item.optString("mode")))continue;count++;String id=item.optString("id"),date=new java.text.SimpleDateFormat("yyyy. M. d. a h:mm",Locale.KOREA).format(new Date(item.optLong("created_at")));LinearLayout original=content;content=card();add(date,17,ink);JSONArray rows=item.optJSONObject("run").optJSONArray("turns");add(item.optString("track")+" · 질문 "+(rows==null?0:rows.length())+"개",12,sub);if(!item.optString("field_label").isEmpty())add(item.optString("field_label"),12,sub);if(!item.optString("region").isEmpty())add(item.optString("region"),12,sub);
            button("기록 보기",false,()->{run=id;record=item;turns=item.optJSONObject("run").optJSONArray("turns");screen="result";render();refreshAnalysis();});
            Button delete=button("기록 삭제",false,()->confirm("기록을 삭제할까요?","이 기기에 저장된 답변 음성과 영상도 삭제됩니다.","취소","삭제",()->{try{stopPlayback();store.delete(id);render();}catch(Exception e){notice="기록을 삭제하지 못했습니다.";render();}}));delete.setTextColor(0xffc73232);content=original;
        }
        if(count==0)add("아직 저장된 기록이 없습니다.",14,sub);
    }
    private boolean save(){try{store.save(run,record);return true;}catch(Exception e){notice="기록을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요.";return false;}}
    private void confirmEnd(){confirm("면접을 마칠까요?","마이크와 카메라를 끄고 지금까지의 답변을 저장합니다.","계속 면접하기","종료하고 기록 보기",()->end(false));}
    private void end(boolean complete){if(!screen.equals("live")&&!screen.equals("review"))return;if(screen.equals("live")&&!counting)captureAnswer();generation++;ui.removeCallbacks(ticker);capture.stop();stopPlayback();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);try{record.getJSONObject("run").put("state",complete&&turns.length()==questions.size()?"completed":"interrupted");}catch(Exception ignored){}save();screen="result";counting=false;answering=false;notice="녹음은 이 기기에 저장되었습니다.";render();}
    private void play(File file){stopPlayback();try{player=new MediaPlayer();player.setDataSource(file.getAbsolutePath());player.setOnPreparedListener(MediaPlayer::start);player.setOnCompletionListener(p->stopPlayback());player.prepareAsync();}catch(Exception e){notice="저장된 음성을 재생하지 못했습니다.";render();}}
    private void stopPlayback(){outputLevel.stop();if(player!=null){player.release();player=null;}}
    @Override public void onBackPressed(){if(screen.equals("live")||screen.equals("review"))confirmEnd();else super.onBackPressed();}
    @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==91&&screen.equals("prep")&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)requestStart();}
    @Override protected void onStop(){if(screen.equals("live")||screen.equals("review"))end(false);stopPlayback();super.onStop();}
    @Override protected void onResume(){super.onResume();if(store!=null&&record!=null&&(screen.equals("result")||screen.equals("review")))refreshAnalysis();}
    @Override protected void onDestroy(){destroyed=true;generation++;ui.removeCallbacksAndMessages(null);capture.stop();stopPlayback();if(portal!=null)portal.close();super.onDestroy();}
}
