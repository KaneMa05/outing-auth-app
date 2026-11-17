package com.ronpark.interview;

import org.json.*;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public final class InterviewPracticeProgressTest {
    private JSONObject record(String run,String mode,String date,int... numbers)throws Exception {
        JSONArray turns=new JSONArray();for(int number:numbers)turns.put(new JSONObject().put("number",number).put("questionId","q"));
        return new JSONObject().put("runId",run).put("mode",mode).put("recordedAt",date).put("turns",turns);
    }
    @Test public void countsSavedAnswersOncePerRunAndKeepsLatestKoreanDate()throws Exception {
        JSONObject first=record("first","job","2026-11-16T23:00:00.000Z",1,2);
        JSONObject second=record("second","job","2026-11-18T00:00:00.000+09:00",1);
        Map<String,InterviewPracticeProgress> progress=InterviewPracticeProgress.collect(Arrays.asList(first,first,second,
            record("missing","job","2026-11-19T00:00:00.000Z",1),
            record("other-mode","personality","2026-11-20T00:00:00.000Z",1)),"job",(run,n)->!run.equals("missing"));
        assertEquals(2,progress.get("q").count);
        assertEquals("답변 완료 · 2회 · 최근 2026.11.18",progress.get("q").label());
    }
    @Test public void openingQuestionWithoutSavedAudioNeverCompletesPractice()throws Exception {
        assertTrue(InterviewPracticeProgress.collect(Collections.singletonList(record("missing","job","2026-11-17T00:00:00.000Z",1)),"job",(run,n)->false).isEmpty());
        assertTrue(new InterviewPracticeProgress().label().contains("0회"));
    }
}
