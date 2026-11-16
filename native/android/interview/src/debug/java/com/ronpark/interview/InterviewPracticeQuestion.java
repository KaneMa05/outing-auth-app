package com.ronpark.interview;
import org.json.*;
import java.util.*;

final class InterviewPracticeQuestion {
    final String id,prompt,category; final List<String> tracks,fields,regions;
    InterviewPracticeQuestion(JSONObject row){id=row.optString("id");prompt=row.optString("prompt");category=row.optString("category");tracks=strings(row.optJSONArray("tracks"));fields=strings(row.optJSONArray("fieldIds"));regions=strings(row.optJSONArray("regions"));}
    static List<String> strings(JSONArray values){List<String> out=new ArrayList<>();if(values!=null)for(int i=0;i<values.length();i++)if(!values.optString(i).isEmpty())out.add(values.optString(i));return out;}
    boolean matches(String mode,String track,String field,String region){
        boolean categoryMatches=(mode.equals("job")?"job":"personality").equals(category);
        return !id.isEmpty()&&!prompt.isEmpty()&&categoryMatches&&(tracks.isEmpty()||tracks.contains(track))&&(field.isEmpty()||fields.contains(field))&&(!mode.equals("job")||region.isEmpty()||regions.contains(region));
    }
    static List<InterviewPracticeQuestion> filter(List<InterviewPracticeQuestion> all,String mode,String track,String field,String region,Set<String> favorites,boolean onlyFavorites){
        List<InterviewPracticeQuestion> out=new ArrayList<>();for(InterviewPracticeQuestion q:all)if(q.matches(mode,track,field,region)&&(!onlyFavorites||favorites.contains(q.id)))out.add(q);return out;
    }
    static List<InterviewPracticeQuestion> sample(List<InterviewPracticeQuestion> available,int count){List<InterviewPracticeQuestion> copy=new ArrayList<>(available);Collections.shuffle(copy);return new ArrayList<>(copy.subList(0,Math.min(count,copy.size())));}
    static List<InterviewPracticeQuestion> selected(List<InterviewPracticeQuestion> available,List<InterviewPracticeQuestion> requested){
        Map<String,InterviewPracticeQuestion> ids=new HashMap<>();for(InterviewPracticeQuestion q:available)ids.put(q.id,q);
        List<InterviewPracticeQuestion> out=new ArrayList<>();Set<String> seen=new HashSet<>();
        for(InterviewPracticeQuestion q:requested){if(!ids.containsKey(q.id)||!seen.add(q.id))throw new IllegalArgumentException("question_unavailable");out.add(ids.get(q.id));}return out;
    }
    static boolean fieldAllowed(String id,String track){
        if(Arrays.asList("coast_guard","domestic_maritime_law","criminal_law_investigation","international_maritime_law").contains(id)||track.equals("기타"))return true;
        if((track.equals("항해")||track.equals("관제"))&&Arrays.asList("navigation","vts_communications").contains(id))return true;
        return (track.equals("기관")&&id.equals("engineering_maintenance"))||(track.equals("방제")&&Arrays.asList("marine_environment","engineering_maintenance").contains(id));
    }
}
