AudioManager = function(stereo) {
      // global variables
      var leftChannel = [];
      var rightChannel = [];
      var recordingLength = 0;
      var channelCount = stereo ? 2 : 1;
      var socket=null;
      var sampleRate = null;
      var audioContext = null;
      var isRecording = false;
      var bufferSize = 2048;

      
          
      // Push a string onto the WAV buffer
      this.writeString = function(view, offset, text) {
         for (var iX=0; iX<text.length; iX++) {
            view.setUint8(offset+iX, text.charCodeAt(iX));
         }
      }

      // Create the WAV container using the description at http://soundfile.sapp.org/doc/WaveFormat/
      this.CreateWAVContainer = function(buff) {

         // create the buffer and view to create the .WAV file
         var buffer = new ArrayBuffer(44 + buff.length * 2);
         var view = new DataView(buffer);

         // RIFF chunk
         // Text "RIFF" & chunk length
         this.writeString(view, 0, "RIFF");
         view.setUint32(4, 36 + buff.length * 2, true);

         // WAVE chunk
         this.writeString(view, 8, "WAVE");
      
         // FMT sub-chunk - "fmt " + chunk length
         this.writeString(view, 12, "fmt ");
         view.setUint32(16, 16, true); // Size = 16 for PCM

         // Format = 1 for PCM
         view.setUint16(20, 1, true);
      
         // Is it stereo(2 Channels)?
         view.setUint16(22, channelCount, true);
         view.setUint32(24, sampleRate, true);
         view.setUint32(28, sampleRate * 4, true);
         view.setUint16(32, channelCount * 2, true);
         view.setUint16(34, 16, true); // Bits per sample
      
         // data sub-chunk
         this.writeString(view, 36, "data");
         view.setUint32(40, buff.length*2, true); // Size = 16 for PCM

         // Data are stored as 2's complement
         for (var iX=0,iY=44; iX<buff.length; iX++,iY+=2) {
            snd = Math.max(-1, Math.min(1, buff[iX]));
            view.setInt16(iY, snd < 0 ? snd * 0x8000 : snd * 0x7FFF, true);
         }
         console.log("view size = " + iY);

         return view;
      }

      // This is the wav packaging function
      this.packageWAVFile = function() {
         // Merge the buffer pieces into one
         // First the left buffer
         var leftBuffer = new Float32Array(recordingLength);
         var ixOut = 0;
         var cnt = leftChannel.length;
         for (var ixIn=0; ixIn<cnt; ixIn++) {
            leftBuffer.set(leftChannel[ixIn], ixOut);
            ixOut += leftChannel[ixIn].length;
         }
         var finalBuffer = leftBuffer;
      
         // Now the right buffer - IF it's stereo
         if (channelCount > 1 ) {
            var rightBuffer = new Float32Array(recordingLength);
            ixOut = 0;
            cnt = rightChannel.length;
            for (ixIn=0; ixIn<cnt; ixIn++) {
               rightBuffer.set(rightChannel[ixIn], ixOut);
               ixOut += rightChannel[ixIn].length;
            }
            // Now interleave the two stereo channels
            cnt = leftBuffer.length + rightBuffer.length;
            finalBuffer = new Float32Array(cnt);
       
            var ixIn = ixOut = 0;
            while (ixOut<cnt) {
               finalBuffer[ixOut++] = leftBuffer[ixIn];
               finalBuffer[ixOut++] = rightBuffer[ixIn++];
            }
         }

         // Fill the view with the data in the buffer
         var view = this.CreateWAVContainer(finalBuffer);

         // our final binary blob that we can hand off
         var blob = new Blob([ view ], { type : 'audio/wav' });
         return blob;
      }

      
      var target = null;
      this.sendSocketWav = function(wavFile, elem) {
         var data = wavFile;
         socket = new WebSocket("wss://demoforjohn.mybluemix.net/ws/audioin");
         socket.binaryType = "blob";
         target = elem;
         socket.onopen = function() {
            socket.send(data);
         }
         socket.onerror = function() {
            console.log("SOCKET ERROR");
         }
         socket.onmessage = function(evt) {
            console.log("RECEIVED:" + evt.data);
            if (target)
               target.innerHTML = evt.data;
            socket.close();
         }
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
               console.log("POSTed the data OK");
            }
         });
      }

      this.forceDownload = function(blob, filename) {
         var url = (window.URL || window.webkitURL).createObjectURL(blob);
         var link = document.getElementById("downlink");
         link.href = url;
         link.download = filename || 'output.wav';
      }
      
      this.askWatson = function(output) {
         isRecording = true;
         var wavfile = this.packageWAVFile();
         //this.forceDownload(wavfile);

         this.sendSocketWav(wavfile,output);
         audioContext.close();
      }


      // Start audio processing. The process passes the audio data through a
      // bunch of nodes, and we can simply add our own which is called
      // each time data is available.
      this.initialiseRecorder = function(stream) {
          audioContext = new AudioContext();
      
          // Create an AudioNode from the stream.
          var audioIn = audioContext.createMediaStreamSource(stream);

          // From the spec: This value controls how frequently the audioprocess event is 
          // dispatched and how many sample-frames need to be processed each call. 
          // Lower values for buffer size will result in a lower(better) latency. 
          // Higher values will be necessary to avoid audio breakup and glitches.
          if (audioContext.createScriptProcessor) {
             var recorder = audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
          } else {
             var recorder = audioContext.createJavaScriptNode(bufferSize, channelCount, channelCount);
          }
       
          // Process the audio data as it arrives
          recorder.onaudioprocess = function(evt){
              if (isRecording) {
                 var left = evt.inputBuffer.getChannelData(0);
                 leftChannel.push(new Float32Array(left));
                 recordingLength += bufferSize;

                 // if stereo, we include the right channel
                 if (channelCount > 1) {
                    var right = evt.inputBuffer.getChannelData(1);
                    rightChannel.push(new Float32Array(right));
                    recordingLength += bufferSize;
                 }
              }
          }
       
          // we connect the recorder ...
          audioIn.connect(recorder);

          // ... and connect the prefious destination
          recorder.connect(audioContext.destination); 

          // retrieve the current sample rate to be used for WAV packaging
          sampleRate = audioContext.sampleRate;
      
          isRecording = true;
      }
      
      // This is the entry point - nothing else should be used!
      this.startRecording = function() {
         // Make sure we have the correct objects available
         navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
                                  navigator.msGetUserMedia || navigator.mediaDevices.getUserMedia ||
                                  navigator.mozGetUserMedia;
         window.AudioContext = window.AudioContext || window.webkitAudioContext;

         // Initialise the lengths
         leftChannel.length = rightChannel.length = recordingLength = 0;

         // Start recording
         navigator.getUserMedia({audio:true, vide:false}, this.initialiseRecorder, function() { console.log("ERROR!!"); });
      }
}

      
