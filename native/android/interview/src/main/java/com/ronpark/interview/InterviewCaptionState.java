package com.ronpark.interview;

/** A final correction is not new speech and must not restart the silence timer. */
final class InterviewCaptionState {
    private String text="",lastWords="";
    boolean update(String value,boolean partial){
        text=value==null?"":value.trim();
        String words=text.replaceAll("(?i)[\\[(][^\\])]*(?:잡음|소음|음악|박수|noise|music|applause|silence)[^\\])]*[\\])]","").replaceAll("[^\\p{L}\\p{N}]","");
        boolean speech=partial&&!words.isEmpty()&&!words.equals(lastWords);
        lastWords=words;return speech;
    }
    String text(){return text;}
}
