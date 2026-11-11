package com.ronpark.interview.test;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.os.Bundle;
import android.view.*;
import android.widget.TextView;
import com.ronpark.interview.InterviewTestLiveActivity;
import com.ronpark.interview.InterviewPortalPracticeActivity;
import org.json.*;
import java.lang.reflect.*;

/** Local in-memory UI fixtures. No valid launch code, login, audio capture, upload or paid call. */
public final class InterviewSyncInstrumentation extends Instrumentation {
    private Activity activity;
    private static int assertions;
    @Override public void onCreate(Bundle arguments){super.onCreate(arguments);start();}
    @Override public void onStart(){
        Bundle result=new Bundle();
        try{
            String pkg=getTargetContext().getPackageName();PackageManager pm=getTargetContext().getPackageManager();
            ActivityInfo regular=pm.getActivityInfo(new ComponentName(pkg,"com.ronpark.study.LauncherActivity"),PackageManager.MATCH_DISABLED_COMPONENTS);
            check(!regular.enabled,"Debug must use the synchronized portal launcher");
            check(pm.getPackageInfo(pkg,0).versionName.endsWith("-test-sync-20261111"),"Build must be identifiable as synchronized");
            Class<?> api=Class.forName("com.ronpark.interview.InterviewApi");
            onMain(()->{try{Constructor<?> ordinary=api.getDeclaredConstructor(),test=api.getDeclaredConstructor(boolean.class);ordinary.setAccessible(true);test.setAccessible(true);check(Boolean.FALSE.equals(get(ordinary.newInstance(),"testApp")),"Ordinary Android requests must not gain the test marker");check(Boolean.TRUE.equals(get(test.newInstance(true),"testApp")),"Explicit Debug API must carry the test marker");}catch(Exception e){throw new RuntimeException(e);}});

            activity=startActivitySync(new Intent(getTargetContext(),InterviewTestLiveActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            onMain(()->{
                try{
                    set(activity,"screen","prep");set(activity,"ready",true);set(activity,"unlimited",true);invoke(activity,"render");
                    String prep=text(activity.getWindow().getDecorView());check(prep.contains("총 6문답"),"Preparation must describe six answers");check(prep.contains("이용 횟수 제한 없음"),"Test allowance must be unlimited");check(!prep.contains("$"),"Student preparation must hide costs");
                    set(activity,"screen","live");set(activity,"questionNumber",2);set(activity,"question","Local fixture question");set(activity,"transcript","Local fixture answer");invoke(activity,"render");
                    String live=text(activity.getWindow().getDecorView());check(live.contains("메인 1/2 · 꼬리질문 1/2"),"Followup progress must match iPhone");check(live.contains("Local fixture question")&&live.contains("Local fixture answer"),"Question and student captions must remain visible");
                    ((InterviewTestLiveActivity)activity).ended("","queue_full");String failed=text(activity.getWindow().getDecorView());check("prep".equals(get(activity,"screen")),"Startup failure must remain on preparation");check(failed.contains("잠시 후 다시 시도"),"Startup failure must explain the server reason");check(!failed.contains("INTERVIEW RECORD"),"No result may be invented before a session starts");
                    activity.finish();
                }catch(Exception e){throw new RuntimeException(e);}
            });
            waitForIdleSync();
            activity=startActivitySync(new Intent(getTargetContext(),InterviewPortalPracticeActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            onMain(()->{
                try{
                    Class<?> sessions=Class.forName("com.ronpark.interview.InterviewPortalSession");Method create=sessions.getDeclaredMethod("create",String.class),take=sessions.getDeclaredMethod("take",String.class);create.setAccessible(true);take.setAccessible(true);
                    Object portal=take.invoke(null,create.invoke(null,"job"));set(activity,"portal",portal);set(activity,"mode","job");set(activity,"track","공채");
                    JSONArray bank=new JSONArray();for(int i=0;i<10;i++)bank.put(new JSONObject().put("id","fixture-"+i).put("prompt","Local fixture "+i).put("category","job").put("tracks",new JSONArray().put("공채")).put("fieldIds",new JSONArray().put(i<5?"criminal_law_investigation":"domestic_maritime_law")).put("regions",new JSONArray().put(i%2==0?"서해":"중부")));
                    set(activity,"bank",bank);set(activity,"fields",new JSONArray().put(new JSONObject().put("id","criminal_law_investigation").put("label","형사법·수사절차")));set(activity,"count",5);set(activity,"field","criminal_law_investigation");set(activity,"region","서해");invoke(activity,"refreshQuestions");invoke(activity,"render");
                    String prep=text(activity.getWindow().getDecorView());check(prep.contains("형사법·수사절차")&&prep.contains("기출 지역 · 서해"),"Practice filters must match iPhone");check(prep.contains("연습 문항 수 · 5문항"),"Practice must support configurable counts");check(prep.contains("공개 승인 문항 3개"),"Field and region must both restrict questions");activity.finish();
                }catch(Exception e){throw new RuntimeException(e);}
            });
            waitForIdleSync();result.putString("stream","PASS synchronized Android launcher, API scope, six-turn preparation, unlimited allowance, followup captions, startup failure and practice filters. No paid calls.\n");result.putInt("passed",assertions);finish(Activity.RESULT_OK,result);
        }catch(Throwable error){if(activity!=null)runOnMainSync(()->activity.finish());result.putString("stream","FAIL "+error.toString()+"\n");finish(Activity.RESULT_CANCELED,result);}
    }
    private static void check(boolean condition,String message){assertions++;if(!condition)throw new AssertionError(message);}
    private void onMain(Runnable action)throws Throwable{Throwable[] failure=new Throwable[1];runOnMainSync(()->{try{action.run();}catch(Throwable error){failure[0]=error;}});if(failure[0]!=null)throw failure[0];}
    private static Field field(Object object,String name)throws Exception{Field field=object.getClass().getDeclaredField(name);field.setAccessible(true);return field;}
    private static Object get(Object object,String name)throws Exception{return field(object,name).get(object);}
    private static void set(Object object,String name,Object value)throws Exception{field(object,name).set(object,value);}
    private static void invoke(Object object,String name)throws Exception{Method method=object.getClass().getDeclaredMethod(name);method.setAccessible(true);method.invoke(object);}
    private static String text(View root){StringBuilder out=new StringBuilder();if(root instanceof TextView)out.append(((TextView)root).getText()).append('\n');if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++)out.append(text(group.getChildAt(i)));}return out.toString();}
}
