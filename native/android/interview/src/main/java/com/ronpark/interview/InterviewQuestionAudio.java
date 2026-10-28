package com.ronpark.interview;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.util.Collections;

/** Local question clips. Catalog and unreleased bank audio are debug assets only. */
final class InterviewQuestionAudio {
    private final Map<String,JSONObject> clips=new HashMap<>();
    private final List<JSONObject> questions=new ArrayList<>();
    InterviewQuestionAudio(Context context) {
        try(InputStream input=context.getAssets().open("interview-question-audio/catalog.json")) {
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int read;
            while((read=input.read(buffer))!=-1)bytes.write(buffer,0,read);
            JSONArray rows=new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)).getJSONArray("clips");
            for(int i=0;i<rows.length();i++) {
                JSONObject row=rows.getJSONObject(i);String file=row.getString("file");
                if(!file.matches("[A-Za-z0-9_-]+\\.mp3"))continue;
                // A catalog entry alone is insufficient: the packaged MP3 must exist.
                try(AssetFileDescriptor check=context.getAssets().openFd("interview-question-audio/"+file)){if(check.getLength()<=1000)continue;}catch(Exception missing){continue;}
                clips.put(row.getString("prompt").trim(),row);
                clips.put(row.getString("spokenPrompt").trim(),row);
                questions.add(row);
            }
        }catch(Exception ignored) { clips.clear();questions.clear(); }
    }
    List<JSONObject> eligible(String mode,String track){
        List<JSONObject> available=new ArrayList<>();
        for(JSONObject row:questions){
            List<String> tracks=new ArrayList<>();JSONArray values=row.optJSONArray("tracks");
            if(values!=null)for(int i=0;i<values.length();i++)tracks.add(values.optString(i));
            if(InterviewQuestionPolicy.eligible(row.optString("category"),tracks,mode,track))available.add(row);
        }
        return available;
    }
    String[] sample(String mode,String track,int limit){
        List<JSONObject> available=eligible(mode,track);Collections.shuffle(available);
        String[] result=new String[Math.min(limit,available.size())];
        for(int i=0;i<result.length;i++)result[i]=available.get(i).optString("spokenPrompt");
        return result;
    }
    String spokenPrompt(String original) {
        JSONObject row=clips.get(original.trim());return row==null?original:row.optString("spokenPrompt",original);
    }
    MediaPlayer create(Context context,String question) {
        JSONObject row=clips.get(question.trim());if(row==null)return null;
        MediaPlayer player=new MediaPlayer();
        try(AssetFileDescriptor audio=context.getAssets().openFd("interview-question-audio/"+row.getString("file"))) {
            player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            player.setDataSource(audio.getFileDescriptor(),audio.getStartOffset(),audio.getLength());player.prepare();return player;
        }catch(Exception error) { player.release();return null; }
    }
}
