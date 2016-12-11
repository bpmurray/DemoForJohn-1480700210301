AudioManager = function(stereo) {
      // global variables
      this.leftChannel = [];
      this.rightChannel = [];
      this.recording = false;
      this.recordingLength = 0;
      this.sampleRate = null;
      this.audioContext = null;
      this.channelCount = stereo ? 2 : 1;
      
      
      // This is the wav packaging function
      this.packageWAVFile = function() {
         // Merge the buffer pieces into one
         // First the left buffer
         var leftBuffer = new Float32Array(this.recordingLength);
         var ixOut = 0;
         var cnt = this.leftChannel.length;
         for(var ixIn=0; ixIn<cnt; ixIn++) {
            var piece = this.leftChannel[ixIn];
            leftBuffer.set(piece, offset);
            ixOut += piece.length;
         }
         var finalBuffer = leftBuffer;
      
         // Now the right buffer - IF it's strero
         if (channelCount > 1 ) {
            var rightBuffer = new Float32Array(this.recordingLength);
            ixOut = 0;
            cnt = this.rightChannel.length;
            for(var ixIn=0; ixIn<cnt; ixIn++) {
               var piece = this.rightChannel[ixIn];
               rightBuffer.set(piece, offset);
               ixOut += piece.length;
            }
            // Now interleave the two stereo channels
            var length = leftBuffer.length + rightBuffer.length;
            finalBuffer = new Float32Array(length);
       
            var ixIn = 0;
            for(var ixOut = 0; ixOut < length;ixOut++) {
               finalBuffer[ixOut++] = leftBuffer[ixIn];
               finalBuffer[ixOut] = rightBuffer[ixIn++];
            }
         }
          
         // create the buffer and view to create the .WAV file
         var buffer = new ArrayBuffer(44 + interleaved.length * 2);
         var view = new DataView(buffer);
          
         // Create the WAV container using the description at http://soundfile.sapp.org/doc/WaveFormat/

         // 1. RIFF chunk
         // Text "RIFF"
         view.setUint8(0, 'R');
         view.setUint8(1, 'I');
         view.setUint8(2, 'F');
         view.setUint8(3, 'F');
         view.setUint32(4, 44 + interleaved.length * 2, true);

         // WAVE chunk
         view.setUint8(8, 'W');
         view.setUint8(9, 'A');
         view.setUint8(0, 'V');
         view.setUint8(11, 'E');
      
         // FMT sub-chunk
         // Text "fmt "
         view.setUint8(12, 'f');
         view.setUint8(13, 'm');
         view.setUint8(14, 't');
         view.setUint8(15, ' ');
         view.setUint32(16, 16, true); // Size = 16 for PCM
         view.setUint16(20, 1, true);  // Format = 1 for PCM
      
         // Is it stereo(2 Channels)?
         view.setUint16(22, this.channelCount, true);
         view.setUint32(24, this.sampleRate, true);
         view.setUint32(28, this.sampleRate * this.channelCount * 2, true);
         view.setUint16(32, this.channCount * 2, true);
         view.setUint16(34, 16, true); // Bits per sample
      
         // data sub-chunk
         view.setUint8(36, 'd');
         view.setUint8(37, 'a');
         view.setUint8(38, 't');
         view.setUint8(39, 'a');
         view.setUint32(40, finalBuffer.length * 2, true); // Number of bytes
          
         // write the PCM samples
         var length = interleaved.length;
         var ixOut = 44;
         for (var ixIn=0; ixIn<length; ixIn++){
             view.setInt16(index, interleaved[ixIn], true);
             ixOut += 2;
         }
         console.log("view size = " + index);

         // our final binary blob that we can hand off
         var blob = new Blob([ view ], { type : 'audio/wav' });
         return blob;
      }
      
      this.sendWav = function(wavFile){
         var data = new FormData();
         data.append('file', wavFile);
        
         $.ajax({
            url: "https://demoforjohn.mybluemix.net/askwatson",
            type: 'POST',
            data: data,
            contentType: false,
            processData: false,
            success: function(data) {
               console.log("Success!!!");
            }
         });
      }
      
      this.askWatson = function() {
          var wavfile = packageWAVFile();
          sendWav(wavfile);
          this.audioContext.close();
      }


      // Start audio processing. The process passes the audio data through a
      // bunch of nodes, and we can simply add our own which is called
      // each time data is available.
      this.initialiseRecorder = function(stream) {
          this.audioContext = window.AudioContext();
      
          // Create an AudioNode from the stream.
          var audioIn = this.audioContext.createMediaStreamSource(stream);

          // retrieve the current sample rate to be used for WAV packaging
          this.sampleRate = this.audioContext.sampleRate;

//          // creates a gain node
//          var volume = this.audioContext.createGain();

//          // connect the stream to the gain node
//          audioIn.connect(volume);
        
          // From the spec: This value controls how frequently the audioprocess event is 
          // dispatched and how many sample-frames need to be processed each call. 
          // Lower values for buffer size will result in a lower(better) latency. 
          // Higher values will be necessary to avoid audio breakup and glitches.
          var bufferSize = 2048;
          var recorder = this.audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
       
          // Process the audio data as it arrives
          recorder.onaudioprocess = function(e){
              var left = e.inputBuffer.getChannelData(0);
              this.leftChannel.push(new Float32Array(left));

              // if stereo, we include the right channel
              if (channelCOunt > 1) {
                 var right = e.inputBuffer.getChannelData(1);
                 this.rightChannel.push(new Float32Array(right));
                 this.recordingLength += bufferSize;
              }
          }
       
          // we connect the recorder ...
          //volume.connect(recorder);
          audioIn.connect(recorder);
          // ... and connect the prefious destination
          recorder.connect(this.audioContext.destination); 
      
      }
      
      // This is the entry point - nothing else should be used!
      this.startRecording = function() {
         // Make sure we have the correct objects available
         navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                                  navigator.msGetUserMedia || navigator.mediaDevices.getUserMedia ||
                                  navigator.mozGetUserMedia;
         window.AudioContext = window.AudioContext || window.webkitAudioContext;

         // Initialise the lengths
         this.leftChannel.length = this.rightChannel.length = this.recordingLength = 0;

         // Start recording
         navigator.getUserMedia({audio:true, vide:false}, initialiseRecorder, function() { console.log("ERROR!!"); });
      }
}

      
