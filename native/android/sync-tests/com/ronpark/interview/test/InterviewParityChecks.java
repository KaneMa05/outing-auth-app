package com.ronpark.interview.test;

import android.app.*;
import android.content.*;
import android.graphics.Bitmap;
import android.media.*;
import android.view.*;
import android.widget.*;
import com.ronpark.interview.InterviewPortalPracticeActivity;
import com.ronpark.interview.InterviewTestLiveActivity;
import org.json.*;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;

/** Real native views and existing packaged MP3s; no microphone, answer upload or paid provider. */
final class InterviewParityChecks {
    static void screens(Instrumentation test)throws Throwable{
        Activity activity=test.startActivitySync(new Intent(test.getTargetContext(),InterviewPortalPracticeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        Object[] store=new Object[1];String[] savedId=new String[1];
        try{
            main(test,()->{
                try{
                    activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(android.os.Build.VERSION.SDK_INT>=27){activity.setShowWhenLocked(true);activity.setTurnScreenOn(true);}set(activity,"notice","");set(activity,"analysisReady",true);
                    Class<?> sessions=Class.forName("com.ronpark.interview.InterviewPortalSession");Method create=method(sessions,"create",String.class),take=method(sessions,"take",String.class);set(activity,"portal",take.invoke(null,create.invoke(null,"job")));set(activity,"mode","job");set(activity,"track","공채");set(activity,"catalogLoaded",true);
                    JSONArray bank=new JSONArray();for(int i=0;i<3;i++)bank.put(new JSONObject().put("id","fixture-"+i).put("prompt","화면 검증 질문 "+(i+1)).put("category","job").put("tracks",new JSONArray().put("공채")).put("fieldIds",new JSONArray().put("criminal_law_investigation")).put("regions",new JSONArray().put("서해")));
                    set(activity,"bank",bank);set(activity,"fields",new JSONArray().put(new JSONObject().put("id","criminal_law_investigation").put("label","형사법·수사절차")));invoke(activity,"refreshQuestions");invoke(activity,"render");
                }catch(Exception error){throw new RuntimeException(error);}
            });
            test.waitForIdleSync();capture(test,"practice-preparation");
            main(test,()->{View count=find(activity.getWindow().getDecorView(),"3문항  ▾");check(count!=null,"Count selector must exist");count.performClick();});test.waitForIdleSync();
            main(test,()->{try{PopupWindow menu=(PopupWindow)get(activity,"choices");check(menu.isShowing(),"Selector must be an anchored popup");check(text(menu.getContentView()).contains("20문항"),"All iPhone count choices must exist");}catch(Exception error){throw new RuntimeException(error);}});capture(test,"practice-count-menu");
            main(test,()->{
                try{
                    ((PopupWindow)get(activity,"choices")).dismiss();set(activity,"screen","live");set(activity,"number",1);set(activity,"counting",false);set(activity,"talking",false);set(activity,"recordingReady",true);invoke(activity,"render");ImageView icon=(ImageView)get(activity,"voiceIcon");check(icon.getDrawable()!=null&&"내 답변 음성".contentEquals(icon.getContentDescription()),"A real microphone image must be visible during the answer");
                }catch(Exception error){throw new RuntimeException(error);}
            });test.waitForIdleSync();capture(test,"practice-microphone");
            main(test,()->{
                try{
                    Context isolated=new ContextWrapper(test.getTargetContext()){@Override public File getNoBackupFilesDir(){File dir=new File(getCacheDir(),"parity-fixture");dir.mkdirs();return dir;}};
                    Class<?> type=Class.forName("com.ronpark.interview.InterviewLocalStore");Constructor<?> constructor=type.getDeclaredConstructor(Context.class,String.class);constructor.setAccessible(true);store[0]=constructor.newInstance(isolated,String.join("",Collections.nCopies(64,"0")));savedId[0]=(String)method(type,"create").invoke(store[0]);set(activity,"store",store[0]);set(activity,"run",savedId[0]);
                    JSONArray turns=new JSONArray();for(int i=1;i<=3;i++){JSONObject report=new JSONObject().put("assessment",new JSONArray().put(new JSONObject().put("status",new String[]{"O","partial","X"}[i-1]).put("label","핵심 항목").put("claim","확인하고 보고한다").put("reason","화면 검증 판정 근거").put("quote","확인했습니다")));turns.put(new JSONObject().put("number",i).put("question","화면 검증 질문 "+i).put("answer","내 답변 확인용 문장").put("referenceAnswer","전체 문항 완료 후 확인하는 예시답변").put("duration_ms",2000).put("complete",true).put("analysis_state","completed").put("report",report));}
                    JSONObject record=new JSONObject().put("id",savedId[0]).put("mode","job").put("track","공채").put("created_at",System.currentTimeMillis()).put("field_label","형사법·수사절차").put("region","서해").put("run",new JSONObject().put("turns",turns).put("expected_questions",3).put("state","interrupted"));set(activity,"record",record);set(activity,"turns",turns);set(activity,"screen","review");set(activity,"number",3);invoke(activity,"render");check(!text(activity.getWindow().getDecorView()).contains("예시답변"),"Per-question review must never reveal an example");
                    set(activity,"screen","result");invoke(activity,"render");check(!text(activity.getWindow().getDecorView()).contains("전체 문항 완료 후 확인하는 예시답변"),"Interrupted results must not reveal examples");check(!text(activity.getWindow().getDecorView()).contains("판정 근거"),"Reference verdicts must remain hidden before completion");
                    record.getJSONObject("run").put("state","completed");invoke(activity,"render");String complete=text(activity.getWindow().getDecorView());check(complete.contains("예시답변"),"Completed results must offer the examples");check(complete.contains("충족")&&complete.contains("부분 충족")&&complete.contains("미충족"),"Overall result verdicts must match iPhone");View disclosure=findPrefix(activity.getWindow().getDecorView(),"예시답변");check(disclosure!=null,"Example disclosure must exist");disclosure.performClick();
                    JSONArray criteria=turns.getJSONObject(0).getJSONObject("report").getJSONArray("assessment");criteria.put(new JSONObject().put("status","uncertain").put("label","보고").put("reason","녹음 확인 필요"));invoke(activity,"render");String mixed=text(activity.getWindow().getDecorView());check(mixed.contains("일부 항목 확인")&&mixed.contains("확인된 항목 1/2"),"Mixed verdicts must retain the confirmed criteria");findPrefix(activity.getWindow().getDecorView(),"판정 근거").performClick();String reasons=text(activity.getWindow().getDecorView());check(reasons.contains("핵심 항목 · 충족")&&reasons.contains("보고 · 판정 보류"),"Each criterion must show its own status");criteria.remove(criteria.length()-1);invoke(activity,"render");findPrefix(activity.getWindow().getDecorView(),"예시답변").performClick();
                    method(type,"save",String.class,JSONObject.class).invoke(store[0],savedId[0],record);
                }catch(Exception error){throw new RuntimeException(error);}
            });test.waitForIdleSync();capture(test,"practice-completed-result");
            main(test,()->{try{set(activity,"screen","records");invoke(activity,"render");String records=text(activity.getWindow().getDecorView());check(records.contains("기록 보기")&&records.contains("질문 3개")&&records.contains("서해"),"Record cards must retain track, count, field and region");}catch(Exception error){throw new RuntimeException(error);}});test.waitForIdleSync();capture(test,"practice-records");
        }finally{
            main(test,()->{try{set(activity,"screen","prep");activity.finish();if(store[0]!=null&&savedId[0]!=null)method(store[0].getClass(),"delete",String.class).invoke(store[0],savedId[0]);}catch(Exception error){throw new RuntimeException(error);}});
        }
        liveScreens(test);
    }
    private static void liveScreens(Instrumentation test)throws Throwable{
        Activity activity=test.startActivitySync(new Intent(test.getTargetContext(),InterviewTestLiveActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try{
            main(test,()->{try{activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);if(android.os.Build.VERSION.SDK_INT>=27){activity.setShowWhenLocked(true);activity.setTurnScreenOn(true);}set(activity,"notice","");set(activity,"screen","prep");set(activity,"ready",true);set(activity,"unlimited",true);invoke(activity,"render");check(text(activity.getWindow().getDecorView()).contains("카메라·마이크 켜기"),"Live preparation must use the iPhone media toggle");}catch(Exception error){throw new RuntimeException(error);}});test.waitForIdleSync();capture(test,"live-preparation");
            main(test,()->{try{set(activity,"screen","live");set(activity,"questionNumber",2);set(activity,"question","검증용 꼬리질문");set(activity,"transcript","검증용 내 답변");invoke(activity,"render");String live=text(activity.getWindow().getDecorView());check(live.contains("내 모습")&&live.contains("AI 면접관"),"Live must label both equal panes");check(live.contains("메인 1/2 · 꼬리질문 1/2"),"Live followup progress must match");}catch(Exception error){throw new RuntimeException(error);}});test.waitForIdleSync();capture(test,"live-conversation");
            main(test,()->{try{JSONArray turns=new JSONArray();for(int i=1;i<=6;i++)turns.put(new JSONObject().put("question","검증 질문 "+i).put("answer","검증 답변 "+i).put("complete",true).put("kind",i%3==1?"initial":"followup"));set(activity,"record",new JSONObject().put("run",new JSONObject().put("turns",turns).put("retain_until","2026-11-11T15:00:00.000Z")));set(activity,"screen","result");set(activity,"details",false);invoke(activity,"render");String summary=text(activity.getWindow().getDecorView());check(summary.contains("완료한 답변 6개"),"Live summary must retain all six answers");check(summary.contains("보관 종료: 2026-11-12")&&!summary.contains("15:00"),"Retention must show only the date in Korea time");}catch(Exception error){throw new RuntimeException(error);}});test.waitForIdleSync();capture(test,"live-summary");
            main(test,()->{try{set(activity,"details",true);invoke(activity,"render");String details=text(activity.getWindow().getDecorView());check(details.contains("검증 질문 6")&&details.contains("검증 답변 6")&&details.contains("꼬리 질문"),"Live details must retain all questions, followups and answers");}catch(Exception error){throw new RuntimeException(error);}});test.waitForIdleSync();capture(test,"live-details");
        }finally{main(test,()->{try{set(activity,"screen","prep");activity.finish();}catch(Exception error){throw new RuntimeException(error);}});}
    }
    static String audio(Instrumentation test)throws Throwable{
        JSONObject manifest;try(InputStream in=test.getTargetContext().getAssets().open("interview-test-question-audio.json")){manifest=new JSONObject(new String(read(in),java.nio.charset.StandardCharsets.UTF_8));}
        JSONArray rows=manifest.getJSONArray("questions");check(rows.length()==6,"All six current practice recordings must be packaged");
        AudioManager manager=(AudioManager)test.getTargetContext().getSystemService(Context.AUDIO_SERVICE);int volume=manager.getStreamVolume(AudioManager.STREAM_MUSIC);check(volume>0&&!manager.isStreamMute(AudioManager.STREAM_MUSIC),"Media volume must be audible for playback verification");
        for(int i=0;i<rows.length();i++){
            JSONObject row=rows.getJSONObject(i);CountDownLatch completed=new CountDownLatch(1);Throwable[] failure=new Throwable[1];boolean[] advanced=new boolean[1],ended=new boolean[1];long[] began=new long[1];
            main(test,()->{
                try{
                    Class<?> type=Class.forName("com.ronpark.interview.InterviewQuestionAudio");Constructor<?> constructor=type.getDeclaredConstructor(Context.class);constructor.setAccessible(true);Object audio=constructor.newInstance(test.getTargetContext());Method create=method(type,"create",Context.class,String.class,String.class);
                    check(create.invoke(audio,test.getTargetContext(),row.getString("id"),"changed source prompt")==null,"A changed source question must not use an old recording");
                    MediaPlayer player=(MediaPlayer)create.invoke(audio,test.getTargetContext(),row.getString("id"),row.getString("prompt"));check(player!=null&&player.getDuration()>500,"Approved recording must decode in the installed APK");
                    player.setOnCompletionListener(p->{ended[0]=true;try{check(advanced[0]&&android.os.SystemClock.elapsedRealtime()-began[0]>400,"Playback position must advance through the question: "+row.optString("id"));}catch(Throwable error){failure[0]=error;}finally{p.release();completed.countDown();}});player.setOnErrorListener((p,a,b)->{ended[0]=true;failure[0]=new AssertionError("Question playback failed: "+a+"/"+b);p.release();completed.countDown();return true;});began[0]=android.os.SystemClock.elapsedRealtime();player.start();android.os.Handler handler=new android.os.Handler(android.os.Looper.getMainLooper());Runnable progress=new Runnable(){public void run(){if(ended[0])return;try{advanced[0]|=player.getCurrentPosition()>100;}catch(Exception ignored){}handler.postDelayed(this,100);}};handler.postDelayed(progress,100);
                }catch(Throwable error){failure[0]=error;completed.countDown();}
            });
            if(!completed.await(15,TimeUnit.SECONDS))throw new AssertionError("Question playback timed out");if(failure[0]!=null)throw failure[0];
        }
        return "PASS existing packaged question audio: "+rows.length()+" clips decoded, playback positions advanced and completed; mediaVolume="+volume+". No microphone, recordings or paid calls.\n";
    }
    private static byte[] read(InputStream in)throws IOException{ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;while((n=in.read(buffer))!=-1)bytes.write(buffer,0,n);return bytes.toByteArray();}
    private static void capture(Instrumentation test,String name)throws Exception{android.os.SystemClock.sleep(500);Bitmap bitmap=test.getUiAutomation().takeScreenshot();if(bitmap==null)return;try(FileOutputStream out=new FileOutputStream(new File(test.getTargetContext().getCacheDir(),"parity-"+name+".png"))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}finally{bitmap.recycle();}}
    private static void check(boolean condition,String message){if(!condition)throw new AssertionError(message);}
    private static void main(Instrumentation test,Runnable action)throws Throwable{Throwable[] failure=new Throwable[1];test.runOnMainSync(()->{try{action.run();}catch(Throwable error){failure[0]=error;}});if(failure[0]!=null)throw failure[0];}
    private static Field field(Object object,String name)throws Exception{Class<?> type=object.getClass();while(type!=null){try{Field field=type.getDeclaredField(name);field.setAccessible(true);return field;}catch(NoSuchFieldException absent){type=type.getSuperclass();}}throw new NoSuchFieldException(name);}
    private static Object get(Object object,String name)throws Exception{return field(object,name).get(object);}
    private static void set(Object object,String name,Object value)throws Exception{field(object,name).set(object,value);}
    private static Method method(Class<?> type,String name,Class<?>...args)throws Exception{Method method=type.getDeclaredMethod(name,args);method.setAccessible(true);return method;}
    private static void invoke(Object object,String name)throws Exception{method(object.getClass(),name).invoke(object);}
    private static View find(View root,String value){if(root instanceof TextView&&value.contentEquals(((TextView)root).getText()))return root;if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){View result=find(group.getChildAt(i),value);if(result!=null)return result;}}return null;}
    private static View findPrefix(View root,String value){if(root instanceof TextView&&((TextView)root).getText().toString().startsWith(value))return root;if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){View result=findPrefix(group.getChildAt(i),value);if(result!=null)return result;}}return null;}
    private static String text(View root){StringBuilder result=new StringBuilder();if(root instanceof TextView)result.append(((TextView)root).getText()).append('\n');if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++)result.append(text(group.getChildAt(i)));}return result.toString();}
}
