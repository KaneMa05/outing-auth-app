package com.ronpark.interview;
import android.media.*;
import android.os.SystemClock;
import java.io.*;
import java.nio.*;

/** PCM WAV stays local. A finalized 32kbps AAC/M4A derivative is the only uploaded audio. */
final class InterviewPracticeAac {
    static File encode(File wav)throws Exception {
        String sourceHash=InterviewPracticeStore.hash(wav);File target=new File(wav.getParentFile(),"archive-"+wav.getName().replace(".wav","")+"-"+sourceHash+".m4a");
        if(target.isFile()&&target.length()>44)return target;
        File temp=new File(wav.getParentFile(),java.util.UUID.randomUUID()+".m4a");MediaCodec codec=null;MediaMuxer muxer=null;boolean started=false,success=false;
        try(RandomAccessFile in=new RandomAccessFile(wav,"r")){
            byte[] header=new byte[44];in.readFully(header);ByteBuffer h=ByteBuffer.wrap(header).order(ByteOrder.LITTLE_ENDIAN);
            if(!new String(header,0,4,"US-ASCII").equals("RIFF")||!new String(header,8,8,"US-ASCII").equals("WAVEfmt ")||h.getInt(16)!=16||h.getShort(20)!=1||h.getShort(22)!=1||h.getInt(24)!=16000||h.getShort(34)!=16||!new String(header,36,4,"US-ASCII").equals("data")||h.getInt(40)!=in.length()-44||(in.length()-44)%2!=0)throw new IOException("invalid_audio");
            MediaFormat format=MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC,16000,1);format.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);format.setInteger(MediaFormat.KEY_BIT_RATE,32000);format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE,16384);
            codec=MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();
            muxer=new MediaMuxer(temp.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();int track=-1;boolean inputDone=false,outputDone=false;long frames=0,lastProgress=SystemClock.elapsedRealtime();byte[] input=new byte[16384];
            while(!outputDone){
                if(SystemClock.elapsedRealtime()-lastProgress>30000)throw new IOException("encoder_timeout");
                if(!inputDone){int index=codec.dequeueInputBuffer(10000);if(index>=0){ByteBuffer buffer=codec.getInputBuffer(index);if(buffer==null)throw new IOException();buffer.clear();int length=(int)Math.min(Math.min(buffer.remaining(),input.length),in.length()-in.getFilePointer());length-=length%2;long pts=frames*1000000/16000;
                    if(length>0){in.readFully(input,0,length);buffer.put(input,0,length);codec.queueInputBuffer(index,0,length,pts,0);frames+=length/2;}else {codec.queueInputBuffer(index,0,0,pts,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true;}lastProgress=SystemClock.elapsedRealtime();}}
                int out=codec.dequeueOutputBuffer(info,10000);
                if(out==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){track=muxer.addTrack(codec.getOutputFormat());muxer.start();started=true;lastProgress=SystemClock.elapsedRealtime();}
                else if(out>=0){ByteBuffer data=codec.getOutputBuffer(out);if((info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)!=0)info.size=0;
                    if(info.size>0){if(!started||data==null)throw new IOException();data.position(info.offset);data.limit(info.offset+info.size);muxer.writeSampleData(track,data,info);}
                    outputDone=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(out,false);lastProgress=SystemClock.elapsedRealtime();}
            }
            muxer.stop();started=false;muxer.release();muxer=null;codec.stop();codec.release();codec=null;
            if(temp.length()<=44||temp.length()>16777216||!temp.renameTo(target))throw new IOException("invalid_archive");success=true;return target;
        }finally{if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}if(muxer!=null){if(started)try{muxer.stop();}catch(Exception ignored){}muxer.release();}if(!success)temp.delete();}
    }
}
