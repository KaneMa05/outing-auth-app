package com.ronpark.interview;

import android.content.Context;
import android.media.*;
import android.os.*;
import java.io.*;

/** Exactly one microphone feeds video AAC, per-answer WAV, meters and optional captions. */
final class PracticeCapture {
    interface Pcm{void sample(byte[] bytes,long timeNs);}
    interface Reply{void done(boolean ready);}
    private final Handler main=new Handler(Looper.getMainLooper());
    private volatile boolean running;
    private volatile int generation;
    private volatile AudioRecord microphone;
    private Thread thread;
    private RandomAccessFile answer;
    private Pcm turnPcm;
    private Reply turnReady;
    private volatile Pcm videoPcm;
    volatile boolean speaking;
    volatile float level;
    private AudioManager manager;private int oldMode;private boolean oldSpeaker;
    private final InterviewNoiseControl noise=new InterviewNoiseControl();
    void start(Context context,double noiseDb,Reply ready){
        Thread previous=thread;stop();final int active=++generation;thread=new Thread(()->{
            boolean delivered=false;
            AudioRecord owned=null;
            try{
                if(previous!=null)previous.join(2000);
                if(active!=generation)return;
                if(previous!=null&&previous.isAlive())throw new IOException("microphone_busy");
                running=true;
                manager=(AudioManager)context.getSystemService(Context.AUDIO_SERVICE);oldMode=manager.getMode();oldSpeaker=manager.isSpeakerphoneOn();manager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                if(!manager.isWiredHeadsetOn()&&!manager.isBluetoothScoOn())manager.setSpeakerphoneOn(true);
                int size=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
                AudioRecord recorder=owned=new AudioRecord(MediaRecorder.AudioSource.VOICE_COMMUNICATION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);
                microphone=recorder;if(recorder.getState()!=AudioRecord.STATE_INITIALIZED)throw new IOException("microphone_unavailable");
                noise.attach(recorder.getAudioSessionId());recorder.startRecording();short[] samples=new short[1024];InterviewMicLevel signal=new InterviewMicLevel(noiseDb);
                while(running&&active==generation){
                    int count=recorder.read(samples,0,samples.length);if(count<=0)throw new IOException("microphone_lost");
                    if(!running||active!=generation)break;signal.sample(samples,count);speaking=signal.speaking();level=signal.level();
                    byte[] bytes=new byte[count*2];for(int i=0;i<count;i++){bytes[2*i]=(byte)samples[i];bytes[2*i+1]=(byte)(samples[i]>>8);}
                    long now=System.nanoTime();Pcm video=videoPcm;if(video!=null)video.sample(bytes,now);
                    synchronized(this){if(answer!=null){answer.write(bytes);if(turnReady!=null){Reply callback=turnReady;turnReady=null;main.post(()->callback.done(true));}if(turnPcm!=null)turnPcm.sample(bytes,now);}}
                    if(!delivered){delivered=true;main.post(()->ready.done(true));}
                }
            }catch(Exception error){if(active==generation)main.post(()->ready.done(false));}
            finally{
                synchronized(this){finishAnswer();}if(active==generation)running=false;AudioRecord recorder=owned;if(microphone==owned)microphone=null;
                if(recorder!=null){try{recorder.stop();}catch(Exception ignored){}noise.close();recorder.release();}
                if(manager!=null){manager.setSpeakerphoneOn(oldSpeaker);manager.setMode(oldMode);}speaking=false;level=0;
            }
        },"PracticeMicrophone");thread.start();
    }
    synchronized void beginAnswer(File file,Pcm captions,Reply ready){
        finishAnswer();
        try{
            if(!running)throw new IOException();answer=new RandomAccessFile(file,"rw");if(answer.length()<44)answer.setLength(44);answer.seek(answer.length());turnPcm=captions;turnReady=ready;
        }catch(IOException error){finishAnswer();main.post(()->ready.done(false));}
    }
    synchronized boolean finishAnswer(){
        turnPcm=null;turnReady=null;
        boolean valid=true;
        if(answer!=null)try{long length=answer.length()-44;answer.seek(0);answer.writeBytes("RIFF");le(answer,length+36,4);answer.writeBytes("WAVEfmt ");le(answer,16,4);le(answer,1,2);le(answer,1,2);le(answer,16000,4);le(answer,32000,4);le(answer,2,2);le(answer,16,2);answer.writeBytes("data");le(answer,length,4);answer.getFD().sync();}catch(IOException error){valid=false;}finally{try{answer.close();}catch(IOException ignored){}answer=null;}
        return valid;
    }
    void video(Pcm listener){videoPcm=listener;}
    void stop(){generation++;running=false;videoPcm=null;finishAnswer();AudioRecord recorder=microphone;if(recorder!=null)try{recorder.stop();}catch(Exception ignored){}}
    private static void le(RandomAccessFile file,long value,int count)throws IOException{for(int i=0;i<count;i++)file.write((int)(value>>(8*i))&255);}
}
