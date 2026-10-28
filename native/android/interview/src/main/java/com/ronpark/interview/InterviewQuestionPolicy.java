package com.ronpark.interview;

import java.util.List;

/** Production track comes from the authenticated server profile, never intent extras. */
final class InterviewQuestionPolicy {
    static final String[] TRACKS={"공채","항해","기관","방제","관제","기타"};
    static boolean validTrack(String track){for(String item:TRACKS)if(item.equals(track))return true;return false;}
    static boolean eligible(String category,List<String> tracks,String mode,String selectedTrack){
        if(!validTrack(selectedTrack))return false;
        if("job".equals(mode))return "job".equals(category)&&tracks.contains(selectedTrack);
        return "personality".equals(category);
    }
}
