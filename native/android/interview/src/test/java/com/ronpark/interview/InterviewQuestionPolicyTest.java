package com.ronpark.interview;
import org.junit.Test;
import java.util.Arrays;
import java.util.Collections;
import static org.junit.Assert.*;

public final class InterviewQuestionPolicyTest {
    @Test public void jobQuestionsNeverCrossTracks(){
        for(String selected:InterviewQuestionPolicy.TRACKS)for(String assigned:InterviewQuestionPolicy.TRACKS)
            assertEquals(selected.equals(assigned),InterviewQuestionPolicy.eligible("job",Arrays.asList(assigned),"job",selected));
        assertTrue(InterviewQuestionPolicy.eligible("job",Arrays.asList("항해","관제"),"job","관제"));
        assertFalse(InterviewQuestionPolicy.eligible("job",Collections.emptyList(),"job","공채"));
        assertFalse(InterviewQuestionPolicy.eligible("job",Arrays.asList("기관"),"job","전체"));
    }
    @Test public void fixturesAndOtherModesCannotLeakIntoJobExam(){
        assertFalse(InterviewQuestionPolicy.eligible("practice",Arrays.asList("공채"),"job","공채"));
        assertFalse(InterviewQuestionPolicy.eligible("personality",Arrays.asList("공채"),"job","공채"));
        assertFalse(InterviewQuestionPolicy.eligible("job",Arrays.asList("공채"),"ai","공채"));
        assertTrue(InterviewQuestionPolicy.eligible("personality",Collections.emptyList(),"ai","공채"));
    }
}
