package com.ronpark.interview;

import org.json.JSONObject;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public final class InterviewPracticeQuestionTest {
    private InterviewPracticeQuestion question(String id,String category,String track,String field,String region) throws Exception {
        JSONObject row=new JSONObject();row.put("id",id);row.put("prompt","질문 "+id);row.put("category",category);
        row.put("tracks",new org.json.JSONArray(Collections.singletonList(track)));
        row.put("fieldIds",new org.json.JSONArray(Collections.singletonList(field)));
        row.put("regions",new org.json.JSONArray(Collections.singletonList(region)));
        return new InterviewPracticeQuestion(row);
    }
    @Test public void favoritesStayWithinSelectedTrackFieldRegionAndMode() throws Exception {
        InterviewPracticeQuestion allowed=question("a","job","항해","navigation","서해");
        List<InterviewPracticeQuestion> all=Arrays.asList(allowed,question("b","job","기관","navigation","서해"),
            question("c","job","항해","coast_guard","서해"),question("d","job","항해","navigation","동해"),
            question("e","personality","항해","navigation","서해"));
        Set<String> favorites=new HashSet<>(Arrays.asList("a","b","c","d","e"));
        assertEquals(Collections.singletonList(allowed),InterviewPracticeQuestion.filter(all,"job","항해","navigation","서해",favorites,true));
        favorites.remove("a");
        assertTrue(InterviewPracticeQuestion.filter(all,"job","항해","navigation","서해",favorites,true).isEmpty());
    }
    @Test public void quickPracticeNeverDuplicatesOrExceedsAvailableQuestions() throws Exception {
        List<InterviewPracticeQuestion> all=Arrays.asList(question("a","job","공채","coast_guard","서해"),question("b","job","공채","coast_guard","서해"));
        for(int i=0;i<30;i++) {
            List<InterviewPracticeQuestion> picked=InterviewPracticeQuestion.sample(all,3);
            assertEquals(2,picked.size());assertEquals(2,new HashSet<>(picked).size());assertTrue(all.containsAll(picked));
        }
        assertTrue(InterviewPracticeQuestion.sample(Collections.emptyList(),3).isEmpty());
    }
    @Test public void revalidationRejectsRemovedAndDuplicateIdsAndUsesLatestPrompt() throws Exception {
        InterviewPracticeQuestion old=question("a","job","공채","coast_guard","서해"),fresh=question("a","job","공채","coast_guard","서해");
        assertSame(fresh,InterviewPracticeQuestion.selected(Collections.singletonList(fresh),Collections.singletonList(old)).get(0));
        assertThrows(IllegalArgumentException.class,()->InterviewPracticeQuestion.selected(Collections.emptyList(),Collections.singletonList(old)));
        assertThrows(IllegalArgumentException.class,()->InterviewPracticeQuestion.selected(Collections.singletonList(fresh),Arrays.asList(old,old)));
    }
    @Test public void specialtyFieldsFollowTrack() {
        assertTrue(InterviewPracticeQuestion.fieldAllowed("coast_guard","공채"));
        assertTrue(InterviewPracticeQuestion.fieldAllowed("navigation","항해"));
        assertTrue(InterviewPracticeQuestion.fieldAllowed("navigation","관제"));
        assertFalse(InterviewPracticeQuestion.fieldAllowed("navigation","기관"));
        assertFalse(InterviewPracticeQuestion.fieldAllowed("engineering_maintenance","공채"));
        assertTrue(InterviewPracticeQuestion.fieldAllowed("engineering_maintenance","방제"));
    }
}
