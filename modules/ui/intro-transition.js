(function(){
      var box=document.getElementById("intro"), video=document.getElementById("introVideo");
      if(!box||!video||document.documentElement.classList.contains("no-intro"))return;
      // WebKit can advertise VP9 without rendering the WebM alpha channel.
      // Keep the original MP4 as a safe fallback, blending out its white pixels.
      var ua=navigator.userAgent||"";
      var chromium=/Chrome|Chromium|Edg|OPR/.test(ua)&&!/iPhone|iPad|iPod/.test(ua)&&!(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
      var alpha=chromium&&!!video.canPlayType('video/webm; codecs="vp9, opus"');
      if(alpha){
        var source=document.createElement("source");
        source.src="./afriflow-intro-transparent-v1.webm";source.type='video/webm; codecs="vp9, opus"';
        video.insertBefore(source,video.firstChild);
        video.load();
      }
      function syncBlend(){box.classList.toggle("af-intro-mp4",!/\.webm(?:$|[?#])/.test(video.currentSrc||""));}
      video.addEventListener("loadedmetadata",syncBlend);
      video.addEventListener("playing",function(){
        syncBlend();
        function reveal(){box.classList.add("af-intro-playing");}
        if(video.requestVideoFrameCallback){video.requestVideoFrameCallback(reveal);setTimeout(reveal,250);}
        else requestAnimationFrame(reveal);
      },{once:true});
    })();
