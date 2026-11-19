package com.ronpark.interview;

import java.io.*;

/** A turn may advance only after the recorder finalized a readable PCM WAV. */
final class NativePracticeRecording {
    static double duration(File file) throws IOException {
        try(RandomAccessFile wav=new RandomAccessFile(file,"r")){
            long size=wav.length();
            if(size<=44||size>16_777_216||(size-44)%2!=0)throw new IOException("invalid_recording");
            if(wav.readInt()!=0x52494646||little(wav,4)!=size-8||wav.readInt()!=0x57415645||wav.readInt()!=0x666d7420||little(wav,4)!=16||little(wav,2)!=1||little(wav,2)!=1||little(wav,4)!=16000||little(wav,4)!=32000||little(wav,2)!=2||little(wav,2)!=16||wav.readInt()!=0x64617461||little(wav,4)!=size-44)throw new IOException("invalid_recording");
            return Math.min(120,(size-44)/32000.0);
        }
    }
    private static long little(RandomAccessFile wav,int bytes)throws IOException {
        long value=0;for(int i=0;i<bytes;i++)value|=(long)wav.readUnsignedByte()<<(8*i);return value;
    }
}
