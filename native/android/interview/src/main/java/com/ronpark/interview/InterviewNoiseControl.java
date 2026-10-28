package com.ronpark.interview;

import android.media.audiofx.NoiseSuppressor;

/** Use the device's speech noise suppression for both the mic check and answer stream. */
final class InterviewNoiseControl {
    private NoiseSuppressor suppressor;
    void attach(int session){
        close();
        try{if(NoiseSuppressor.isAvailable()){suppressor=NoiseSuppressor.create(session);if(suppressor!=null)suppressor.setEnabled(true);}}catch(Exception ignored){close();}
    }
    void close(){if(suppressor!=null){try{suppressor.release();}catch(Exception ignored){}suppressor=null;}}
}
