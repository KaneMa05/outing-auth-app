package com.ronpark.interview;

import org.json.*;
import java.text.*;
import java.util.*;

/** Summaries of saved answers in the current account's local store. */
final class InterviewPracticeProgress {
    interface AudioExists { boolean saved(String run,int number); }
    int count;
    Date latest;
    String label() {
        if(count==0||latest==null)return "아직 연습하지 않음 · 0회 · 최근 연습 없음";
        SimpleDateFormat date=new SimpleDateFormat("yyyy.MM.dd",Locale.KOREA);
        date.setTimeZone(TimeZone.getTimeZone("Asia/Seoul"));
        return "답변 완료 · "+count+"회 · 최근 "+date.format(latest);
    }
    static Map<String,InterviewPracticeProgress> collect(List<JSONObject> records,String mode,AudioExists audio) {
        Map<String,InterviewPracticeProgress> result=new HashMap<>();
        Set<String> runs=new HashSet<>();
        for(JSONObject record:records) {
            if(!mode.equals(record.optString("mode")))continue;
            String run=record.optString("runId");if(run.isEmpty()||!runs.add(run))continue;
            Date date;
            try { date=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX",Locale.ROOT).parse(record.optString("recordedAt")); }
            catch(ParseException error){continue;}
            JSONArray turns=record.optJSONArray("turns");if(turns==null)continue;
            Set<String> seen=new HashSet<>();
            for(int i=0;i<turns.length();i++) {
                JSONObject turn=turns.optJSONObject(i);if(turn==null)continue;
                String id=turn.optString("questionId");int number=turn.optInt("number");
                if(id.isEmpty()||seen.contains(id)||!audio.saved(run,number))continue;
                seen.add(id);
                InterviewPracticeProgress value=result.get(id);
                if(value==null){value=new InterviewPracticeProgress();result.put(id,value);}
                value.count++;if(value.latest==null||date.after(value.latest))value.latest=date;
            }
        }
        return result;
    }
}
