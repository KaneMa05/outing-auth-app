package com.ronpark.interview;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.media.audiofx.Visualizer;
import java.io.File;
import java.io.RandomAccessFile;

/** Measures playback or microphone level, with optional answer recording and PCM streaming. */
final class InterviewVoiceLevel {
    interface PcmListener{void bytes(byte[] bytes);}
    volatile float level;
    volatile boolean speaking;
    private Visualizer output;
    private volatile AudioRecord input;
    private Thread reader;
    private final InterviewNoiseControl noiseControl=new InterviewNoiseControl();
    void playback(int session) {
        stop();
        try {
            output=new Visualizer(session);
            output.setCaptureSize(Visualizer.getCaptureSizeRange()[0]);
            output.setDataCaptureListener(new Visualizer.OnDataCaptureListener(){
                public void onWaveFormDataCapture(Visualizer v,byte[] data,int rate){
                    double sum=0;for(byte b:data){double n=(b&255)-128;sum+=n*n;}
                    level=(float)Math.min(1,Math.sqrt(sum/Math.max(1,data.length))/48);
                }
                public void onFftDataCapture(Visualizer v,byte[] data,int rate){}
            },Math.min(20000,Visualizer.getMaxCaptureRate()),true,false);
            output.setEnabled(true);
        }catch(Exception ignored){stop();}
    }
    void microphone(){microphone(null,null);}
    void microphone(File recording){microphone(recording,null);}
    void microphone(File recording,PcmListener listener) {
        microphone(recording,listener,InterviewMicLevel.DEFAULT_NOISE_DB);
    }
    void microphone(File recording,PcmListener listener,double noiseDb) {
        stop();
        try {
            int size=Math.max(4096,AudioRecord.getMinBufferSize(16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT));
            final AudioRecord recorder=new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION,16000,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,size);
            if(recorder.getState()!=AudioRecord.STATE_INITIALIZED){recorder.release();return;}
            input=recorder;noiseControl.attach(recorder.getAudioSessionId());recorder.startRecording();
            reader=new Thread(()->{
                short[] samples=new short[1024];
                InterviewMicLevel signal=new InterviewMicLevel(noiseDb);
                RandomAccessFile wav=null;
                try {
                    if(recording!=null){wav=new RandomAccessFile(recording,"rw");if(wav.length()<44)wav.setLength(44);wav.seek(wav.length());}
                    while(input==recorder){int n=recorder.read(samples,0,samples.length);if(n<=0)break;
                    signal.sample(samples,n);
                    if(input==recorder){level=signal.level();speaking=signal.speaking();}
                    if(wav!=null||listener!=null){byte[] bytes=new byte[n*2];for(int i=0;i<n;i++){bytes[i*2]=(byte)samples[i];bytes[i*2+1]=(byte)(samples[i]>>8);}if(wav!=null)wav.write(bytes);if(listener!=null)listener.bytes(bytes);}
                }}catch(Exception ignored){}
                finally{if(wav!=null)try{long length=wav.length()-44;wav.seek(0);wav.writeBytes("RIFF");le(wav,length+36,4);wav.writeBytes("WAVEfmt ");le(wav,16,4);le(wav,1,2);le(wav,1,2);le(wav,16000,4);le(wav,32000,4);le(wav,2,2);le(wav,16,2);wav.writeBytes("data");le(wav,length,4);wav.close();}catch(Exception ignored){}}
            },"InterviewVoiceLevel");reader.start();
        }catch(Exception ignored){stop();}
    }
    private static void le(RandomAccessFile f,long value,int bytes)throws java.io.IOException{for(int i=0;i<bytes;i++)f.write((int)(value>>(8*i))&255);}
    void stop(){
        AudioRecord recorder=input;input=null;
        if(recorder!=null){try{recorder.stop();}catch(Exception ignored){}if(reader!=null)try{reader.join(500);}catch(InterruptedException e){Thread.currentThread().interrupt();}noiseControl.close();recorder.release();reader=null;}
        if(output!=null){try{output.setEnabled(false);}catch(Exception ignored){}output.release();output=null;}
        level=0;speaking=false;
    }
}
