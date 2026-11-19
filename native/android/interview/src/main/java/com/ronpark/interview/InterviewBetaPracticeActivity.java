package com.ronpark.interview;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.*;
import android.net.Uri;
import android.os.*;
import android.speech.tts.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

/** Production job/personality practice, using the existing authenticated app session. */
public final class InterviewBetaPracticeActivity extends Activity {
    final int teal=Color.rgb(8,125,114),ink=Color.rgb(21,44,67),secondary=Color.rgb(101,119,138),paper=Color.rgb(246,248,250);
    final Handler ui=new Handler(Looper.getMainLooper());final ExecutorService io=Executors.newSingleThreadExecutor();
    InterviewPracticeApi api;final InterviewVoiceLevel voice=new InterviewVoiceLevel();
    NativePracticeInput inputActivity;NativePracticeVoiceBars voiceBars;ImageView voiceIcon;int countdown;NativeQuestionAudio preparedAudio;
    String page="loading",mode="job",account="",track="공채",field="",region="",notice="",runId="";
    boolean destroyed,foreground,confirmingEnd,loading=true,onlyFavorites,historyResult,recording,talking,syncPending,permissionPending;
    int count=3,index,generation;long started,lastSpeech;JSONObject current;SharedPreferences prefs;
    InterviewPracticeStore store;InterviewPracticeArchive archive;InterviewQuestionAudio clips;MediaPlayer questionAudio,answerAudio;TextToSpeech speech;boolean speechReady;
    final List<InterviewPracticeQuestion> bank=new ArrayList<>(),session=new ArrayList<>();final LinkedHashMap<String,String> fields=new LinkedHashMap<>();final Set<String> favorites=new HashSet<>();
    LinearLayout root,body;TextView liveQuestion,liveStatus,liveCount,liveTime;ProgressBar level;Button answer;
    Button playingButton;SeekBar playingSeek;TextView playingTime;int playingNumber=-1;boolean seeking,resumeAfterSeek,playbackReady;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);getWindow().setStatusBarColor(paper);getWindow().setNavigationBarColor(paper);
        if(Build.VERSION.SDK_INT>=34){overrideActivityTransition(OVERRIDE_TRANSITION_OPEN,R.anim.practice_slide_in,R.anim.practice_stay);overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE,R.anim.practice_stay,R.anim.practice_slide_out);}else overridePendingTransition(R.anim.practice_slide_in,R.anim.practice_stay);
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::back);
        Uri link=getIntent().getData();getIntent().setData(null);
        if(link==null||!NativePracticePolicy.launch(link.toString())){failEntry();return;}
        mode=link.getQueryParameter("mode");String code=link.getQueryParameter("code");api=new InterviewPracticeApi(mode);clips=new InterviewQuestionAudio(this);preparedAudio=new NativeQuestionAudio(this);render();
        io.execute(()->{try{JSONObject identity=api.exchange(code),catalog=api.bootstrap(mode);ui.post(()->{if(destroyed||isFinishing())return;try{account=identity.getString("accountId");setupStore();applyCatalog(catalog);loading=false;page="home";render();sync();}catch(Exception error){failEntry();}});}catch(Exception error){ui.post(this::failEntry);}});
    }
    void setupStore(){store=new InterviewPracticeStore(this,account);prefs=getSharedPreferences("interview-beta-"+InterviewPracticeStore.hash(account.getBytes(java.nio.charset.StandardCharsets.UTF_8)),MODE_PRIVATE);favorites.addAll(prefs.getStringSet("favorites",Collections.emptySet()));count=prefs.getInt("count-"+mode,3);if(!Arrays.asList(3,5,10,15,20).contains(count))count=3;
        archive=new InterviewPracticeArchive(store,api,pending->ui.post(()->{if(destroyed)return;syncPending=pending;if(page.equals("records"))render();}));}
    void applyCatalog(JSONObject data)throws Exception {
        if(!account.equals(data.optString("accountId"))||!mode.equals(data.optString("mode"))||!InterviewQuestionPolicy.validTrack(data.optString("track")))throw new IOException("account_changed");track=data.getString("track");bank.clear();fields.clear();
        JSONArray rows=data.getJSONArray("questions");Set<String> ids=new HashSet<>();for(int i=0;i<rows.length();i++){InterviewPracticeQuestion q=new InterviewPracticeQuestion(rows.getJSONObject(i));if(q.matches(mode,track,"","")&&ids.add(q.id))bank.add(q);}
        Set<String> used=new HashSet<>();for(InterviewPracticeQuestion q:bank)used.addAll(q.fields);JSONArray values=data.optJSONArray("fields");if(values!=null)for(int i=0;i<values.length();i++){JSONObject f=values.getJSONObject(i);String id=f.getString("id");if(used.contains(id)&&(!mode.equals("job")||InterviewPracticeQuestion.fieldAllowed(id,track)))fields.put(id,f.getString("label"));}
        if(!field.isEmpty()&&!fields.containsKey(field))field="";
    }
    void failEntry(){if(destroyed)return;loading=false;page="error";notice="면접반에 로그인한 뒤 연습 화면을 다시 열어주세요.";render();}
    void sync(){if(archive!=null)archive.schedule();}
    int dp(float x){return Math.round(x*getResources().getDisplayMetrics().density);}
    GradientDrawable background(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    TextView text(String label,int size,int color){TextView t=new TextView(this);t.setText(label);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(3),1);return t;}
    void label(LinearLayout parent,String value,int size,int color){TextView t=text(value,size,color);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(12);parent.addView(t,lp);}
    Button button(LinearLayout parent,String title,boolean primary,String id,Runnable click){Button b=new Button(this);b.setText(title);b.setAllCaps(false);b.setTextSize(16);b.setTextColor(primary?Color.WHITE:teal);b.setBackground(background(primary?teal:Color.WHITE,14));b.setMinHeight(dp(50));b.setTag(id);b.setContentDescription(title);b.setEnabled(!loading);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.topMargin=dp(10);parent.addView(b,lp);b.setOnClickListener(v->click.run());return b;}
    LinearLayout card(LinearLayout parent){LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);c.setPadding(dp(18),dp(18),dp(18),dp(18));c.setBackground(background(Color.WHITE,20));LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);lp.bottomMargin=dp(20);parent.addView(c,lp);return c;}
    String title(){return mode.equals("job")?"직무(전공) 연습모드":"인성 연습모드";}
    String fieldLabel(){return fields.containsKey(field)?fields.get(field):"전체 분야";}
    String summary(){return fieldLabel()+(mode.equals("job")&&!region.isEmpty()?" · "+region:"");}
    List<InterviewPracticeQuestion> eligible(){return InterviewPracticeQuestion.filter(bank,mode,track,field,region,favorites,false);}
    void render(){if(destroyed)return;stopPlayback();root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(paper);root.setPadding(dp(20),dp(8),dp(20),dp(16));setContentView(root);
        root.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(dp(20)+insets.getSystemWindowInsetLeft(),dp(8)+insets.getSystemWindowInsetTop(),dp(20)+insets.getSystemWindowInsetRight(),dp(16)+insets.getSystemWindowInsetBottom());return insets;});root.requestApplyInsets();
        LinearLayout nav=new LinearLayout(this);nav.setGravity(Gravity.CENTER_VERTICAL);Button back=new Button(this);back.setText(page.equals("home")||page.equals("entry")||page.equals("error")||page.equals("loading")?"닫기":"‹ 뒤로");back.setAllCaps(false);back.setTextColor(teal);back.setBackgroundColor(Color.TRANSPARENT);back.setTag("practice.back");back.setContentDescription(page.equals("home")||page.equals("entry")||page.equals("error")||page.equals("loading")?"닫기":"뒤로");back.setOnClickListener(v->back());nav.addView(back,new LinearLayout.LayoutParams(-2,dp(48)));TextView heading=text("모의면접",18,ink);heading.setGravity(Gravity.CENTER);nav.addView(heading,new LinearLayout.LayoutParams(0,-2,1));root.addView(nav);
        if(page.equals("catalog")){catalog();return;}
        ScrollView scroll=new ScrollView(this);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(0,dp(18),0,dp(20));scroll.addView(body);
        if(page.equals("entry"))entry();else if(page.equals("home"))home();else if(page.equals("settings"))settings();else if(page.equals("live"))live();else if(page.equals("review"))review();else if(page.equals("result"))result();else if(page.equals("records"))records();else{label(body,loading?"질문을 불러오는 중입니다.":notice,18,secondary);if(!loading)button(body,"돌아가기",true,"practice.portal",this::finish);}
        if(!notice.isEmpty()&&!page.equals("error")&&!page.equals("live")&&!page.equals("records"))label(body,notice,13,secondary);
    }
    void openPortal(){
        try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(InterviewApi.ORIGIN+"/interview?nativeInterview=1&nativePractice=1")));}
        catch(ActivityNotFoundException error){notice="면접반을 열 수 있는 브라우저 앱을 확인해주세요.";render();}
    }
    void entry(){
        label(body,"면접반 연습",26,ink);
        label(body,"로그인 후 분야별 질문과 즐겨찾기로 연습할 수 있습니다.",15,secondary);
        button(body,"로그인하고 연습하기",true,"practice.portal",this::openPortal);
    }
    void home(){label(body,"베타",11,teal);LinearLayout heading=new LinearLayout(this);TextView name=text(title(),27,ink);name.setTypeface(null,android.graphics.Typeface.BOLD);heading.addView(name,new LinearLayout.LayoutParams(0,-2,1));TextView trackName=text(track,14,teal);heading.addView(trackName);body.addView(heading);
        LinearLayout choices=new LinearLayout(this);choices.setPadding(0,dp(22),0,dp(10));body.addView(choices);
        selection(choices,mode.equals("job")?"내용 분야":"인성 분야",fieldLabel(),"practice.content-field",this::chooseField);
        if(mode.equals("job"))selection(choices,"기출 지역",region.isEmpty()?"전체 지역":region,"practice.region",this::chooseRegion);
        label(body,"연습 문항 수",12,secondary);button(body,count+"문항  ▾",false,"practice.count",this::chooseCount);
        label(body,"연습 시작 시 마이크 권한을 허용해주세요. 허용하기 전에는 면접이 시작되지 않습니다.",12,secondary);
        button(body,loading?"준비 중…":"연습 시작",true,"practice.quick-start",()->startSelected(InterviewPracticeQuestion.sample(eligible(),count))).setEnabled(!loading&&!eligible().isEmpty());
        LinearLayout menu=card(body);button(menu,"질문 골라 연습  ›",false,"practice.question-catalog",()->{onlyFavorites=false;page="catalog";notice="";render();});label(menu,"분야별 질문 · 즐겨찾기",12,secondary);

        button(menu,"내 면접 기록  ›",false,"practice.records",()->{page="records";notice="";render();sync();});
    }
    void selection(LinearLayout row,String title,String value,String id,Runnable selected){LinearLayout column=new LinearLayout(this);column.setOrientation(LinearLayout.VERTICAL);LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(0,-2,1);if(row.getChildCount()>0)lp.leftMargin=dp(12);row.addView(column,lp);label(column,title,12,secondary);button(column,value+"  ▾",false,id,selected).setEnabled(!loading);}
    void chooseCount(){new AlertDialog.Builder(this).setTitle("문항 수").setItems(new String[]{"3문항","5문항","10문항","15문항","20문항"},(d,n)->{count=new int[]{3,5,10,15,20}[n];prefs.edit().putInt("count-"+mode,count).apply();render();}).show();}
    void chooseField(){List<String> ids=new ArrayList<>(),labels=new ArrayList<>();ids.add("");labels.add("전체 분야");ids.addAll(fields.keySet());labels.addAll(fields.values());new AlertDialog.Builder(this).setTitle("분야").setItems(labels.toArray(new String[0]),(d,n)->{field=ids.get(n);render();}).show();}
    void chooseRegion(){TreeSet<String> available=new TreeSet<>();for(InterviewPracticeQuestion q:bank)available.addAll(q.regions);List<String> choices=new ArrayList<>();choices.add("전체 지역");choices.addAll(available);new AlertDialog.Builder(this).setTitle("기출 지역").setItems(choices.toArray(new String[0]),(d,n)->{region=n==0?"":choices.get(n);render();}).show();}
    void settings(){label(body,"연습 설정",25,ink);label(body,"분야",13,secondary);button(body,fieldLabel()+" ▾",false,"practice.content-field",this::chooseField);if(mode.equals("job")){label(body,"기출 지역",13,secondary);button(body,(region.isEmpty()?"전체 지역":region)+" ▾",false,"practice.region",this::chooseRegion);}
        label(body,"연습 문항 수",13,secondary);button(body,count+"문항 ▾",false,"practice.count",()->new AlertDialog.Builder(this).setTitle("문항 수").setItems(new String[]{"3문항","5문항","10문항","15문항","20문항"},(d,n)->{count=new int[]{3,5,10,15,20}[n];prefs.edit().putInt("count-"+mode,count).apply();render();}).show());if(eligible().isEmpty())label(body,"선택한 조건에 맞는 질문이 없습니다.",14,secondary);button(body,"이 설정으로 연습하기",true,"practice.start",()->startSelected(InterviewPracticeQuestion.sample(eligible(),count))).setEnabled(!loading&&!eligible().isEmpty());
    }
    void catalog(){
        final Map<String,InterviewPracticeProgress> progress=InterviewPracticeProgress.collect(store==null?Collections.emptyList():store.list(),mode,(id,number)->{try{File file=store.audio(id,number);return file.isFile()&&file.length()>44;}catch(Exception error){return false;}});
        label(root,"질문 골라 연습",24,ink);button(root,fieldLabel()+" ▾",false,"practice.catalog-field",this::chooseField);LinearLayout tabs=new LinearLayout(this);Button all=new Button(this),stars=new Button(this);all.setText("전체 질문");stars.setText("즐겨찾기");all.setTextColor(!onlyFavorites?teal:secondary);stars.setTextColor(onlyFavorites?teal:secondary);all.setOnClickListener(v->{onlyFavorites=false;render();});stars.setOnClickListener(v->{onlyFavorites=true;render();});tabs.addView(all,new LinearLayout.LayoutParams(0,dp(50),1));tabs.addView(stars,new LinearLayout.LayoutParams(0,dp(50),1));root.addView(tabs);
        List<InterviewPracticeQuestion> rows=InterviewPracticeQuestion.filter(bank,mode,track,field,region,favorites,onlyFavorites);label(root,"질문 "+rows.size()+"개"+(!region.isEmpty()?" · "+region:""),13,secondary);
        if(rows.isEmpty()){label(root,onlyFavorites?"별을 눌러 질문을 즐겨찾기에 저장해 보세요.":"선택한 조건에 맞는 질문이 없습니다.",15,secondary);return;}
        ListView list=new ListView(this);list.setDivider(null);root.addView(list,new LinearLayout.LayoutParams(-1,0,1));list.setAdapter(new BaseAdapter(){public int getCount(){return rows.size();}public Object getItem(int n){return rows.get(n);}public long getItemId(int n){return n;}public View getView(int n,View reused,ViewGroup parent){InterviewPracticeQuestion q=rows.get(n);LinearLayout holder=new LinearLayout(InterviewBetaPracticeActivity.this);holder.setOrientation(LinearLayout.VERTICAL);LinearLayout c=card(holder);LinearLayout heading=new LinearLayout(InterviewBetaPracticeActivity.this);heading.setBaselineAligned(false);TextView prompt=text(q.prompt,17,ink);heading.addView(prompt,new LinearLayout.LayoutParams(0,-2,1));Button favorite=new Button(InterviewBetaPracticeActivity.this);favorite.setText(favorites.contains(q.id)?"★":"☆");favorite.setTextColor(teal);favorite.setMinWidth(dp(48));favorite.setMinimumWidth(dp(48));favorite.setTag("practice.favorite."+q.id);favorite.setContentDescription(favorites.contains(q.id)?"즐겨찾기 해제":"즐겨찾기 추가");favorite.setOnClickListener(v->{if(!favorites.remove(q.id))favorites.add(q.id);prefs.edit().putStringSet("favorites",new HashSet<>(favorites)).apply();if(onlyFavorites)render();else notifyDataSetChanged();});heading.addView(favorite,new LinearLayout.LayoutParams(dp(52),dp(48)));c.addView(heading);InterviewPracticeProgress status=progress.get(q.id);if(status==null)status=new InterviewPracticeProgress();TextView completion=text(status.label(),13,status.count>0?teal:secondary);completion.setTag("practice.question-progress."+q.id);c.addView(completion);button(c,"이 질문 연습하기",false,"practice.question-start."+q.id,()->startSelected(Collections.singletonList(q)));return holder;}});
    }
    void startSelected(List<InterviewPracticeQuestion> selected){if(loading||selected.isEmpty())return;final int request=++generation;loading=true;notice="";render();io.execute(()->{try{JSONObject catalog=api.bootstrap(mode);ui.post(()->{if(destroyed||isFinishing()||!foreground||request!=generation)return;try{applyCatalog(catalog);session.clear();session.addAll(InterviewPracticeQuestion.selected(eligible(),selected));loading=false;if(session.isEmpty())throw new IOException();if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){permissionPending=true;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},71);}else begin();}catch(Exception error){loading=false;notice="질문이 변경되었거나 공개가 종료되었습니다. 다시 선택해주세요.";render();}});}catch(Exception error){ui.post(()->{if(destroyed||isFinishing()||!foreground||request!=generation)return;loading=false;notice="연습 권한과 연결 상태를 확인한 뒤 다시 시도해주세요.";render();});}});}
    void begin(){if(destroyed||isFinishing()||!foreground)return;int ticket=++generation;loading=true;notice="마이크를 확인하고 있습니다.";render();voice.microphone();waitForMicrophone(ticket,SystemClock.elapsedRealtime());}
    void waitForMicrophone(int ticket,long startedAt){if(destroyed||isFinishing()||!foreground||ticket!=generation)return;if(!voice.isRecording()||SystemClock.elapsedRealtime()-startedAt>=3000){voice.stop();loading=false;notice="사용 가능한 마이크가 없습니다. 연결과 권한을 확인해주세요.";render();return;}if(!voice.hasAudio()){ui.postDelayed(()->waitForMicrophone(ticket,startedAt),50);return;}voice.stop();loading=false;notice="";beginRun();}
    void beginRun(){if(destroyed||isFinishing()||!foreground)return;try{runId=UUID.randomUUID().toString();index=0;historyResult=false;current=InterviewApi.json("runId",runId,"mode",mode,"track",track,"fieldId",field,"fieldLabel",field.isEmpty()?"":fieldLabel(),"region",mode.equals("job")?region:"","recordedAt",new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.ROOT).format(new Date()),"questionCount",session.size(),"finished",false,"completed",false,"turns",new JSONArray());store.save(current);sync();page="live";started=SystemClock.elapsedRealtime();getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);countdown=3;render();countdown(generation,3);}catch(Exception error){page="home";notice="기록 저장 공간을 확인해주세요.";render();}}
    void countdown(int ticket,int n){if(destroyed||ticket!=generation||!page.equals("live"))return;countdown=n;if(n==0){liveQuestion.setText(session.get(index).prompt);speakQuestion();return;}liveStatus.setText("잠시 후 첫 질문을 시작합니다.");liveQuestion.setText(String.valueOf(n));ui.postDelayed(()->countdown(ticket,n-1),1000);}
    void live(){
        label(body,"베타",11,teal);liveCount=text("질문 "+(index+1)+" / "+session.size(),18,ink);body.addView(liveCount);liveTime=text("0:00",13,secondary);body.addView(liveTime);
        LinearLayout c=card(body);c.setPadding(dp(24),dp(28),dp(24),dp(28));voiceIcon=new ImageView(this);voiceIcon.setImageResource(R.drawable.interview_speaker);voiceIcon.setContentDescription("질문 음성");LinearLayout.LayoutParams icon=new LinearLayout.LayoutParams(dp(36),dp(36));icon.gravity=Gravity.CENTER;c.addView(voiceIcon,icon);
        voiceBars=new NativePracticeVoiceBars(this);voiceBars.setContentDescription("질문·답변 음성 크기");c.addView(voiceBars,new LinearLayout.LayoutParams(-1,dp(42)));
        liveStatus=text("질문을 듣는 중",16,teal);liveStatus.setGravity(Gravity.CENTER);c.addView(liveStatus);liveQuestion=text(session.get(index).prompt,24,ink);liveQuestion.setGravity(Gravity.CENTER);liveQuestion.setPadding(0,dp(24),0,dp(24));c.addView(liveQuestion);
        level=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);level.setMax(100);level.setVisibility(View.GONE);body.addView(level);
        answer=button(body,"답변 완료 →",true,"practice.answer",this::answer);answer.setEnabled(false);button(body,"질문 다시 듣기",false,"practice.replay",()->{if(countdown==0)speakQuestion();});button(body,"면접 종료",false,"practice.end",this::confirmEnd);
    }
    void review(){label(body,"답변 돌아보기",24,ink);label(body,session.get(index).prompt,19,ink);LinearLayout c=card(body);answerPlayer(c,index+1);button(body,index+1>=session.size()?"연습 결과 보기":"다음 질문 →",true,"practice.next",()->{if(index+1>=session.size()){endSession(true);return;}index++;page="live";render();speakQuestion();});button(body,"면접 종료",false,"practice.end",this::confirmEnd);}
    void stopQuestion(){generation++;recording=false;voice.stop();if(questionAudio!=null){questionAudio.release();questionAudio=null;}if(speech!=null)speech.stop();}
    void speakQuestion(){
        if(!page.equals("live")||destroyed||countdown>0)return;stopQuestion();talking=true;answer.setEnabled(false);liveStatus.setText("질문 음성 준비 중…");voiceIcon.setImageResource(R.drawable.interview_speaker);voiceIcon.setContentDescription("질문 음성");
        final int ticket=generation;final InterviewPracticeQuestion q=session.get(index);
        io.execute(()->{File file=null;try{file=preparedAudio.resolve(mode,q.id,q.prompt);}catch(Exception ignored){}final File recording=file;
            ui.post(()->{if(destroyed||ticket!=generation||!page.equals("live"))return;if(recording==null){speakText(ticket);return;}
                try{MediaPlayer player=new MediaPlayer();questionAudio=player;player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());player.setDataSource(recording.getAbsolutePath());
                    player.setOnPreparedListener(p->{if(ticket!=generation||destroyed)return;liveStatus.setText("질문을 듣는 중");p.start();voice.playback(p.getAudioSessionId());animateQuestion(ticket);});
                    player.setOnCompletionListener(p->{if(ticket==generation&&!destroyed){p.release();questionAudio=null;beginAnswer();}});
                    player.setOnErrorListener((p,a,b)->{if(ticket==generation&&!destroyed){p.release();questionAudio=null;speakText(ticket);}return true;});player.prepareAsync();
                }catch(Exception error){speakText(ticket);}
            });
        });
    }
    void animateQuestion(int ticket){if(destroyed||ticket!=generation||!page.equals("live")||!talking)return;voiceBars.level(voice.level);ui.postDelayed(()->animateQuestion(ticket),80);}
    void speakText(int ticket){
        if(destroyed||ticket!=generation||!page.equals("live"))return;liveStatus.setText("질문을 듣는 중");
        if(speech==null){speech=new TextToSpeech(this,result->ui.post(()->{if(destroyed||ticket!=generation||!page.equals("live"))return;if(result==TextToSpeech.SUCCESS){speechReady=speech.setLanguage(Locale.KOREAN)>=0;speech.setOnUtteranceProgressListener(new UtteranceProgressListener(){public void onStart(String id){}public void onDone(String id){ui.post(()->{if(id.equals("practice-"+generation)&&page.equals("live")&&!destroyed)beginAnswer();});}public void onError(String id){onDone(id);}});}if(speechReady)speakText(ticket);else beginAnswer();}));return;}
        if(!speechReady||speech.speak(session.get(index).prompt,TextToSpeech.QUEUE_FLUSH,null,"practice-"+ticket)==TextToSpeech.ERROR)beginAnswer();
    }
    void beginAnswer(){if(destroyed||!page.equals("live"))return;talking=false;recording=true;lastSpeech=SystemClock.elapsedRealtime();inputActivity=new NativePracticeInput(lastSpeech);voiceIcon.setImageResource(R.drawable.interview_mic);voiceIcon.setContentDescription("내 답변 음성");voice.microphone(store.audio(runId,index+1));if(!voice.isRecording()){recording=false;endSession(false);notice="마이크를 시작하지 못했습니다. 권한과 녹음 파일을 확인해주세요.";render();return;}answer.setEnabled(false);liveStatus.setText("마이크 준비 중…");watch(generation);}
    void watch(int ticket){if(destroyed||!page.equals("live")||ticket!=generation||!recording)return;long now=SystemClock.elapsedRealtime();if(confirmingEnd){inputActivity.resume(now);ui.postDelayed(()->watch(ticket),100);return;}
        if(!voice.isRecording()){notice="마이크 연결이 끊겨 면접을 중단했습니다.";endSession(false);return;}
        if(!voice.hasAudio()){ui.postDelayed(()->watch(ticket),100);return;}answer.setEnabled(true);
        boolean advance=inputActivity.sample(now,voice.speaking);long left=inputActivity.remaining(now);level.setProgress((int)(voice.level*100));voiceBars.level(voice.level);
        liveStatus.setText(!inputActivity.confirmed&&now-inputActivity.started>=8000?"마이크 입력이 확인되지 않습니다. 연결 상태를 확인하고 말씀해주세요.":voice.speaking?"답변을 듣는 중":inputActivity.confirmed?"다음 질문까지 "+((left+999)/1000)+"초":"이제 답변해 주세요");
        long elapsed=(now-started)/1000;liveTime.setText(String.format(Locale.KOREA,"%d:%02d",elapsed/60,elapsed%60));if(now-inputActivity.started>=120000||store.audio(runId,index+1).length()>=44L+120L*32000L){if(inputActivity.confirmed)answer();else{notice="마이크 입력이 확인되지 않아 면접을 중단했습니다.";endSession(false);}return;}if(advance){answer();return;}ui.postDelayed(()->watch(ticket),100);
    }
    boolean capture()throws Exception {boolean active=recording;stopQuestion();if(!active||current==null)return false;File file=store.audio(runId,index+1);double duration=NativePracticeRecording.duration(file);JSONArray turns=current.getJSONArray("turns");for(int i=0;i<turns.length();i++)if(turns.getJSONObject(i).getInt("number")==index+1)return true;InterviewPracticeQuestion q=session.get(index);JSONObject saved=new JSONObject(current.toString());saved.getJSONArray("turns").put(InterviewApi.json("number",index+1,"questionId",q.id,"question",q.prompt,"answer","","duration",duration));store.save(saved);current=saved;sync();return true;}
    void answer(){if(!page.equals("live")||talking||!recording)return;try{if(!capture())throw new IOException("recording_missing");if(mode.equals("job")){page="review";render();return;}if(index+1>=session.size()){endSession(true);return;}index++;render();speakQuestion();}catch(Exception error){notice="답변 녹음을 저장하지 못했습니다. 기기 저장 공간을 확인해주세요.";endSession(false);}}
    void confirmEnd(){
        if(confirmingEnd)return;confirmingEnd=true;
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("면접을 마칠까요?").setMessage("지금까지의 답변을 저장합니다.")
            .setNegativeButton("계속 면접하기",null).setPositiveButton("종료하고 기록 보기",(d,n)->endSession(false)).create();
        dialog.setOnDismissListener(d->{confirmingEnd=false;lastSpeech=SystemClock.elapsedRealtime();});dialog.show();
    }
    void endSession(boolean completed){try{capture();if(current!=null){current.put("finished",true).put("completed",completed&&current.getJSONArray("turns").length()==session.size());store.save(current);sync();}}catch(Exception error){notice="답변을 저장하지 못했습니다. 저장 공간을 확인해주세요.";}stopQuestion();getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);page="result";historyResult=false;render();}
    void result(){label(body,"면접 결과",25,ink);if(current==null)return;JSONArray turns=current.optJSONArray("turns");label(body,"질문 "+(turns==null?0:turns.length())+"개",14,teal);if(turns!=null)for(int i=0;i<turns.length();i++){JSONObject turn=turns.optJSONObject(i);if(turn==null)continue;LinearLayout c=card(body);label(c,turn.optInt("number")+". "+turn.optString("question"),18,ink);label(c,(int)turn.optDouble("duration")+"초",13,secondary);answerPlayer(c,turn.optInt("number"));}
        if(!historyResult&&!session.isEmpty())button(body,"같은 질문으로 다시 연습",false,"practice.repeat",()->{page="home";startSelected(new ArrayList<>(session));});button(body,"다시 연습하기",true,"practice.again",()->{page="home";notice="";render();});button(body,"내 면접 기록",false,"practice.records",()->{page="records";render();});button(body,"연습 홈으로",false,"practice.home",()->{page="home";notice="";render();});}
    void answerPlayer(LinearLayout c,int number){File file=store.audio(runId,number);TextView time=text("0:00",12,secondary);SeekBar seek=new SeekBar(this);seek.setTag("practice.playback.seek."+number);seek.setContentDescription("답변 재생 위치");Button play=button(c,"내 답변 듣기",false,"practice.playback."+number,()->{try{if(answerAudio!=null&&playingNumber==number){if(!playbackReady)return;if(answerAudio.isPlaying()){answerAudio.pause();playingButton.setText("이어 듣기");}else {answerAudio.start();playingButton.setText("일시정지");}return;}stopPlayback();if(!file.isFile())throw new IOException();playingButton=(Button)c.findViewWithTag("practice.playback."+number);playingButton.setEnabled(false);playbackReady=false;MediaPlayer p=new MediaPlayer();answerAudio=p;playingNumber=number;playingSeek=seek;playingTime=time;p.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());p.setDataSource(file.getAbsolutePath());p.setOnPreparedListener(v->{if(answerAudio!=v)return;playingButton=(Button)c.findViewWithTag("practice.playback."+number);playbackReady=true;if(playingButton!=null){playingButton.setEnabled(true);playingButton.setText("일시정지");}seek.setMax(v.getDuration());v.start();updatePlayback(v);});p.setOnCompletionListener(v->{if(answerAudio==v&&playingButton!=null)playingButton.setText("다시 듣기");});p.setOnErrorListener((v,a,b)->{if(answerAudio==v){time.setText("녹음을 재생하지 못했습니다.");stopPlayback();}return true;});p.prepareAsync();}catch(Exception error){stopPlayback();time.setText("저장된 녹음을 확인해주세요.");}});c.addView(seek);c.addView(time);seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){public void onProgressChanged(SeekBar s,int value,boolean user){if(user&&answerAudio!=null&&playingNumber==number)answerAudio.seekTo(value);}public void onStartTrackingTouch(SeekBar s){if(playbackReady&&answerAudio!=null&&playingNumber==number){seeking=true;resumeAfterSeek=answerAudio.isPlaying();answerAudio.pause();}}public void onStopTrackingTouch(SeekBar s){seeking=false;if(playbackReady&&answerAudio!=null&&playingNumber==number&&resumeAfterSeek)answerAudio.start();}});}
    void updatePlayback(MediaPlayer p){if(destroyed||p!=answerAudio)return;try{if(!seeking){playingSeek.setProgress(p.getCurrentPosition());playingTime.setText(clock(p.getCurrentPosition())+" / "+clock(p.getDuration()));}}catch(Exception ignored){}ui.postDelayed(()->updatePlayback(p),200);}
    String clock(int ms){int s=Math.max(0,ms/1000);return String.format(Locale.KOREA,"%d:%02d",s/60,s%60);}
    void stopPlayback(){if(answerAudio!=null){answerAudio.release();answerAudio=null;}if(playingButton!=null){playingButton.setEnabled(true);playingButton.setText("내 답변 듣기");}playingButton=null;playingNumber=-1;playbackReady=false;seeking=false;resumeAfterSeek=false;}
    String recordDate(String raw){String value=raw.replace('T',' ');return value.length()>16?value.substring(0,16):value;}
    void records(){label(body,"내 면접 기록",25,ink);button(body,"기존 웹 기록 보기",false,"practice.web-records",this::webRecords);if(syncPending)label(body,"관리자 전송 대기 중 · 연습 화면을 다시 열면 자동으로 재시도합니다.",12,secondary);List<JSONObject> rows=store==null?Collections.emptyList():store.list();int shown=0;for(JSONObject saved:rows){if(!mode.equals(saved.optString("mode")))continue;shown++;LinearLayout c=card(body);label(c,recordDate(saved.optString("recordedAt")),15,ink);label(c,saved.optString("fieldLabel","전체 분야")+" · 질문 "+saved.optInt("questionCount")+"개",13,secondary);button(c,"기록 보기",false,"practice.record-open."+saved.optString("runId"),()->{current=saved;runId=saved.optString("runId");historyResult=true;page="result";render();});button(c,"기록 삭제",false,"practice.record-delete",()->new AlertDialog.Builder(this).setTitle("기기 기록을 삭제할까요?").setMessage("관리자에게 전송된 기록은 유지됩니다.").setNegativeButton("취소",null).setPositiveButton("삭제",(d,n)->{try{if(!store.synced(store.load(saved.getString("runId")))){sync();notice="관리자 전송 완료 후 기기 기록을 삭제할 수 있습니다.";label(body,notice,13,secondary);return;}store.delete(saved.getString("runId"));render();}catch(Exception error){label(body,"기록을 삭제하지 못했습니다.",13,secondary);}}).show());}if(shown==0)label(body,"아직 저장된 기록이 없습니다.",15,secondary);button(body,"연습 홈으로",false,"practice.home",()->{page="home";notice="";render();});}
    void webRecords(){
        Uri url=Uri.parse(InterviewApi.ORIGIN).buildUpon().path("/index.html").appendQueryParameter("nativeInterview","1").appendQueryParameter("nativePractice","1").appendQueryParameter("nativePracticePackage",getPackageName()).encodedFragment("interview-prep?tab=mock&mockMode="+mode+"&legacyRecords=1").build();
        try{startActivity(new Intent(Intent.ACTION_VIEW,url).setClassName(getPackageName(),"com.ronpark.study.LauncherActivity").addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP));finish();}catch(Exception unavailable){notice="앱을 다시 열어 이전 웹 기록을 확인해주세요.";render();}
    }
    void back(){if(page.equals("live")||page.equals("review")){confirmEnd();return;}if(page.equals("home")||page.equals("entry")||page.equals("error")||page.equals("loading")){finish();return;}generation++;loading=false;permissionPending=false;voice.stop();stopPlayback();notice="";if(page.equals("result")&&historyResult)page="records";else page="home";render();}
    @Override public void onBackPressed(){back();}
    @Override public void finish(){super.finish();overridePendingTransition(R.anim.practice_stay,R.anim.practice_slide_out); }
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] grants){super.onRequestPermissionsResult(request,permissions,grants);if(request!=71||!permissionPending||destroyed||isFinishing()||!foreground)return;permissionPending=false;if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)begin();else {notice="마이크 권한을 허용한 뒤 다시 시작해주세요.";render();}}
    @Override protected void onStart(){super.onStart();foreground=true;}
    @Override protected void onResume(){super.onResume();if(!loading&&!page.equals("live"))render();sync();}
    @Override protected void onStop(){
        foreground=false;permissionPending=false;
        if(loading){generation++;loading=false;voice.stop();notice="";}
        if(page.equals("live")||page.equals("review"))endSession(false);stopPlayback();super.onStop();
    }
    @Override protected void onDestroy(){destroyed=true;stopQuestion();stopPlayback();if(speech!=null)speech.shutdown();if(api!=null)api.close();ui.removeCallbacksAndMessages(null);io.shutdown();super.onDestroy();}
}
